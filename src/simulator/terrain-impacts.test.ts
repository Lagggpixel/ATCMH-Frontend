import assert from "node:assert/strict";
import test from "node:test";
import {airportRunways, getAirport} from "./airports";
import {engineFor} from "./engine";
import {approachGeometry, assignRadar} from "./radar";
import {TerrainImpacts} from "./server/terrain-impacts";

const athensVersion = "e0b9430cf85829818848937d61f72e770e0afcb546ee450b43ec23ac0b3d2b80";
const recordedFinals = [
  {callsign: "Austrian 801", position: {x: 1.1758735496232833, y: .8927097388890323}, altitude: 324.25095583548625},
  {callsign: "Air Crete 384", position: {x: 1.173828450589498, y: .8899291654045894}, altitude: 323.08044672761156},
];
function fixture(sample = recordedFinals[0]) {
  const engine = engineFor({airport: "LGAV", airportDataVersion: athensVersion, trainingStation: "LGAV:approach"});
  const state = structuredClone(engine.initialExercise()), airport = getAirport(state), a = state.aircraft[0];
  state.running = true; state.aircraft = [a];
  Object.assign(a, structuredClone(sample), {mode: "heading", runway: null, frequency: "unicom", speed: 200, targetSpeed: 200, speedMode: "manual"});
  a.radar = {station: "approach", navigation: "approach", routeIndex: 0, cleared: "ils-21L", captured: true,
    localizer: true, glideslope: true, clearanceAltitudeChecked: true, transferred: true, targetAltitude: {unit: "feet", value: 2000}};
  const g = approachGeometry(airport, "21L"); a.heading = a.targetHeading = g.heading;
  return {state, airport, a, g};
}
async function sampleTerrain(state: ReturnType<typeof fixture>["state"], provider: TerrainImpacts) {
  provider.request(state);
  await new Promise<void>(resolve => setImmediate(resolve));
  provider.apply(state);
}

for (const recorded of recordedFinals) for (const frequency of ["tower", "unicom", null] as const) for (const runway of [null, "21R"]) {
  test(`${recorded.callsign}: saved captured final lands on ${frequency ?? "no frequency"} with ${runway ?? "no"} stored runway`, async () => {
    const f = fixture(recorded); f.a.frequency = frequency; f.a.runway = runway;
    // Exercise the persisted-state path, without repairing its empty/stale runway.
    let state = engineFor(f.state).restoreExercise(JSON.parse(JSON.stringify(f.state)));
    const provider = new TerrainImpacts(async () => f.airport.elevation + 25);
    for (let t = 0; t < 3; t += .05) {
      await sampleTerrain(state, provider);
      assert.equal(state.collisions?.length ?? 0, 0, "runway terrain must not remove a landing arrival");
      assert.equal(state.aircraft.length, 1);
      if (state.aircraft[0].radar?.arrival) break;
      state = engineFor(state).advance(state, .05);
    }
    assert.equal(state.aircraft[0].mode, "rollout");
    assert.equal(state.aircraft[0].runway, "21L");
    assert.equal(state.aircraft[0].altitude, f.airport.elevation);
  });
}

const unsafeCases = [
  {name: "outside the runway width", change: (f: ReturnType<typeof fixture>) => {
    f.a.position.x -= f.g.vector.y * .03; f.a.position.y += f.g.vector.x * .03;
  }},
  {name: "before the runway approach buffer", change: (f: ReturnType<typeof fixture>) => {
    f.a.position = {x: f.g.threshold.x - f.g.vector.x * .11, y: f.g.threshold.y - f.g.vector.y * .11};
  }},
  {name: "past the runway end", change: (f: ReturnType<typeof fixture>) => {
    const pair = airportRunways(f.airport).find(p => p.ends.some(e => e.id === "21L"))!;
    const end = pair.ends.find(e => e.id === "03R")!.point;
    f.a.position = {x: end.x + f.g.vector.x * .01, y: end.y + f.g.vector.y * .01};
  }},
  {name: "below airport elevation", change: (f: ReturnType<typeof fixture>) => {f.a.altitude = f.airport.elevation - 6;}},
  {name: "before approach capture", change: (f: ReturnType<typeof fixture>) => {f.a.radar!.captured = false;}},
  {name: "before handoff", change: (f: ReturnType<typeof fixture>) => {f.a.radar!.transferred = false;}},
  {name: "on Approach frequency", change: (f: ReturnType<typeof fixture>) => {f.a.frequency = "approach";}},
  {name: "without an approach clearance", change: (f: ReturnType<typeof fixture>) => {delete f.a.radar!.cleared; f.a.runway = "21L";}},
  {name: "with an unknown approach clearance", change: (f: ReturnType<typeof fixture>) => {f.a.radar!.cleared = "unknown"; f.a.runway = "21L";}},
  {name: "with a clearance at another airport", change: (f: ReturnType<typeof fixture>) => {
    f.state.radarEnvironment!.approaches.find(p => p.id === "ils-21L")!.airportIcao = "EGPH"; f.a.runway = "21L";
  }},
  {name: "over the stored runway instead of the cleared runway", change: (f: ReturnType<typeof fixture>) => {
    const g = approachGeometry(f.airport, "21R"); f.a.runway = "21R";
    f.a.position = {x: g.threshold.x + g.vector.x * .08, y: g.threshold.y + g.vector.y * .08};
  }},
];
for (const scenario of unsafeCases) test(`terrain impacts remain active ${scenario.name}`, async () => {
  const f = fixture(); scenario.change(f);
  const provider = new TerrainImpacts(async () => f.airport.elevation + 25);
  await sampleTerrain(f.state, provider);
  assert.equal(f.state.aircraft.length, 0);
  assert.equal(f.state.collisions?.[0].kind, "terrain");
});

test("saved final without a custom radar environment uses the airport's approach definitions", async () => {
  const f = fixture(); delete f.state.radarEnvironment;
  await sampleTerrain(f.state, new TerrainImpacts(async () => f.airport.elevation + 25));
  assert.equal(f.state.aircraft.length, 1); assert.equal(f.state.collisions?.length ?? 0, 0);
});

for (const type of ["ils", "gps", "visual"] as const) for (const runway of [null, "21R"]) {
  test(`${type} clearance assigns its local runway over ${runway ?? "no"} stored runway`, () => {
    const f = fixture(); f.a.runway = runway;
    assignRadar(f.a, {type: "vector", approachId: `${type}-21L`}, f.airport, f.state.radarEnvironment!);
    assert.equal(f.a.runway, "21L");
  });
}
test("a remote approach clearance does not assign the local airport's same-numbered runway", () => {
  const f = fixture(); f.a.runway = "21R";
  f.state.radarEnvironment!.approaches.find(p => p.id === "ils-21L")!.airportIcao = "EGPH";
  assignRadar(f.a, {type: "vector", approachId: "ils-21L"}, f.airport, f.state.radarEnvironment!);
  assert.equal(f.a.runway, "21R");
});
