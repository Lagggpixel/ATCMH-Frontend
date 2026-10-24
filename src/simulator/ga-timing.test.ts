import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {getAirport} from "./airports";
import {DEFAULTS, type Aircraft} from "./model";
import {exerciseSchema, motionSchema} from "./protocol";
import {runwayOccupied} from "./runway-safety";
import {applyReplayDelta, replayDelta} from "./replays";

// Physical state at the reported KDAL pairing, with session/account/radio data removed.
function reportedPair() {
  const engine = engineFor({airport: "KDAL", weather: {windDirection: 150, windSpeed: 8, variableWind: false, visibilityKm: 16.09344, qnh: 1021.8, temperature: 28.3, dewpoint: 10.6, reference: "Recorded KDAL wind"}});
  const state = engine.initialExercise();
  state.elapsed = 453.045; state.running = true; state.autoReadback = true;
  const common = {mode: "pattern", leg: "final", runway: "31R", frequency: "tower", hand: "right", clearedToLand: true, clearedForOption: true, optionHand: "right"} as const;
  const leader: Aircraft = {...engine.newAircraft("leader", true), ...common, callsign: "N714KG", type: "A21N", landing: "full-stop",
    position: {x: 1.8474817853880996, y: -1.6246038486986436}, altitude: 1135.0230669029245, speed: 160, targetSpeed: 160,
    heading: 315.1462739491035, targetHeading: 315.1462739536123, bankAngle: .0006802908182137321, groundSpeed: 173.47807683110577, patternFinalDistance: 12.316734559065361};
  const follower: Aircraft = {...engine.newAircraft("follower", true), ...common, callsign: "American 2154", type: "B38M", landing: "touch-and-go",
    position: {x: 5.001141534807459, y: -3.7033551725754332}, altitude: 1987, speed: 154.7625081867645, targetSpeed: 180,
    heading: 245.89204062441854, targetHeading: 270.958553795389, bankAngle: 25, groundSpeed: 163.37340180138574, patternFinalDistance: 6.237418746377713,
    sequence: {number: 2, traffic: "Final", followingId: "leader", runway: "31R", circuit: 0, followingCircuit: 0}};
  state.aircraft = [leader, follower]; state.messages = [];
  const result = engine.applyEnvelope(state, {id: "ga", time: 1, action: {kind: "conflict", conflict: "ga", aircraftId: leader.id, otherId: follower.id}});
  assert.equal(result.error, undefined);
  assert.deepEqual(result.state.aircraft, state.aircraft, "pairing never repositions traffic or grants a clearance");
  return {engine, state: result.state, airport: getAirport(state)};
}

