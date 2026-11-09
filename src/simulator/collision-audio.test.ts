import assert from "node:assert/strict";
import test from "node:test";
import {CollisionAudio, crashSoundPreference} from "./collision-audio";
import {initialExercise, engineFor} from "./engine";
import type {Exercise} from "./model";

test("impacts play once, obey audio/volume, and never repeat on snapshots, reloads or reconnects", () => {
  const played: number[] = [], player = new CollisionAudio({play: volume => played.push(volume), activate() {}, close() {}});
  let state: Exercise = engineFor({trainingStation: "EGPH:approach"}).initialExercise();
  const event = (id: string) => ({id, elapsed: 1, aircraft: [{id: "a", callsign: "Easy 102"}, {id: "b", callsign: "Delta 64"}], position: {x: 0, y: 0}});
  player.observe(state, true, true, .4);
  state = {...state, elapsed: 1, collisions: [event("one")]};
  player.observe(state, true, true, .4); player.observe(structuredClone(state), true, true, .4);
  assert.deepEqual(played, [.4]);
  state = {...state, elapsed: 2, collisions: [...state.collisions!, event("muted")]};
  player.observe(state, true, false, 1); player.observe(state, true, true, 1);
  assert.deepEqual(played, [.4]);
  player.observe(state, false, true, 1);
  state = {...state, elapsed: 3, collisions: [...state.collisions!, event("offline")]};
  player.observe(state, true, true, 1); assert.deepEqual(played, [.4]);
  const reloaded = new CollisionAudio({play: volume => played.push(volume), activate() {}, close() {}});
  reloaded.observe(state, true, true, 1); assert.deepEqual(played, [.4]);
  state = {...state, elapsed: 4, collisions: [...state.collisions!, event("two")]};
  player.observe(state, true, true, .7); assert.deepEqual(played, [.4, .7]);
  player.observe({...state, elapsed: 0}, true, true, 1); assert.deepEqual(played, [.4, .7]);
});


test("local snapshots never replay historical contact crash audio", () => {
  const played: number[] = [], player = new CollisionAudio({play: value => played.push(value), activate() {}, close() {}});
  const state = initialExercise(); player.observe(state, true, true, 1);
  player.observe({...state, elapsed: 1, collisions: [{id: "old", elapsed: 1, aircraft: [{id: "a", callsign: "Test A"}, {id: "b", callsign: "Test B"}], position: {x: 0, y: 0}}]}, true, true, 1);
  assert.deepEqual(played, []);
});

test("radar terrain impact audio also supports single-aircraft events", () => {
  const played: number[] = [], player = new CollisionAudio({play: value => played.push(value), activate() {}, close() {}});
  const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise(); player.observe(state, true, true, 1);
  const impact: Exercise = {...state, elapsed: 1, collisions: [{kind: "terrain", id: "terrain", elapsed: 1, aircraft: [{id: "a", callsign: "Test"}], position: {x: 0, y: 0}}]};
  player.observe(impact, true, true, .6); player.observe(impact, true, true, .6);
  assert.deepEqual(played, [.6]);
});

test("the crash sound switch is remembered per account and role, defaulting on", () => {
  const values = new Map<string, string>();
  const previous = (globalThis as {window?: unknown}).window;
  (globalThis as {window?: unknown}).window = {localStorage: {getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => {values.set(k, v);}}};
  try {
    const staff = crashSoundPreference("account", "staff"), mentee = crashSoundPreference("account", "mentee");
    let changes = 0; const stop = staff.subscribe(() => changes++);
    assert.equal(staff.get(), true);
    staff.set(false);
    assert.equal(staff.get(), false); assert.equal(mentee.get(), true); assert.equal(changes, 1);
    stop(); staff.set(true); assert.equal(changes, 1); assert.equal(staff.get(), true);
  } finally {(globalThis as {window?: unknown}).window = previous;}
});

test("the crash sound switch still works for this tab when browser storage is blocked", () => {
  const previous = (globalThis as {window?: unknown}).window;
  const blocked = () => {throw new Error("blocked");};
  (globalThis as {window?: unknown}).window = {get localStorage() {return blocked();}};
  try {
    const staff = crashSoundPreference("blocked-storage", "staff");
    let changes = 0; const stop = staff.subscribe(() => changes++);
    assert.equal(staff.get(), true);
    staff.set(false);
    assert.equal(staff.get(), false); assert.equal(changes, 1);
    assert.equal(crashSoundPreference("blocked-storage", "staff").get(), false);
    assert.equal(crashSoundPreference("blocked-storage", "mentee").get(), true);
    stop();
  } finally {(globalThis as {window?: unknown}).window = previous;}
});
