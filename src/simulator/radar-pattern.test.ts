import {trafficHandoff} from "./radar-flight-fixture";
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor, applyEnvelope, advance, autoReadbacks, restoreExercise} from "./engine";
import {airportList, getAirport} from "./airports";
import {approachGeometry, radarHeading, radarGuidanceLabel} from "./radar";
import {exerciseSchema} from "./protocol";
import {DEFAULTS, type Action, type Exercise} from "./model";
import {withFixedReadbackDelay} from "./test-exercise";

function send(state: Exercise, action: Action, id = randomUUID()) {
  const result = applyEnvelope(state, {id, time: 1000, action});assert.equal(result.error, undefined);return result.state;
}
function fixture(code = "EGPH", hand: "left" | "right" = "left") {
  const engine = engineFor({airport: code, trainingStation: `${code}:approach`}), state = withFixedReadbackDelay(engine.initialExercise());
  state.aircraft[0].hand = hand;delete state.aircraft[0].radar!.report;
  const a = state.aircraft[0], points = engine.patternTargets(a);
  a.position = {x: (points.crosswind.x + points.downwind.x) / 2, y: (points.crosswind.y + points.downwind.y) / 2};
  a.heading = a.targetHeading = radarHeading(points.crosswind, points.downwind);
  a.altitude = getAirport(state).elevation + DEFAULTS.patternHeight;
  a.speed = a.targetSpeed = 180;state.running = true;state.autoReadback = false;
  return send(state, {kind: "maneuver", aircraftId: a.id, command: {type: "expect-approach", approachId: null, vectors: true}});
}
const transfer = (state: Exercise) => send(state, {kind: "maneuver", aircraftId: state.aircraft[0].id, command: {type: "frequency", frequency: "tower"}});
function fly(state: Exercise, seconds: number) {for(let remaining=seconds;remaining>0;remaining-=Math.min(5,remaining))state=advance(state,Math.min(5,remaining));return state;}