test("reported KDAL pair stays occupied for one 50-foot go-around, then vacates continuously", () => {
  const h = reportedPair(); let state = h.state, wentAround = false, paced = false, readbacks = 0;
  for (let i = 0; i < 3300; i++) {
    const previous = state, a = previous.aircraft[0], b = previous.aircraft[1];
    state = h.engine.advance(previous, .05);
    const next = state.aircraft[0], following = state.aircraft[1];
    if (a.mode === "taxi" && next.mode === "taxi") {
      assert.ok(Math.abs(next.speed - a.speed) <= DEFAULTS.acceleration * .05 + 1e-7, "vacating speed changes gradually");
      assert.ok(Math.hypot(next.position.x - a.position.x, next.position.y - a.position.y) <= Math.max(a.speed, next.speed) / 3600 * .05 + 1e-7, "no ground teleport");
      if (!wentAround) assert.ok(next.speed > 0, "the exercise never holds the leader stationary");
    }
    if (next.conflictMotion?.speedLimit !== undefined) {
      paced = true; assert.ok(next.conflictMotion.speedLimit >= 5);
      assert.equal(exerciseSchema.parse(state).aircraft[0].conflictMotion?.speedLimit, next.conflictMotion.speedLimit);
      assert.equal(motionSchema.parse(state).aircraft[0].conflictMotion?.speedLimit, next.conflictMotion.speedLimit);
    }
    if (b.mode !== "go-around" && following.mode === "go-around") {
      wentAround = true;
      assert.ok(b.altitude <= h.airport.elevation + 52, "no early automatic go-around");
      assert.ok(runwayOccupied(h.airport, "31R", [a], b.id));
      assert.equal(state.conflicts![0].phase, "complete");
      assert.match(state.conflicts![0].outcome!, /Following aircraft went around/);
      assert.equal(next.conflictMotion, undefined, "normal exit speed resumes immediately");
      const recovered = exerciseSchema.parse(JSON.parse(JSON.stringify(state)));
      assert.equal(recovered.conflicts![0].selfGoAround, true);
      assert.equal(motionSchema.parse(state).aircraft[1].mode, "go-around");
      assert.deepEqual(JSON.parse(JSON.stringify(applyReplayDelta(previous, replayDelta(previous, state)))), JSON.parse(JSON.stringify(state)));
    }
    state = h.engine.autoReadbacks(state, i * 50, () => `radio-${++readbacks}`);
  }
  assert.ok(paced); assert.ok(wentAround, "American 2154 must go around before touching down");
  assert.equal(state.messages.filter(m => m.aircraftId === "follower" && /going around/i.test(m.text)).length, 1);
  assert.equal(state.aircraft[1].circuit, 1);
  assert.equal(state.aircraft[0].mode, "parked");
  assert.equal(runwayOccupied(h.airport, "31R", state.aircraft, "follower"), false);
  assert.equal(state.aircraft[0].conflictMotion, undefined);
});

test("cancelling GA while vacating immediately restores ordinary exit motion", () => {
  const h = reportedPair(); let state = h.state;
  for (let i = 0; i < 120 && state.aircraft[0].conflictMotion?.speedLimit === undefined; i++) state = h.engine.advance(state, 1);
  assert.ok(state.aircraft[0].conflictMotion?.speedLimit);
  const cancelled = h.engine.applyEnvelope(state, {id: "cancel", time: 2, action: {kind: "cancel-conflict", conflictId: "ga"}});
  assert.equal(cancelled.error, undefined); state = cancelled.state;
  assert.equal(state.conflicts![0].phase, "cancelled");
  assert.equal(state.aircraft[0].conflictMotion, undefined);
  for (let i = 0; i < 45; i++) state = h.engine.advance(state, 1);
  assert.equal(state.aircraft[0].mode, "parked");
  assert.notEqual(state.aircraft[1].mode, "go-around");
});

test("an unachievable distant arrival reports that GA did not materialise", () => {
  const h = reportedPair(); let state = h.state;
  const g = h.engine.runwayGeometry("31R"), b = state.aircraft[1];
  b.position = {x: g.threshold.x - g.vector.x * 20, y: g.threshold.y - g.vector.y * 20};
  b.heading = b.targetHeading = g.heading; b.bankAngle = 0; b.altitude = h.airport.elevation + 1500;
  delete b.sequence;
  for (let i = 0; i < 300 && state.conflicts![0].phase !== "cancelled"; i++) state = h.engine.advance(state, 1);
  assert.equal(state.conflicts![0].phase, "cancelled");
  assert.match(state.conflicts![0].outcome!, /did not materialise/);
  assert.equal(state.aircraft[0].conflictMotion, undefined);
  assert.notEqual(state.aircraft[1].mode, "go-around");
});

test("a controller's explicit exit instruction retains its ordinary vacating speed", () => {
  const h = reportedPair(); let state = h.state;
  for (let i = 0; i < 65; i++) state = h.engine.advance(state, 1);
  const instructed = h.engine.applyEnvelope(state, {id: "exit", time: 2, action: {kind: "maneuver", aircraftId: "leader", command: {type: "exit-runway", side: "left", expedite: true}}});
  assert.equal(instructed.error, undefined); state = instructed.state;
  assert.equal(state.aircraft[0].arrivalExit!.instruction, "exit-runway");
  state = h.engine.advance(state, .1);
  assert.equal(state.aircraft[0].conflictMotion?.speedLimit, undefined);
});
