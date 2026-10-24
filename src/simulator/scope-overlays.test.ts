import assert from "node:assert/strict";
import test from "node:test";
import {AIRPORT, applyEnvelope, followedAircraft, initialExercise, newAircraft, patternTargets, predictAircraft, runwayGeometry} from "./engine";
import {scopeFollowTarget, scopeNavigationFixes} from "./scope-overlays";

test("hiding background waypoints keeps only the selected flight plan, including saved fixes during a navigation outage", () => {
  const fixes = [{id: "FIRST", point: {x: 1, y: 2}}, {id: "OTHER", point: {x: 3, y: 4}}];
  const route = [{x: 1, y: 2}, {x: 5, y: 6, name: "SAVED"}, {x: 7, y: 8}];
  assert.equal(scopeNavigationFixes(fixes, [route[0]], true), fixes);
  assert.deepEqual(scopeNavigationFixes(fixes, route, true), [...fixes, {id: "SAVED", point: route[1], routeOnly: true}, {id: "Waypoint 3", point: route[2], routeOnly: true}]);
  assert.deepEqual(scopeNavigationFixes(fixes, undefined, false), []);
  assert.deepEqual(scopeNavigationFixes(fixes, [], false), []);
  assert.deepEqual(scopeNavigationFixes(fixes, route, false), [
    {id: "FIRST", point: route[0], routeOnly: true}, {id: "SAVED", point: route[1], routeOnly: true}, {id: "Waypoint 3", point: route[2], routeOnly: true},
  ]);
  assert.deepEqual(scopeNavigationFixes([], [route[1]], false), [{id: "SAVED", point: route[1], routeOnly: true}]);
  assert.deepEqual(scopeNavigationFixes(fixes, [{x: 30, y: 40, name: "FIRST"}], false), [{id: "FIRST", point: {x: 30, y: 40, name: "FIRST"}, routeOnly: true}]);
  assert.deepEqual(scopeNavigationFixes(fixes, [fixes[1].point], false), [{id: "OTHER", point: fixes[1].point, routeOnly: true}]);
});

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