for(const airport of airportList)for(const hand of ["left","right"] as const)test(`${airport.icao}: Tower handoff joins the ${hand} local pattern without teleporting`,()=>{
  let state=fixture(airport.icao,hand);const before=structuredClone(state.aircraft[0]);
  assert.equal(state.aircraft[0].radar!.patternJoin,undefined,"expecting vectors alone must not start a join");
  state=transfer(state);const a=state.aircraft[0];
  assert.deepEqual(a.position,before.position);assert.equal(a.altitude,before.altitude);assert.equal(a.heading,before.heading);assert.equal(a.speed,before.speed);
  assert.equal(a.mode,"pattern");assert.equal(a.leg,"downwind");assert.equal(a.hand,hand);assert.equal(a.radar!.patternJoin!.status,"joining");
  state=fly(state,2);assert.equal(state.aircraft[0].radar!.patternJoin!.status,"established");
  assert.match(radarGuidanceLabel(state.aircraft[0],state.radarEnvironment!)!,/Local pattern/);
  assert.ok(exerciseSchema.safeParse(state).success);
  const restored=restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  assert.equal(restored.aircraft[0].radar!.patternJoin!.status,"established");
  state=fly(restored,180);assert.ok(state.aircraft[0].active);assert.ok(exerciseSchema.safeParse(state).success);
});
test("an infeasible handoff warns the mentor once and preserves assigned flight",()=>{
  let state=fixture();state.aircraft[0].altitude=50000;const before=structuredClone(state.aircraft[0]);
  state=transfer(state);const a=state.aircraft[0];
  assert.equal(a.radar!.patternJoin!.status,"unable");assert.ok(a.radar!.patternJoin!.reason);assert.equal(a.mode,"heading");
  assert.deepEqual(a.position,before.position);assert.equal(a.heading,before.heading);assert.equal(a.altitude,before.altitude);
  assert.equal(state.messages.filter(m=>m.text.includes("unable to join the local pattern")).length,1);
  assert.equal(state.messages.at(-1)!.unableReason,a.radar!.patternJoin!.reason);
  assert.ok(!state.messages.at(-1)!.text.includes(a.radar!.patternJoin!.reason!));
  state=send(state,{kind:"read",aircraftId:a.id});state=fly(state,10);
  assert.equal(state.messages.filter(m=>m.text.includes("unable to join the local pattern")).length,1);
  assert.ok(exerciseSchema.safeParse(state).success);
});
test("returning to radar control cancels the local pattern; a corrected handoff can retry",()=>{
  let state=transfer(fixture());const id=state.aircraft[0].id;
  state=send(state,{kind:"edit",aircraftId:id,patch:{frequency:"approach"}});
  assert.equal(state.aircraft[0].mode,"heading");assert.equal(state.aircraft[0].radar!.patternJoin,undefined);
  assert.ok(exerciseSchema.safeParse(state).success);
  state=transfer(state);assert.equal(state.aircraft[0].radar!.patternJoin!.status,"joining");
});
test("ILS clearance handed to Tower retains approach guidance and does not join the circuit",()=>{
  let state=fixture();const a=state.aircraft[0],p=state.radarEnvironment!.approaches.find(p=>p.type==="ils")!;
  state=send(state,{kind:"maneuver",aircraftId:a.id,command:{type:"expect-approach",approachId:p.id}});
  state=send(state,{kind:"maneuver",aircraftId:a.id,command:{type:"vector",approachId:p.id}});
  state=transfer(state);assert.equal(state.aircraft[0].radar!.navigation,"approach");assert.equal(state.aircraft[0].radar!.patternJoin,undefined);
});
for(const [along,lateral,turn,altitude]of[[-6,0,0,1800],[0,7,90,3000],[6,0,180,3500],[-20,10,0,8000]])test(`vectored traffic joins from current offset ${along}/${lateral} at ${altitude}ft`,()=>{
  let state=fixture();const a=state.aircraft[0],g=approachGeometry(getAirport(state),a.runway!);
  a.position={x:g.threshold.x+g.vector.x*along-g.vector.y*lateral,y:g.threshold.y+g.vector.y*along+g.vector.x*lateral};
  a.heading=a.targetHeading=(g.heading+turn)%360;a.altitude=altitude;
  const before=structuredClone(a.position);state=transfer(state);assert.deepEqual(state.aircraft[0].position,before);
  assert.notEqual(state.aircraft[0].radar!.patternJoin!.status,"unable");
  state=fly(state,1800);assert.equal(state.aircraft.length,0);assert.ok(exerciseSchema.safeParse(state).success);
});

test("the reported Edinburgh traffic handoff acquires downwind before turning base", () => {
  let state = fixture(); const a = state.aircraft[0];
  Object.assign(a, {runway: "24", hand: "left", position: {x: -3.95144, y: 4.6655}, heading: 80, targetHeading: 80, altitude: 1788, speed: 185, targetSpeed: 185});
  state = send(state, {kind: "maneuver", aircraftId: a.id, command: {type: "frequency", frequency: "unicom"}});
  assert.equal(state.aircraft[0].leg, "downwind");
  let established = false, base = false;
  for (let i = 0; i < 900 && state.aircraft.length; i++) {
    state = fly(state, 1); const flown = state.aircraft[0];
    if (flown.radar?.patternJoin?.status === "established") established = true;
    if (flown.leg === "base") {
      assert.ok(established); assert.ok(Math.abs(flown.altitude - (getAirport(state).elevation + DEFAULTS.patternHeight)) <= 1);
      base = true; break;
    }
    assert.equal(flown.leg, "downwind");
  }
  assert.ok(base, "the aircraft must acquire downwind and eventually turn base");
});

