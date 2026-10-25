import assert from "node:assert/strict";
import test from "node:test";
import {engineFor,restoreExercise} from "./engine";
import {getAirport,controlledFrequencies} from "./airports";
import {approachGeometry} from "./radar";
import {exerciseSchema,menteeActionAllowed} from "./protocol";
import {fly,issue,send,until,vectorBack,trafficHandoff} from "./radar-flight-fixture";
import type {ApproachType} from "./model";

type Trigger="commanded"|"pilot-after-tower"|"automatic"|"threshold"|"unstable-tower";
function missed(type:ApproachType,trigger:Trigger,automatic:boolean,station:"approach"|"center"="approach"){
 let state=engineFor({airport:"EGPH",trainingStation:`EGPH:${station}`}).initialExercise();state.running=true;state.autoReadback=automatic;
 const a=state.aircraft[0],airport=getAirport(state),p=state.radarEnvironment!.approaches.find(p=>p.type===type&&p.runway==="24")!,g=approachGeometry(airport,p.runway);
 a.position={x:g.threshold.x-g.vector.x*8,y:g.threshold.y-g.vector.y*8};a.heading=a.targetHeading=g.heading;a.altitude=2500;a.speed=a.targetSpeed=180;a.speedMode="auto";delete a.radar!.report;
 if(type==="gps")a.flightPlan=[{x:g.threshold.x-g.vector.x*7.5,y:g.threshold.y-g.vector.y*7.5,finalApproachFix:true},{...g.threshold}];
 a.landing="touch-and-go"; // A missed approach must preserve this intention without touching down.
 state=issue(state,{type:"expect-approach",approachId:p.id});
 if(trigger==="automatic")state.aircraft[0].altitude=airport.elevation+51+(type==="visual"?500:type==="gps"?100:0)+8*6076.12*Math.tan(p.glideAngle*Math.PI/180);
 state=issue(state,{type:"vector",approachId:p.id});
 if(trigger==="automatic")state=until(state,s=>s.aircraft[0].radar!.navigation==="missed",type==="gps"?20:3);
 else{
  state=until(state,s=>!!s.aircraft[0].radar!.captured,300);
  if(trigger==="commanded")state=issue(state,{type:"missed-approach",altitude:{unit:"feet",value:5000}});
  else if(trigger==="pilot-after-tower"){
   state=issue(state,trafficHandoff(state));
   state=send(state,{kind:"pilot",aircraftId:a.id,text:"",request:{id:state.aircraft[0].frequency === "unicom" ? "unicom-go-around" : "missed-approach",runway:p.runway}});
  }else if(trigger==="threshold")state=until(state,s=>s.aircraft[0].radar!.navigation==="missed");
  else{
   state=issue(state,trafficHandoff(state));
   // A saved, unstable final beyond the touchdown zone must miss instead of landing.
   const g2=engineFor(state).runwayGeometry(p.runway),length=Math.hypot(g2.departure.x-g2.threshold.x,g2.departure.y-g2.threshold.y),a=state.aircraft[0];
   a.position={x:g.threshold.x+g.vector.x*(length-.01),y:g.threshold.y+g.vector.y*(length-.01)};a.altitude=airport.elevation+1100;
   state=until(state,s=>s.aircraft[0].radar!.navigation==="missed",5);
  }
 }
 assert.equal(state.aircraft[0].radar!.navigation,"missed");const missedAt=state;
 assert.equal(state.aircraft[0].radar!.captured,false);assert.equal(state.aircraft[0].radar!.localizer,false);assert.equal(state.aircraft[0].radar!.glideslope,false);
 state=until(state,s=>(s.aircraft[0].frequency===station||s.aircraft[0].frequency==="approach")&&s.aircraft[0].altitude>=airport.elevation+1000);
 const b=state.aircraft[0];assert.ok(b.active);assert.ok(b.altitude>missedAt.aircraft[0].altitude||missedAt.aircraft[0].altitude>=airport.elevation+1000);
 assert.equal(b.landing,"touch-and-go");assert.equal(b.radar!.arrival,undefined);assert.equal(b.radar!.departure,undefined);assert.equal(b.radar!.patternJoin,undefined);
 assert.equal(b.clearedToLand,false);assert.equal(b.clearedForOption,false);
 if(trigger==="pilot-after-tower"||trigger==="unstable-tower"){
  assert.equal(b.frequency,"approach");assert.equal(b.radar!.transferred,false);assert.ok(controlledFrequencies(state).includes("approach"));
  assert.equal(state.messages.filter(m=>m.text.includes("executing missed approach")&&m.frequency==="approach").length,1);
 }
 const before=state.messages.length;state=fly(state,10);assert.equal(state.messages.length,before,"missed report must not repeat on every tick");
 assert.ok(exerciseSchema.safeParse(state).success);state=restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
 assert.ok(menteeActionAllowed({kind:"command",aircraftId:b.id,frequency:state.aircraft[0].frequency!,text:"",command:{type:"vector",heading:90,altitude:{unit:"feet",value:3000}}},state));
 return state;
}
for(const from of["ils","gps","visual"]as const)for(const to of["ils","gps","visual"]as const)for(const outcome of["full-stop","touch-and-go"]as const)for(const trigger of(from==="visual"?["commanded","pilot-after-tower"]as const:["commanded","pilot-after-tower","automatic"]as const))for(const automatic of trigger==="automatic"?[true]:[false,true])test(`${from} ${trigger} missed to ${to} ${outcome}, Automatic ${automatic}`,()=>{vectorBack(missed(from,trigger,automatic),to,outcome);});
for(const type of["ils","gps","visual"]as const)for(const outcome of["full-stop","touch-and-go"]as const)test(`Center Tower missed returns on Approach for ${type} ${outcome}`,()=>{vectorBack(missed("ils","pilot-after-tower",false,"center"),type,outcome);});
for(const type of["ils","gps","visual"]as const)for(const trigger of["threshold","unstable-tower"]as const)test(`${type} ${trigger}: automatic missed can be vectored for another approach`,()=>{vectorBack(missed(type,trigger,false),type,"full-stop");});

