import {performanceFor, profileForType, advancePerformance, trueAirspeed, AIRCRAFT_PERFORMANCE, climbRate, flightVelocity} from "./aircraft-performance";
import assert from "node:assert/strict";
import test from "node:test";
import {engineFor, restoreExercise} from "./engine";
import {getAirport} from "./airports";
import {approachGeometry, assignRadar, moveRadar, radarTakeoffAircraft} from "./radar";
import {aircraftSpeedLimits, assignRadarSpeed, automaticRadarTarget, radarPerformance} from "./radar-speed";
import {createSpawnAircraft} from "./spawn-aircraft";
import {exerciseSchema} from "./protocol";
import {automaticRadarUnable} from "./radar-safety";
import {updateRouteConstraints} from "./command-navigation";
import {enterPublishedHold} from "./holding";
import {aircraftMessageHeading} from "./aircraft-message-heading";
import {EXERCISE_WEATHER} from "./model";
import {createLocalAircraft} from "./local-aircraft";

function fixture(type = "A320", nm = 8) {
  const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise(), airport = getAirport(state), env = state.radarEnvironment!;
  const p = env.approaches.find(p => p.type === "ils")!, g = approachGeometry(airport, p.runway);
  const a = createSpawnAircraft(state, "test", {airborne: true, callsign: "Test 1", type, landing: "full-stop", speed: 250});
  Object.assign(a, {heading: g.heading, targetHeading: g.heading, position: {x: g.threshold.x - g.vector.x * nm, y: g.threshold.y - g.vector.y * nm}, altitude: airport.elevation + 50 + nm * 6076.12 * Math.tan(Math.PI / 60)});
  assignRadar(a, {type: "expect-approach", approachId: p.id}, airport, env);
  assignRadar(a, {type: "vector", approachId: p.id}, airport, env);
  a.radar!.clearanceAltitudeChecked = true; state.aircraft = [a]; state.running = true;
  return {state, a, airport, env, step: () => moveRadar(a, .05, airport, env, [], true)};
}

test("new spawn speeds become inbound profiles and decelerate through the cleared approach", () => {
  for (const [nm, expected] of [[25, 250], [15, 220], [10, 180], [5, 160], [3, 137], [1, 137]]) {
    const f = fixture("A320", nm); f.step();
    assert.equal(f.a.speedMode, "auto"); assert.equal(f.a.radar!.inboundSpeed, 250);
    assert.equal(f.a.targetSpeed, expected, `${nm} NM`);
    assert.ok(Math.abs(f.a.speed - 250) <= .151, "deceleration remains gradual");
  }
});

test("legacy manual targets survive clearance, serialization and reload", () => {
  const f = fixture("A320", 1); f.a.speedMode = "manual"; f.step();
  assert.equal(f.a.targetSpeed, 250);
  const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(f.state))));
  assert.equal(restored.aircraft[0].targetSpeed, 250);
  assert.equal(restored.aircraft[0].radar!.inboundSpeed, 250);
});

test("maximum restrictions permit deceleration; exact and minimum restrictions persist", () => {
  for (const [relation, expected] of [["maximum", 137], ["minimum", 210], ["exact", 210]] as const) {
    const f = fixture("A320", 1);
    assignRadarSpeed(f.a, {type: "radar-speed", mode: "maintain", unit: "knots", relation, value: 210}); f.step();
    assert.equal(f.a.targetSpeed, expected);
  }
});

test("all three approach restrictions release only in the aligned final corridor", () => {
  for (const [value, until] of [[160, 4], [170, 5], [180, 6]]) {
    const f = fixture("A320", until - .1);
    assignRadarSpeed(f.a, {type: "radar-speed", mode: "approach", value, until});
    const held = {...f.a, radar: {...f.a.radar!}, heading: (f.a.heading + 90) % 360};
    moveRadar(held, .05, f.airport, f.env); assert.ok(held.radar.speed);
    f.step(); assert.equal(f.a.radar!.speed, undefined);
    assert.equal(f.a.targetSpeed, automaticRadarTarget(f.a, until - .1));
  }
});