for (const side of [-1, 1] as const) for (const finalDistance of [6, 12]) for (const lateral of [3, 8.5]) for (const speed of [180, 219, 250]) for (const offset of [-45, -30, -15, 0, 15, 30, 45]) test(`Heathrow 27R joins ${side > 0 ? "left" : "right"} base at ${finalDistance}/${lateral} NM, ${speed} kt and ${offset}° offset`, () => {
  let state = fixture("EGLL"), a = state.aircraft[0]; a.runway = "27R";
  const airport = getAirport(state), g = approachGeometry(airport, a.runway);
  a.position = {x: g.threshold.x - g.vector.x * finalDistance - g.vector.y * side * lateral, y: g.threshold.y - g.vector.y * finalDistance + g.vector.x * side * lateral};
  a.heading = a.targetHeading = (g.heading + (side > 0 ? 90 : 270) + offset + 360) % 360;
  delete a.track; a.altitude = airport.elevation + DEFAULTS.patternHeight; a.speed = a.targetSpeed = speed;
  const before = structuredClone(a.position);
  state = side < 0 ? send(state, {kind: "maneuver", aircraftId: a.id, command: {type: "frequency", frequency: "unicom"}}) : transfer(state);
  a = state.aircraft[0];
  assert.deepEqual(a.position, before); assert.equal(a.leg, "base"); assert.equal(a.hand, side > 0 ? "left" : "right");
  assert.equal(a.radar!.patternJoin?.entry, "base");
  state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  let final = false, alignedFinalDistance = 0, landed = false;
  for (let i = 0; i < 1800 && state.aircraft.length; i++) {
    state = fly(state, 1); const flown = state.aircraft[0];
    if (!flown) {landed = true; break;}
    assert.notEqual(flown.mode, "go-around");
    if (flown.leg === "final") {
      final = true;
      if (!alignedFinalDistance && Math.abs(((flown.heading - g.heading + 540) % 360) - 180) <= 12) {
        alignedFinalDistance = -((flown.position.x - g.threshold.x) * g.vector.x + (flown.position.y - g.threshold.y) * g.vector.y);
      }
    }
    if (flown.radar?.arrival) {landed = true; break;}
  }
  assert.ok(final, "aircraft must join final"); assert.ok(alignedFinalDistance >= 3, `aligned final: ${alignedFinalDistance} NM`);
  assert.ok(landed, "aircraft must complete the landing");
});

test("a Traffic handoff selects the base after the pilot readback", () => {
  let state = fixture("EGLL"); const a = state.aircraft[0]; a.runway = "27R";
  const airport = getAirport(state), g = approachGeometry(airport, a.runway);
  a.position = {x: g.threshold.x - g.vector.x * 10 + g.vector.y * 3, y: g.threshold.y - g.vector.y * 10 - g.vector.x * 3};
  a.heading = a.targetHeading = (g.heading + 270) % 360; delete a.track;
  a.altitude = airport.elevation + DEFAULTS.patternHeight; a.speed = a.targetSpeed = 180; state.autoReadback = true;
  state = send(state, {kind: "command", aircraftId: a.id, frequency: "approach", text: "Contact Traffic", command: trafficHandoff(state)});
  assert.equal(state.aircraft[0].radar!.patternJoin, undefined);
  state = autoReadbacks(fly(state, 2), 3000, randomUUID);
  assert.equal(state.aircraft[0].frequency, "unicom");
  assert.equal(state.aircraft[0].leg, "base"); assert.equal(state.aircraft[0].radar!.patternJoin?.entry, "base");
});

test("a short or high handoff still joins downwind", () => {
  for (const [along, lateral, extraHeight, headingOffset] of [[-3, 3, 0, 90], [-10, 3, 5000, 90]] as const) {
    let state = fixture("EGLL"); const a = state.aircraft[0]; a.runway = "27R";
    const airport = getAirport(state), g = approachGeometry(airport, a.runway);
    a.position = {x: g.threshold.x + g.vector.x * along - g.vector.y * lateral, y: g.threshold.y + g.vector.y * along + g.vector.x * lateral};
    a.heading = a.targetHeading = (g.heading + headingOffset) % 360; delete a.track;
    a.altitude = airport.elevation + DEFAULTS.patternHeight + extraHeight;
    state = transfer(state); assert.equal(state.aircraft[0].leg, "downwind");
  }
});

test("an extended base entry survives a saved-state round trip", () => {
  let state = fixture("KJFK"); const a = state.aircraft[0]; a.runway = "22L";
  const airport = getAirport(state), g = approachGeometry(airport, a.runway);
  a.position = {x: g.threshold.x - g.vector.x * 8 - g.vector.y * 5, y: g.threshold.y - g.vector.y * 8 + g.vector.x * 5};
  a.heading = a.targetHeading = (g.heading + 315) % 360; delete a.track;
  a.performanceProfile = "B77W"; a.altitude = airport.elevation + DEFAULTS.patternHeight; a.speed = a.targetSpeed = 220;
  state = transfer(state);
  assert.equal(state.aircraft[0].radar!.patternJoin?.basePositioning, true);
  state = fly(state, 5);
  state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  assert.equal(state.aircraft[0].radar!.patternJoin?.basePositioning, true);
  state = fly(state, 1200);
  assert.equal(state.aircraft.length, 0);
});

