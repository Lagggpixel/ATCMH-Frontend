import assert from "node:assert/strict";
import test from "node:test";
import {AIRPORT, applyEnvelope, followedAircraft, initialExercise, newAircraft, patternTargets, predictAircraft, runwayGeometry} from "./engine";
import {scopeFollowTarget} from "./scope-overlays";

test("follow circles use the authoritative sequence even when a predicted circuit change expires it early", () => {
  let state = initialExercise();
  const follower = newAircraft("follower", true), leader = newAircraft("leader", true);
  Object.assign(follower, {leg: "downwind", position: patternTargets(follower).crosswind});
  Object.assign(leader, {leg: "final", position: runwayGeometry().threshold, altitude: AIRPORT.elevation});
  state.aircraft = [follower, leader];
  const result = applyEnvelope(state, {id: "sequence", time: 1, action: {kind: "command", aircraftId: follower.id, frequency: "tower", text: "Number 2, traffic on final", command: {type: "sequence", number: 2, traffic: "Final"}}});
  assert.equal(result.error, undefined); state = result.state;
  assert.equal(followedAircraft(state.aircraft[0], state.aircraft)?.id, leader.id);
  const predicted = predictAircraft(state.aircraft, .1, true);
  assert.equal(followedAircraft(predicted[0], predicted), undefined);
  assert.equal(scopeFollowTarget(state.aircraft, predicted, follower.id, followedAircraft), predicted[1]);
  assert.equal(scopeFollowTarget(predicted, predicted, follower.id, followedAircraft), undefined);
  assert.equal(scopeFollowTarget(state.aircraft, predicted, leader.id, followedAircraft), undefined);
  assert.equal(scopeFollowTarget(state.aircraft, predicted, null, followedAircraft), undefined);
});