test("profiles cover 757/767, heavies and light aircraft with consistent practical limits", () => {
  for (const type of ["B752", "B753", "B762", "B763", "B764", "B772", "C172", "DH8D"]) {
    const f = fixture(type, 1), limits = performanceFor(f.a) ?? aircraftSpeedLimits(type)!; assert.ok(limits);
    f.step(); assert.ok(f.a.targetSpeed >= limits.min && f.a.targetSpeed <= limits.max);
    for (const mode of ["slowest", "best-forward", "follow"] as const) {
      assignRadarSpeed(f.a, {type: "radar-speed", mode}); f.step();
      assert.ok(f.a.targetSpeed >= limits.min && f.a.targetSpeed <= limits.max, `${type} ${mode}`);
    }
    assert.ok(automaticRadarUnable(f.a, {type: "speed", value: limits.max + 10}));
  }
});

test("custom final and landing targets are honored within aircraft limits", () => {
  for (const [nm, target] of [[8, 170], [4, 170], [1, 145]]) {
    const f = fixture("A320", nm); f.a.speedTargets = {final: 170, vref: 145}; f.step(); assert.equal(f.a.targetSpeed, target);
  }
  const heavy = fixture("B772", 1); heavy.a.speedTargets = {vref: 100}; heavy.step(); assert.equal(heavy.a.targetSpeed, 150);
});

test("authored route speeds do not turn automatic arrivals into permanent manual flight", () => {
  const f = fixture(); f.a.radar!.navigation = "route"; f.a.followRouteAltitudes = true; f.a.flightPlan = [{x: 0, y: 0, speed: 230}];
  updateRouteConstraints(f.a); assert.equal(f.a.speedMode, "auto"); assert.equal(automaticRadarTarget(f.a), 230);
  f.a.radar!.navigation = "approach"; f.step(); assert.equal(f.a.targetSpeed, 180);
});

test("departure and missed-approach profiles use aircraft performance", () => {
  const f = fixture("C172"); assignRadar(f.a, {type: "missed-approach", altitude: {unit: "feet", value: 5000}}, f.airport, f.env);
  f.step(); assert.equal(f.a.targetSpeed, radarPerformance(f.a).climb); assert.equal(f.a.targetSpeed, 76);
  const departure = radarTakeoffAircraft(f.a, f.airport); assert.equal(departure.targetSpeed, 76);
  moveRadar(departure, .05, f.airport, f.env); assert.equal(departure.targetSpeed, 76);
});

test("route constraints survive unconstrained fixes and a hold does not create a manual override", () => {
  const f = fixture(); f.a.radar!.navigation = "route"; f.a.followRouteAltitudes = true;
  f.a.flightPlan = [{x: 0, y: 0, speed: 230}, {x: 1, y: 1}];
  updateRouteConstraints(f.a); f.a.radar!.routeIndex = 1; updateRouteConstraints(f.a);
  assert.equal(automaticRadarTarget(f.a), 230);
  enterPublishedHold(f.a, {x: 1, y: 1, hold: {inbound: 180, hand: "right", maxSpeed: 200}});
  assert.equal(f.a.speedMode, "auto");
  assignRadar(f.a, {type: "vector", approachId: f.env.approaches.find(p => p.type === "ils")!.id}, f.airport, f.env);
  assert.equal(f.a.radar!.routeSpeed, undefined); assert.equal(automaticRadarTarget(f.a, 1), 137);
});

