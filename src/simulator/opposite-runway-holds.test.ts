import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {groundGuidance, GROUND} from "./ground-movement";
import type {Aircraft, Exercise, Point} from "./model";

const engine = engineFor({airport: "EGLL"});
const south = {x: .9389680828, y: -.3526088511};
const north = {x: .9545290443, y: -.3075241608};
const southHold = {x: .939156504, y: -.3876081124};
const northEntry = {x: .9547444679, y: -.3475235807};
const southEntry = {x: .9389410803, y: -.3476086925};
const west = {x: .8789419505, y: -.3479318279};
const northWest = {x: .8947453381, y: -.3478467161};

function departure(id: string, position: Point, heading: number, entry: Point, end: Point): Aircraft {
  return {...engine.newAircraft(id, false), position, heading, targetHeading: heading, altitude: 83, runway: "27L", mode: "lineup", speed: 0, targetSpeed: 20, holding: false, lineupWait: false, taxiPath: [position, entry, end], taxiIndex: 1};
}
function parked(id: string, position: Point): Aircraft {
  return {...engine.newAircraft(id, false), position, altitude: 83, mode: "parked", speed: 0, targetSpeed: 0, holding: true};
}

test("opposite runway holds do not block either departure's turn onto 27L", () => {
  const cases = [
    {moving: departure("south", south, 359.69, southEntry, west), other: parked("north", north)},
    {moving: departure("north", {x: .95471754, y: -.34252365}, 179.69, northEntry, northWest), other: parked("south", southHold)},
  ];
  for (const {moving, other} of cases) {
    assert.deepEqual(groundGuidance(moving, [moving, other], 83), {speedLimit: Infinity, travelLimit: Infinity});
    let state: Exercise = {...engine.initialExercise(), aircraft: [moving, other], running: true};
    for (let i = 0; i < 1200 && state.aircraft[0].mode === "lineup"; i++) state = engine.advance(state, .05);
    assert.equal(state.aircraft[0].mode, "takeoff", `${moving.id} must finish the runway entry`);
    assert.ok(engine.distance(state.aircraft[0].position, other.position) > GROUND.corridor);
  }
});

test("traffic on the upcoming turn and beyond the route end still blocks ground movement", () => {
  const moving = departure("departing", south, 359.69, southEntry, west);
  for (const position of [
    {x: southEntry.x - .012, y: southEntry.y},
    {x: southEntry.x, y: southEntry.y + .01},
    {x: west.x - .01, y: west.y},
  ]) {
    const other = parked("obstacle", position);
    assert.notEqual(groundGuidance(moving, [moving, other], 83).travelLimit, Infinity, JSON.stringify(position));
  }
});

test("a short intermediate segment still detects a leader on the continuing route", () => {
  const moving = departure("departing", {x: 0, y: 0}, 0, {x: 0, y: .005}, {x: 0, y: .1});
  const leader = parked("leader", {x: 0, y: .04});
  assert.equal(groundGuidance(moving, [moving, leader], 83).travelLimit, 0);
});
