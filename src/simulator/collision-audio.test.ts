import assert from "node:assert/strict";
import test from "node:test";
import {CollisionAudio} from "./collision-audio";
import {initialExercise, engineFor} from "./engine";
import type {Exercise} from "./model";

test("impacts play once, obey audio/volume, and never repeat on snapshots, reloads or reconnects", () => {
  const played: number[] = [], player = new CollisionAudio({play: volume => played.push(volume), activate() {}, close() {}});
  let state: Exercise = engineFor({trainingStation: "EGPH:approach"}).initialExercise();
  const event = (id: string) => ({id, elapsed: 1, aircraft: [{id: "a", callsign: "Easy 102"}, {id: "b", callsign: "Delta 64"}], position: {x: 0, y: 0}});
  player.observe(state, true, true, false, .4);
  state = {...state, elapsed: 1, collisions: [event("one")]};
  player.observe(state, true, true, false, .4); player.observe(structuredClone(state), true, true, false, .4);
  assert.deepEqual(played, [.4]);
  state = {...state, elapsed: 2, collisions: [...state.collisions!, event("muted")]};
  player.observe(state, true, false, false, 1); player.observe(state, true, true, false, 1);
  assert.deepEqual(played, [.4]);
  player.observe(state, false, true, false, 1);
  state = {...state, elapsed: 3, collisions: [...state.collisions!, event("offline")]};
  player.observe(state, true, true, false, 1); assert.deepEqual(played, [.4]);
  const reloaded = new CollisionAudio({play: volume => played.push(volume), activate() {}, close() {}});
  reloaded.observe(state, true, true, false, 1); assert.deepEqual(played, [.4]);
  state = {...state, elapsed: 4, collisions: [...state.collisions!, event("two")]};
  player.observe(state, true, true, false, .7); assert.deepEqual(played, [.4, .7]);
  player.observe({...state, elapsed: 0}, true, true, false, 1); assert.deepEqual(played, [.4, .7]);
});


test("local snapshots never replay historical contact crash audio", () => {
  const played: number[] = [], player = new CollisionAudio({play: value => played.push(value), activate() {}, close() {}});
  const state = initialExercise(); player.observe(state, true, true, false, 1);
  player.observe({...state, elapsed: 1, collisions: [{id: "old", elapsed: 1, aircraft: [{id: "a", callsign: "Test A"}, {id: "b", callsign: "Test B"}], position: {x: 0, y: 0}}]}, true, true, false, 1);
  assert.deepEqual(played, []);
});

test("radar terrain impact audio also supports single-aircraft events", () => {
  const played: number[] = [], player = new CollisionAudio({play: value => played.push(value), activate() {}, close() {}});
  const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise(); player.observe(state, true, true, false, 1);
  const impact: Exercise = {...state, elapsed: 1, collisions: [{kind: "terrain", id: "terrain", elapsed: 1, aircraft: [{id: "a", callsign: "Test"}], position: {x: 0, y: 0}}]};
  player.observe(impact, true, true, false, .6); player.observe(impact, true, true, false, .6);
  assert.deepEqual(played, [.6]);
});