test("aircraft without a performance profile separate IAS, TAS, ground speed and track", () => {
  const e = engineFor({airport: "KDAL"}), a = {...e.newAircraft("legacy", true), mode: "heading" as const, altitude: 30000, heading: 90, speed: 250};
  delete a.performanceProfile;
  const weather = {...EXERCISE_WEATHER, windDirection: 0, windSpeed: 30};
  const before = {...a.position, altitude: a.altitude};
  a.position = {x: a.position.x + a.speed / 3600, y: a.position.y};
  advancePerformance(a, before, 1, weather);
  const tas = trueAirspeed(a.speed, a.altitude, weather);
  assert.ok(Math.abs(a.groundSpeed! - Math.hypot(tas, 30)) < 1e-8);
  assert.ok(Math.abs(Math.hypot(a.position.x - before.x, a.position.y - before.y) * 3600 - a.groundSpeed!) < 1e-7);
  assert.notEqual(Math.round(a.groundSpeed!), a.speed); assert.notEqual(a.track, a.heading);
});

test("Mach instructions and the displayed Mach share altitude, temperature and pressure", () => {
  const e = engineFor({airport: "KDAL"});
  for (const profile of [undefined, "A320"] as const) for (const temperature of [-10, 15, 35]) for (const altitude of [18000, 30000, 39000]) {
    const a = {...e.newAircraft("mach", true), mode: "heading" as const, performanceProfile: profile, altitude};
    const weather = {...EXERCISE_WEATHER, temperature, qnh: 995};
    assignRadarSpeed(a, {type: "radar-speed", mode: "maintain", relation: "exact", unit: "mach", value: .78}, weather);
    a.speed = a.targetSpeed;
    assert.match(aircraftMessageHeading(a, getAirport({airport: "KDAL"}), weather).speed, /M0\.78 /);
  }
});

const fixtureForInfiniteFlightParity=()=>engineFor({trainingStation:"EGPH:approach"}).initialExercise();

test("stored performance profiles cover piston, turboprop and jet schedules",()=>{
 assert.deepEqual([...new Set(AIRCRAFT_PERFORMANCE.map(p=>p.propulsion))],["piston","turboprop","jet"]);
 const a=fixtureForInfiniteFlightParity().aircraft[0];a.performanceProfile="C172";a.altitude=1000;assert.equal(climbRate(a),730);a.performanceProfile="A320";assert.equal(climbRate(a),2500);a.altitude=41000;assert.equal(climbRate(a),0);
 a.altitude=15000;a.heading=90;a.speed=200;const calm=flightVelocity(a),wind=flightVelocity(a,{windDirection:90,windSpeed:20,visibilityKm:10,qnh:1013.25,reference:"test"});assert.ok(calm.x>200);assert.ok(Math.abs(calm.x-wind.x-20)<.001);
 const local=createLocalAircraft({},"c172",{placement:"custom",callsign:"Test 123",type:"C172",runway:"24",distance:5,leg:"final",hand:"left",height:1500,speed:100,heading:90,landing:"full-stop",flight:"departure",frequency:"tower"});assert.equal(local.performanceProfile,"C172");
 const spawn=createSpawnAircraft(fixtureForInfiniteFlightParity(),"tbm",{airborne:true,type:"TBM9",callsign:"Test 930",landing:"full-stop",altitude:5000,speed:180});assert.equal(spawn.performanceProfile,"TBM9");
});

test("all aircraft types used by shared templates resolve to a stored performance profile", () => {
 const types = ["A35K", "B738", "B77W", "A388", "A320", "A333", "B789", "A321", "B748", "A339", "A220", "A359", "B752", "B739", "B78X", "E190", "B744", "CRJ9", "A346", "B772", "B763", "C208", "TBM9", "E170", "C56X", "A319", "B737", "E175", "B788", "A21N", "A20N", "A330"];
 for (const type of types) {
  const profile = profileForType(type); assert.ok(profile, type);
  const aircraft = {...engineFor().newAircraft("profile-test", true), type, performanceProfile: profile};
  assert.equal(exerciseSchema.parse({...engineFor().initialExercise(), aircraft: [aircraft]}).aircraft[0].performanceProfile, profile);
 }
 assert.equal(profileForType("A220"), "A223"); assert.equal(profileForType("A330"), "A333");
 assert.equal(profileForType("unknown-type"), undefined);
});
