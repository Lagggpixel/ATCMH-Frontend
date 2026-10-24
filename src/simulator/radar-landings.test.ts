import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {advance, applyEnvelope, autoReadbacks, engineFor, restoreExercise} from "./engine";
import {airportList, getAirport, runwayEnds} from "./airports";
import {radarHeading, radarEnvironmentFor} from "./radar";
import {exerciseSchema} from "./protocol";
import {ReplayTimeline, replayDelta} from "./replays";
import type {Action, Aircraft, ApproachType, Exercise} from "./model";

type Arrival = ApproachType | "vectors";
function send(state: Exercise, action: Action) {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action});assert.equal(result.error, undefined);return result.state;
}
function setup(type: Arrival, outcome: Aircraft["landing"], automatic = false, code = "EGPH", station: "approach" | "center" = "approach", runway?: string) {
  const engine=engineFor({airport:code,trainingStation:`${code}:${station}`});let state=engine.initialExercise();
  state.running=true;state.autoReadback=automatic;const a=state.aircraft[0],airport=getAirport(state);
  delete a.radar!.report;a.landing=outcome;a.radar!.flight="return";
  const p=state.radarEnvironment!.approaches.find(p=>p.type===(type==="vectors"?"visual":type)&&(p.type!=="ils"||p.glideslope!==false)&&(!runway||p.runway===runway))!;
  const g=engine.runwayGeometry(p.runway);a.runway=p.runway;a.speed=a.targetSpeed=180;a.speedMode="auto";
  if(type==="vectors"){
    const points=engine.patternTargets(a);a.position={x:(points.crosswind.x+points.downwind.x)/2,y:(points.crosswind.y+points.downwind.y)/2};
    a.heading=a.targetHeading=radarHeading(points.crosswind,points.downwind);a.altitude=airport.elevation+1500;
  }else{
    a.position={x:g.threshold.x-g.vector.x*8,y:g.threshold.y-g.vector.y*8};a.heading=a.targetHeading=g.heading;
    a.altitude=Math.ceil((airport.elevation+2000)/500)*500;a.radar!.requestedApproach=p.id;
    if(type==="gps")a.flightPlan=[{x:g.threshold.x-g.vector.x*5,y:g.threshold.y-g.vector.y*5,finalApproachFix:true},{...g.threshold}];
  }
  state=send(state,{kind:"maneuver",aircraftId:a.id,command:{type:"expect-approach",approachId:type==="vectors"?null:p.id,vectors:type==="vectors"}});
  if(type!=="vectors")state=send(state,{kind:"maneuver",aircraftId:a.id,command:{type:"vector",approachId:p.id}});
  state=send(state,{kind:"maneuver",aircraftId:a.id,command:{type:"frequency",frequency:"tower"}});
  return {state,airport,g};
}
function complete(initial: ReturnType<typeof setup>, outcome: Aircraft["landing"]) {
  let state=initial.state,touchdown: Exercise|undefined,vacating: Exercise|undefined;const id=state.aircraft[0].id;
  for(let t=0;t<900;t+=.5){
    const prior=state;
    state=autoReadbacks(advance(state,.5),t*1000,randomUUID);const a=state.aircraft.find(a=>a.id===id);
    if(a?.radar?.arrival?.phase==="vacating")vacating??=structuredClone(state);
    if(!a){
      assert.equal(outcome,"full-stop");assert.ok(touchdown);assert.ok(vacating,"must turn onto a mapped exit before despawning");
      const last=prior.aircraft.find(a=>a.id===id)!;const dx=last.position.x-initial.g.threshold.x,dy=last.position.y-initial.g.threshold.y;
      assert.ok(Math.abs(dx*-initial.g.vector.y+dy*initial.g.vector.x)>=initial.g.clearance-35*.5/3600-1e-7,"must remain visible until within one movement tick of clearing the protected runway area");
      assert.ok(exerciseSchema.safeParse(vacating).success);assert.ok(exerciseSchema.safeParse(state).success);
      const restored=restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(vacating))));
      // Reloading must finish within the same simulated time as uninterrupted movement.
      while(restored.elapsed<state.elapsed&&restored.aircraft.some(a=>a.id===id)){Object.assign(restored,advance(restored,.5));}
      assert.ok(!restored.aircraft.some(a=>a.id===id),"restored vacating traffic must finish and despawn");
      const replay=new ReplayTimeline(touchdown,[{sequence:1,at:t,delta:replayDelta(touchdown,state),interpolate:false}]);assert.deepEqual(replay.at(t),state);
      return {state,touchdown,vacating};
    }
    assert.ok(a.active,"landing aircraft must remain visible through touchdown and rollout");
    if(a.radar?.arrival?.phase==="rollout"){
      const along=(a.position.x-initial.g.threshold.x)*initial.g.vector.x+(a.position.y-initial.g.threshold.y)*initial.g.vector.y;
      const pair=initial.airport.runways!.find(pair=>pair.ends.some(end=>end.id===a.runway))!;
      const length=Math.hypot(pair.ends[1].point.x-pair.ends[0].point.x,pair.ends[1].point.y-pair.ends[0].point.y);
      assert.ok(along<=length+.001,"landing rollout must brake before overrunning the runway");
    }
    if(a.altitude===initial.airport.elevation&&["rollout","takeoff","parked"].includes(a.mode))touchdown??=structuredClone(state);
    if (a.radar?.arrival?.phase === "stopped") {
      assert.equal(outcome, "full-stop"); assert.ok(touchdown);
      assert.equal(vacating, undefined, "no forward mapped exit remains ahead of touchdown");
      const engine = engineFor(state), position = {...a.position};
      const along = (position.x-initial.g.threshold.x)*initial.g.vector.x+(position.y-initial.g.threshold.y)*initial.g.vector.y;
      assert.ok(along >= .1 && along < engine.distance(initial.g.threshold, initial.g.departure), "must stop on the runway after physically touching down");
      assert.equal(engine.runwayExitRoute(a, "any").path, undefined);
      assert.ok(exerciseSchema.safeParse(state).success);
      let restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
      const stopped = structuredClone(state);
      for (let wait = 0; wait < 120; wait++) {
        const before = structuredClone(state), prediction = engine.predictAircraft(state.aircraft, 1);
        assert.deepEqual(state, before, "render prediction must leave the authoritative wait unchanged");
        state = advance(state, 1); restored = advance(restored, 1);
        assert.equal(state.aircraft.length, 1, "waiting traffic remains visible");
        const held = state.aircraft[0];
        assert.equal(held.active, true); assert.equal(held.mode, "parked"); assert.equal(held.holding, true);
        assert.equal(held.radar!.arrival!.phase, "stopped"); assert.equal(held.speed, 0); assert.equal(held.targetSpeed, 0);
        assert.equal(held.altitude, initial.airport.elevation); assert.equal(held.runwayExit, undefined);
        assert.deepEqual(held.position, position, "waiting cannot reverse, overrun, or drift");
        for (const candidate of [prediction[0], restored.aircraft[0]]) {
          assert.deepEqual(candidate.position, held.position); assert.equal(candidate.mode, held.mode);
          assert.equal(candidate.speed, held.speed); assert.equal(candidate.targetSpeed, held.targetSpeed);
          assert.deepEqual(candidate.radar!.arrival, held.radar!.arrival);
        }
        assert.ok(exerciseSchema.safeParse(state).success); assert.ok(exerciseSchema.safeParse(restored).success);
      }
      const replay = new ReplayTimeline(stopped, [{sequence:1, at:state.elapsed, delta:replayDelta(stopped,state), interpolate:false}]);
      assert.deepEqual(replay.at(state.elapsed), state);
      return {state, touchdown};
    }
    if(outcome==="touch-and-go"&&a.frequency==="approach"&&!a.radar!.departure&&state.messages.some(m=>m.request?.id === "check-in" && m.frequency === "approach")){
      assert.ok(touchdown,"must physically reach runway elevation before stopping or climbing out");
      assert.ok(exerciseSchema.safeParse(touchdown).success);assert.ok(exerciseSchema.safeParse(state).success);
      const restored=restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(touchdown))));assert.equal(restored.aircraft[0].landing,outcome);
      const replay=new ReplayTimeline(touchdown,[{sequence:1,at:t,delta:replayDelta(touchdown,state),interpolate:false}]);assert.deepEqual(replay.at(t),state);
      if(outcome==="full-stop"){
        assert.equal(a.altitude,initial.airport.elevation);assert.equal(a.frequency,"tower");
        assert.equal(state.messages.filter(m=>m.request?.id === "check-in" && m.frequency === "approach").length,0);
      }else{
        assert.ok(a.altitude>=initial.airport.elevation+1000);assert.equal(a.heading,initial.g.heading);assert.equal(a.targetHeading,initial.g.heading);
        assert.equal(state.messages.filter(m=>m.request?.id === "check-in" && m.frequency === "approach").length,1);
        assert.equal(state.messages.find(m=>m.request?.id === "check-in" && m.frequency === "approach")!.frequency,"approach");
      }
      for(let i=0;i<10;i++)state=autoReadbacks(advance(state,1),1e6+i*1000,randomUUID);
      assert.equal(state.messages.filter(m=>m.request?.id === "check-in" && m.frequency === "approach").length,outcome==="touch-and-go"?1:0);
      return {state,touchdown};
    }
  }
  assert.fail(`did not complete ${outcome}: ${JSON.stringify(state.aircraft[0].radar)} / ${state.aircraft[0].mode}`);
}
for(const type of["ils","gps","visual","vectors"]as const)for(const outcome of["full-stop","touch-and-go"]as const)for(const automatic of[false,true])test(`${type} ${outcome}, automatic ${automatic}: Tower arrival follows landing intention`,()=>{
  complete(setup(type,outcome,automatic),outcome);
});
test("Center touch-and-go also contacts Approach on runway-heading climbout",()=>{complete(setup("ils","touch-and-go",false,"EGPH","center"),"touch-and-go");});
test("changing landing intention before touchdown determines the actual outcome",()=>{
  const f=setup("gps","full-stop");f.state=send(f.state,{kind:"edit",aircraftId:f.state.aircraft[0].id,patch:{landing:"touch-and-go"}});complete(f,"touch-and-go");
});
for(const airport of airportList.filter(a=>a.icao!=="EGPH"))for(const type of (["ils","gps","visual","vectors"]as const).filter(type=>radarEnvironmentFor(airport).approaches.some(p=>p.type===(type==="vectors"?"visual":type)&&(p.type!=="ils"||p.glideslope!==false))))for(const outcome of["full-stop","touch-and-go"]as const)test(`${airport.icao} ${type}: ${outcome} completes at the selected airport`,()=>{
  complete(setup(type,outcome,false,airport.icao),outcome);
});

