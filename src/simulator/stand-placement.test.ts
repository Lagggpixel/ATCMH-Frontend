import assert from "node:assert/strict";
import test from "node:test";
import {defaultAirport} from "./airports";
import {standPlacement} from "./scenarios";

test("curved stand heading follows its final nonzero segment in either direction", () => {
  const stand = {id: "curved", kind: "parking_position", name: "Curved", points: [{x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}, {x: 1, y: 1}]};
  const airport = {...defaultAirport, features: [stand]};
  assert.deepEqual(standPlacement("curved", false, airport), {position: {x: 1, y: 1}, heading: 90});
  assert.deepEqual(standPlacement("curved", true, airport), {position: {x: 0, y: 0}, heading: 180});
});