test("a handoff already lined up with final continues to the runway", () => {
  for (const code of ["EGLL", "EGPH"]) for (const side of [-.08, 0, .08]) for (const offset of [-10, 0, 10]) {
    let state = fixture(code); const a = state.aircraft[0], airport = getAirport(state), g = approachGeometry(airport, a.runway!);
    a.position = {x: g.threshold.x - g.vector.x * 10 - g.vector.y * side, y: g.threshold.y - g.vector.y * 10 + g.vector.x * side};
    a.heading = a.targetHeading = (g.heading + offset + 360) % 360; delete a.track;
    a.altitude = airport.elevation + DEFAULTS.patternHeight; a.speed = a.targetSpeed = 180;
    state = transfer(state);
    assert.equal(state.aircraft[0].leg, "final");
    assert.equal(state.aircraft[0].radar!.patternJoin?.entry, "final");
    state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
    let landed = false;
    for (let i = 0; i < 900 && state.aircraft.length; i++) {
      state = fly(state, 1); const flown = state.aircraft[0];
      if (!flown || flown.radar?.arrival) {landed = true; break;}
      assert.notEqual(flown.mode, "go-around");
      assert.equal(flown.leg, "final");
    }
    assert.ok(landed, `${code} lateral ${side}, heading offset ${offset}`);
  }
});

test("wide heading changes can turn onto base and reach a stable final", () => {
  for (const side of [-1, 1]) for (const lateral of [5, 10]) for (const offset of [-135, -90, -60, 60, 90, 135, 180]) {
    let state = fixture("EGLL"); const a = state.aircraft[0], airport = getAirport(state), g = approachGeometry(airport, a.runway!);
    a.position = {x: g.threshold.x - g.vector.x * 12 - g.vector.y * side * lateral, y: g.threshold.y - g.vector.y * 12 + g.vector.x * side * lateral};
    a.heading = a.targetHeading = (g.heading + (side > 0 ? 90 : 270) + offset + 360) % 360; delete a.track;
    a.altitude = airport.elevation + DEFAULTS.patternHeight; a.speed = a.targetSpeed = 180;
    state = transfer(state); assert.equal(state.aircraft[0].radar!.patternJoin?.entry, "base");
    let alignedDistance = 0, landed = false;
    for (let i = 0; i < 1200 && state.aircraft.length; i++) {
      state = fly(state, 1); const flown = state.aircraft[0];
      if (!flown || flown.radar?.arrival) {landed = true; break;}
      assert.notEqual(flown.mode, "go-around");
      if (flown.leg === "final" && !alignedDistance && Math.abs(((flown.heading - g.heading + 540) % 360) - 180) <= 12) {
        alignedDistance = -((flown.position.x - g.threshold.x) * g.vector.x + (flown.position.y - g.threshold.y) * g.vector.y);
      }
    }
    assert.ok(alignedDistance >= 3 && landed, `side ${side}, lateral ${lateral}, offset ${offset}: aligned ${alignedDistance}, landed ${landed}`);
  }
});

test("an incomplete crosswind join from an older snapshot is replanned without relocating the aircraft", () => {
  let state = transfer(fixture());
  const a = state.aircraft[0]; a.leg = "crosswind"; a.radar!.patternJoin = {status: "joining"};
  const before = {...a.position};
  state = fly(restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state)))), .1);
  assert.equal(state.aircraft[0].leg, "downwind");
  assert.ok(Math.hypot(state.aircraft[0].position.x - before.x, state.aircraft[0].position.y - before.y) < .02);
});

for (const hand of ["left", "right"] as const) test(`an offset ${hand} downwind is intercepted and established`, () => {
  let state = fixture("EGPH", hand); const a = state.aircraft[0], g = approachGeometry(getAirport(state), a.runway!);
  a.position = {...g.threshold}; a.heading = a.targetHeading = (g.heading + 180) % 360;
  state = transfer(state); let established = false;
  for (let i = 0; i < 700; i++) {
    state = fly(state, 1); const flown = state.aircraft[0];
    if (flown.radar?.patternJoin?.status === "established") {established = true; break;}
    assert.equal(flown.leg, "downwind");
  }
  assert.ok(established);
});