for(const airport of airportList)for(const runway of runwayEnds(airport).filter(end=>radarEnvironmentFor(airport).approaches.some(p=>p.runway===end.id))) {
  // Pinned LIME 12 has a turnpad ahead, but its only off-runway taxiway is
  // behind touchdown. Forward-only automatic arrivals must await instruction.
  const awaitingBackTaxi = airport.icao === "LIME" && runway.id === "12";
  test(`${airport.icao} runway ${runway.id}: full-stop ${awaitingBackTaxi ? "stops within runway awaiting explicit back-taxi" : "vacates mapped exit and despawns"}`,()=>{
    complete(setup("visual","full-stop",false,airport.icao,"approach",runway.id),"full-stop");
  });
}

for(const airport of airportList)for(const runway of runwayEnds(airport).filter(end=>radarEnvironmentFor(airport).approaches.some(p=>p.runway===end.id)))test(`${airport.icao} ${runway.id}: saved stopped traffic uses forward exits or safely awaits an explicit back-taxi instruction`,()=>{
  const f=setup("visual","full-stop",false,airport.icao,"approach",runway.id),engine=engineFor(f.state),g=engine.runwayGeometry(runway.id),a=f.state.aircraft[0];
  a.position={x:g.threshold.x+(g.departure.x-g.threshold.x)*.97,y:g.threshold.y+(g.departure.y-g.threshold.y)*.97};
  a.mode="parked";a.altitude=airport.elevation;a.speed=0;a.targetSpeed=0;
  a.radar={station:"approach",navigation:"heading",routeIndex:0,transferred:true,arrival:{runway:runway.id,phase:"stopped"}};
  assert.ok(exerciseSchema.safeParse(f.state).success);
  const forward = !!engine.runwayExitRoute(a, "any").path, originalPosition = {...a.position};
  let state=f.state,vacated=false;
  for(let i=0;i<900;i++){
    const before=state,previous=before.aircraft[0];engine.predictAircraft(before.aircraft,1);assert.equal(before.aircraft[0],previous);
    state=advance(state,1);
    if(!state.aircraft.length){vacated=true;break;}
    assert.ok(Math.hypot(state.aircraft[0].position.x-previous.position.x,state.aircraft[0].position.y-previous.position.y)<.02,"exit taxi cannot teleport");
    assert.ok(exerciseSchema.safeParse(state).success);
    if (!forward) {assert.ok(Math.hypot(state.aircraft[0].position.x-originalPosition.x, state.aircraft[0].position.y-originalPosition.y)<1e-9, "an unavailable forward exit never causes an automatic back-taxi or overrun"); assert.equal(state.aircraft[0].speed, 0);}
  }
  if (forward) assert.ok(vacated,"old stopped aircraft with a forward exit must resume and despawn after vacating");
  else {assert.equal(vacated, false); assert.equal(state.aircraft.length, 1); assert.ok(Math.hypot(state.aircraft[0].position.x-originalPosition.x, state.aircraft[0].position.y-originalPosition.y)<1e-9);}
});
