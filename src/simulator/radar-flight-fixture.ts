import {trueToMagnetic} from "./magnetic-headings";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {advance,applyEnvelope,autoReadbacks,engineFor,restoreExercise} from "./engine";
import {getAirport} from "./airports";
import {approachGeometry,radarHeading,roundedHeadingInstruction} from "./radar";
import {exerciseSchema,menteeActionAllowed} from "./protocol";
import {ReplayTimeline,replayDelta} from "./replays";
import type {Action,Aircraft,ApproachType,Exercise,Instruction,Point} from "./model";

type Arrival=ApproachType|"vectors";
export function send(state:Exercise,action:Action){const result=applyEnvelope(state,{id:randomUUID(),time:state.elapsed*1000,action});assert.equal(result.error,undefined);return result.state;}
export function fly(state:Exercise,seconds:number){for(let t=0;t<seconds;t+=.5)state=autoReadbacks(advance(state,Math.min(.5,seconds-t)),state.elapsed*1000,randomUUID);return state;}
export function until(state:Exercise,predicate:(s:Exercise)=>boolean,seconds=900){for(let t=0;t<seconds;t+=.5){state=fly(state,.5);if(predicate(state))return state;}assert.fail(`Flight did not complete: ${JSON.stringify(state.aircraft[0])}`);}
export function issue(state:Exercise,command:Instruction){
 const a=state.aircraft[0],action:Action={kind:"command",aircraftId:a.id,frequency:a.frequency!,command,text:""};
 assert.ok(menteeActionAllowed(action,state),"learner must be able to control the aircraft on its returning Approach frequency");
 state=send(state,action);const message=state.messages.at(-1)!;
 return state.autoReadback?fly(state,2):send(state,{kind:"pilot",aircraftId:a.id,text:"Read back",replyTo:message.id,assign:true});
}
export function first(type:Arrival,automatic:boolean,station:"approach"|"center"="approach"){
 const engine=engineFor({airport:"EGPH",trainingStation:`EGPH:${station}`});let state=engine.initialExercise();state.running=true;state.autoReadback=automatic;
 const a=state.aircraft[0],airport=getAirport(state),p=state.radarEnvironment!.approaches.find(p=>p.type===(type==="vectors"?"ils":type)&&p.runway==="24")!,g=approachGeometry(airport,p.runway);
 a.landing="touch-and-go";a.runway=p.runway;a.speed=a.targetSpeed=180;a.speedMode="auto";delete a.radar!.report;
 if(type==="gps")a.flightPlan=[{x:g.threshold.x-g.vector.x*5,y:g.threshold.y-g.vector.y*5,finalApproachFix:true},{...g.threshold}];
 if(type==="vectors"){const points=engine.patternTargets(a);a.position={x:(points.crosswind.x+points.downwind.x)/2,y:(points.crosswind.y+points.downwind.y)/2};a.heading=a.targetHeading=radarHeading(points.crosswind,points.downwind);a.altitude=airport.elevation+1500;}
 else{a.position={x:g.threshold.x-g.vector.x*8,y:g.threshold.y-g.vector.y*8};a.heading=a.targetHeading=g.heading;a.altitude=2500;}
 state=issue(state,{type:"expect-approach",approachId:type==="vectors"?null:p.id,vectors:type==="vectors"});
 if(type!=="vectors")state=issue(state,{type:"vector",approachId:p.id});
 state=issue(state,{type:"frequency",frequency:"tower"});
 return until(state,s=>s.aircraft[0].frequency==="approach"&&!s.aircraft[0].radar!.departure);
}
export function vectorToApproach(state:Exercise,type:ApproachType,runway="24"){
 const airport=getAirport(state),p=state.radarEnvironment!.approaches.find(p=>p.type===type&&p.runway===runway)!,g=approachGeometry(airport,runway);
 if(type==="gps")state=send(state,{kind:"edit",aircraftId:state.aircraft[0].id,patch:{flightPlan:[{x:g.threshold.x-g.vector.x*5,y:g.threshold.y-g.vector.y*5,finalApproachFix:true},{...g.threshold}],radar:{...state.aircraft[0].radar!,routeIndex:0}}});
 state=issue(state,{type:"expect-approach",approachId:p.id});
 assert.equal(state.aircraft[0].radar!.captured,false);assert.equal(state.aircraft[0].radar!.localizer,false);assert.equal(state.aircraft[0].radar!.glideslope,false);
 const point=(along:number,lateral:number):Point=>({x:g.threshold.x+g.vector.x*along-g.vector.y*lateral,y:g.threshold.y+g.vector.y*along+g.vector.x*lateral});
 const initial=state.aircraft[0].position,along=(initial.x-g.threshold.x)*g.vector.x+(initial.y-g.threshold.y)*g.vector.y;
 for(const waypoint of [point(Math.max(4,along+3),6),point(-12,6),point(-12,1)]){
   let reached=false;
   for(let t=0;t<600;t+=5){
     const a=state.aircraft[0];if(Math.hypot(a.position.x-waypoint.x,a.position.y-waypoint.y)<1.5){reached=true;break;}
     state=issue(state,{type:"vector",heading:trueToMagnetic(radarHeading(a.position,waypoint),getAirport(state)),altitude:{unit:"feet",value:2000}});state=fly(state,5);
   }
   assert.ok(reached,"aircraft must fly vectors from climbout to the next final without repositioning");
 }
 if(type==="gps")for(let t=0;t<120;t+=2){
   const a=state.aircraft[0],candidate:Instruction={type:"vector",heading:trueToMagnetic(radarHeading(a.position,point(-7,0)),airport),altitude:{unit:"feet",value:2000},approachId:p.id};
   if(!engineFor(state).validateAssignment(a,roundedHeadingInstruction(candidate)))break;
   state=issue(state,{type:"vector",heading:candidate.heading,altitude:{unit:"feet",value:2000}});state=fly(state,2);
 }
 state=issue(state,{type:"vector",heading:trueToMagnetic(radarHeading(state.aircraft[0].position,point(-7,0)),getAirport(state)),altitude:{unit:"feet",value:2000},approachId:p.id});
 state=until(state,s=>!!s.aircraft[0].radar!.captured,300);
 assert.equal(state.aircraft[0].radar!.cleared,p.id);assert.ok(exerciseSchema.safeParse(state).success);
 return state;
}
export function finishApproach(state:Exercise){
 const a=state.aircraft[0],outcome=a.landing,airport=getAirport(state),p=state.radarEnvironment!.approaches.find(p=>p.id===a.radar!.cleared)!,g=approachGeometry(airport,p.runway);
 const snapshot=state;state=restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
 state=issue(state,{type:"frequency",frequency:"tower"});assert.equal(state.aircraft[0].radar!.patternJoin,undefined,"a new approach must not retain the earlier vectored pattern");
 const reports=state.messages.filter(m=>m.request?.id === "check-in" && m.frequency === "approach").length;
 let touchdown=false,vacating=false;
 state=until(state,s=>{
  const a=s.aircraft[0];if(!a)return outcome==="full-stop";
  if(a.altitude===airport.elevation&&["rollout","takeoff"].includes(a.mode))touchdown=true;
  if(a.radar!.arrival?.phase==="vacating")vacating=true;
  return outcome==="touch-and-go"&&a.frequency==="approach"&&!a.radar!.departure;
 });
 assert.ok(touchdown,"the second approach must physically touch down");
 if(outcome==="full-stop"){assert.ok(vacating);assert.equal(state.aircraft.length,0);}
 else{assert.equal(state.aircraft[0].landing,"touch-and-go");assert.ok(Math.abs(state.aircraft[0].heading-g.heading)<1e-6);assert.equal(state.messages.filter(m=>m.request?.id === "check-in" && m.frequency === "approach").length,reports+1);assert.equal(fly(state,10).messages.filter(m=>m.request?.id === "check-in" && m.frequency === "approach").length,reports+1);}
 assert.ok(exerciseSchema.safeParse(state).success);
 const replay=new ReplayTimeline(snapshot,[{sequence:1,at:state.elapsed,delta:replayDelta(snapshot,state),interpolate:false}]);assert.deepEqual(replay.at(state.elapsed),state);
 return state;
}

export function vectorBack(state:Exercise,type:ApproachType,outcome:Aircraft["landing"],runway="24"){
 state=send(state,{kind:"edit",aircraftId:state.aircraft[0].id,patch:{landing:outcome}});
 return finishApproach(vectorToApproach(state,type,runway));
}