for (const hand of ["left", "right"] as const) for (const extraHeight of [0, 5000]) test(`${hand} traffic handoff ${extraHeight ? "extends for descent" : "uses the normal final"}`, () => {
  let state = fixture("EGPH", hand); const a = state.aircraft[0], engine = engineFor(state);
  a.position = {...engine.patternTargets(a).crosswind}; a.altitude += extraHeight;
  state = transfer(state); let established = false, base = false, finalDistance = 0;
  const g = approachGeometry(getAirport(state), a.runway!);
  for (let i = 0; i < 1800 && state.aircraft.length; i++) {
    state = fly(state, 1); const flown = state.aircraft[0];
    if (flown.radar?.patternJoin?.status === "established") established = true;
    if (flown.leg === "base") {assert.ok(established); assert.ok(Math.abs(flown.altitude - (getAirport(state).elevation + DEFAULTS.patternHeight)) <= 1); base = true;}
    const angle = Math.abs(((flown.heading - g.heading + 540) % 360) - 180);
    if (flown.leg === "final" && angle < 5) {
      finalDistance = -((flown.position.x - g.threshold.x) * g.vector.x + (flown.position.y - g.threshold.y) * g.vector.y); break;
    }
  }
  assert.ok(base); assert.ok(finalDistance > 0);
  if (extraHeight) assert.ok(finalDistance > DEFAULTS.finalLength + 2, `final ${finalDistance} NM`);
  else assert.ok(Math.abs(finalDistance - DEFAULTS.finalLength) < .4, `final ${finalDistance} NM`);
});
test("pattern prediction and subsequent movement preserve earlier snapshots",()=>{
  const state=transfer(fixture()),before=JSON.stringify(state),engine=engineFor(state);
  engine.predictAircraft(state.aircraft,1);engine.projectedPath(state.aircraft[0],120);
  assert.equal(JSON.stringify(state),before);
  const after=fly(state,2);assert.equal(after.aircraft[0].radar!.patternJoin!.status,"established");assert.equal(JSON.stringify(state),before);
});
test("manual retunes away from Tower cancel pattern guidance and remain reloadable",()=>{
  for(const frequency of["ground","center"]as const){
    let state=transfer(fixture());state=send(state,{kind:"edit",aircraftId:state.aircraft[0].id,patch:{frequency}});
    assert.equal(state.aircraft[0].radar!.patternJoin,undefined);assert.equal(state.aircraft[0].mode,"heading");assert.ok(exerciseSchema.safeParse(state).success);
  }
});
for(const impossible of[false,true])test(`queued Tower handoff ${impossible?"warns once":"joins"} after the actual readback`,()=>{
  let state=fixture();state.autoReadback=true;if(impossible)state.aircraft[0].altitude=50000;
  const id=state.aircraft[0].id;
  state=send(state,{kind:"command",aircraftId:id,frequency:"approach",text:"Contact Traffic",command:trafficHandoff(state)});
  assert.equal(state.aircraft[0].radar!.patternJoin,undefined);
  state=autoReadbacks(fly(state,2),3000,randomUUID);
  assert.equal(state.aircraft[0].radar!.patternJoin!.status,impossible?"unable":"joining");
  assert.equal(state.messages.filter(m=>m.text.includes("unable to join the local pattern")).length,impossible?1:0);
  assert.ok(exerciseSchema.safeParse(state).success);
});


test("a frequency release preserves a transferred radar arrival and remains reloadable", () => {
  let state = transfer(fixture());
  const pattern = structuredClone(state.aircraft[0].radar!.patternJoin);
  state = send(state, {kind: "edit", aircraftId: state.aircraft[0].id, patch: {frequency: null}});
  assert.deepEqual(state.aircraft[0].radar!.patternJoin, pattern);
  assert.equal(state.aircraft[0].radar!.transferred, true);
  assert.ok(exerciseSchema.safeParse(state).success);
});