test("a vectored-pattern missed approach clears circuit guidance and can return for ILS",()=>{
 let state=engineFor({airport:"EGPH",trainingStation:"EGPH:approach"}).initialExercise();state.running=true;state.autoReadback=false;
 const a=state.aircraft[0],points=engineFor(state).patternTargets(a);a.position={x:(points.crosswind.x+points.downwind.x)/2,y:(points.crosswind.y+points.downwind.y)/2};a.altitude=getAirport(state).elevation+1500;
 state=issue(state,{type:"expect-approach",approachId:null,vectors:true});state=issue(state,trafficHandoff(state));
 assert.ok(state.aircraft[0].radar!.patternJoin);
 state=send(state,{kind:"pilot",aircraftId:a.id,text:"",request:{id:state.aircraft[0].frequency === "unicom" ? "unicom-go-around" : "missed-approach",runway:a.runway!}});state=until(state,s=>s.aircraft[0].frequency==="approach",5);
 assert.equal(state.aircraft[0].radar!.guidance,undefined);assert.equal(state.aircraft[0].radar!.patternJoin,undefined);vectorBack(state,"ils","full-stop");
});
test("a low assigned missed altitude still permits the Tower-to-Approach return",()=>{
 let state=engineFor({airport:"EGPH",trainingStation:"EGPH:approach"}).initialExercise();state.running=true;state.autoReadback=false;
 const a=state.aircraft[0],p=state.radarEnvironment!.approaches.find(p=>p.runway===a.runway)!,g=approachGeometry(getAirport(state),p.runway);
 a.position={x:g.threshold.x-g.vector.x*.5,y:g.threshold.y-g.vector.y*.5};a.heading=a.targetHeading=g.heading;a.altitude=getAirport(state).elevation+300;a.frequency="tower";
 Object.assign(a.radar!,{navigation:"approach",expected:p.id,cleared:p.id,captured:true,transferred:true});delete a.radar!.report;
 state=send(state,{kind:"maneuver",aircraftId:a.id,command:{type:"missed-approach",altitude:{unit:"feet",value:1000}}});state=until(state,s=>s.aircraft[0].frequency==="approach",60);
 assert.ok(state.aircraft[0].altitude<=1000);assert.equal(state.aircraft[0].radar!.targetAltitude!.value,1000);assert.equal(state.messages.filter(m=>m.text.includes("executing missed approach")).length,1);
});
