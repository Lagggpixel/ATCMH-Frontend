import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {airportList, runwayEnds} from "./airports";
import {advance, applyEnvelope, engineFor, restoreExercise} from "./engine";
import {DEFAULTS, type Aircraft, type Exercise} from "./model";
import {exerciseSchema} from "./protocol";

test("3 NM final spacing holds after transition joins, on every KDAL runway and both pattern hands", () => {
  const e = engineFor({airport: "KDAL"});
  for (const runway of ["31L", "31R", "13L", "13R"]) for (const hand of ["left", "right"] as const) for (const opposite of [false, true]) for (const speeds of [null, [160, 160], [220, 160], [160, 220]]) {
    const g = e.runwayGeometry(runway), leaderHand = opposite ? hand === "left" ? "right" : "left" : hand;
    const point = (along: number, side: number) => ({x: g.threshold.x + g.vector.x * along - g.vector.y * side, y: g.threshold.y + g.vector.y * along + g.vector.x * side});
    const along = (a: Aircraft) => (a.position.x - g.threshold.x) * g.vector.x + (a.position.y - g.threshold.y) * g.vector.y;
    const traffic = ["follower", "leader"].map((id, i): Aircraft => ({...e.newAircraft(id, true), runway, leg: "downwind", hand: i ? leaderHand : hand,
      position: point(i ? -2.9 : -1.7, (i ? leaderHand : hand) === "left" ? 3 : -3), heading: (g.heading + 180) % 360, targetHeading: (g.heading + 180) % 360,
      ...(speeds ? {speedMode: "manual", speed: speeds[i], targetSpeed: speeds[i]} : {})}));
    let state: Exercise = {...e.initialExercise(), aircraft: traffic, running: true};
    // The follower has just finished transition and is assigned entry plus sequence.
    state.aircraft[0].mode = "heading"; state.aircraft[0].transitionAltitude = 1500; state.aircraft[0].leavingCircuit = true;
    const result = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: "follower", command: {type: "pattern", leg: "downwind", hand, runway, sequence: {number: 2, traffic: `${leaderHand} downwind`}}}});
    assert.equal(result.error, undefined); state = result.state;
    assert.equal(state.aircraft[0].sequence?.followingId, "leader");
    let first = 0, second = 0, minimum = Infinity, thresholdGap = 0, maximumGap = 5;
    const label = `${runway}/${hand}/${opposite}/${speeds}`;
    for (let t = 1; t <= 900 && !second; t++) {
      if (t === 100) state = restoreExercise(exerciseSchema.parse(state));
      state = advance(state, 1); const [a, b] = state.aircraft;
      if (!first && a.leg === "final" && b.leg === "final") minimum = Math.min(minimum, along(b) - along(a));
      if (!first && b.circuit) {first = t; thresholdGap = -along(a); maximumGap = 5 * Math.max(1, (a.groundSpeed ?? a.speed) / a.speed); }
      if (a.circuit) second = t;
    }
    assert.ok(first && second, label);
    assert.ok(minimum >= DEFAULTS.sequenceDistance - .02, `${label}: final gap ${minimum}`);
    // The upper bound detects excessive delay; scale it with actual travel now that GS differs from IAS.
    assert.ok(thresholdGap >= 2.98 && thresholdGap < maximumGap, `${label}: threshold gap ${thresholdGap}`);
    assert.ok(second - first >= DEFAULTS.sequenceSeconds, label);
  }
});

test("automatic 3 NM spacing is portable across all airports, runways and hands", () => {
  for (const airport of airportList) for (const end of runwayEnds(airport)) for (const hand of ["left", "right"] as const) {
    const e = engineFor({airport: airport.icao}), g = e.runwayGeometry(end.id);
    const point = (along: number) => ({x: g.threshold.x + g.vector.x * along - g.vector.y * (hand === "left" ? 3 : -3), y: g.threshold.y + g.vector.y * along + g.vector.x * (hand === "left" ? 3 : -3)});
    let state: Exercise = {...e.initialExercise(), running: true, aircraft: ["follower", "leader"].map((id, i) => ({...e.newAircraft(id, true), runway: end.id, hand, leg: "downwind", heading: (g.heading + 180) % 360, targetHeading: (g.heading + 180) % 360, position: point(i ? -2.9 : -1.7)}))};
    state = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: "follower", command: {type: "sequence", number: 2, traffic: `${hand} downwind`}}}).state;
    const saved = structuredClone(state);
    assert.deepEqual(e.predictAircraft(state.aircraft, 1).map(a => a.position), advance(state, 1).aircraft.map(a => a.position));
    assert.deepEqual(state, saved);
    let observed = false;
    for (let t = 1; t <= 600 && !observed; t++) {
      state = advance(state, 1); const [a, b] = state.aircraft;
      if (b.circuit) {
        const gap = -((a.position.x - g.threshold.x) * g.vector.x + (a.position.y - g.threshold.y) * g.vector.y);
        assert.ok(gap >= 2.98 && gap < 4, `${airport.icao}/${end.id}/${hand}: ${gap}`); observed = true;
      }
    }
    assert.ok(observed);
  }
});
