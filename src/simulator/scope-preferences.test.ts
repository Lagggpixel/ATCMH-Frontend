import assert from "node:assert/strict";
import test, {type TestContext} from "node:test";
import {initialOptions} from "./scope-options";
import {readScopePreferences, scopePreferenceKey, scopePreferenceWriter, type ScopePreferences} from "./scope-preferences";

const ground = scopePreferenceKey("alice", "KDAL", "local", "ground")!;
function storage(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  const writes: string[] = [];
  Object.defineProperty(globalThis, "window", {configurable: true, value: {localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {values.set(key, value); writes.push(key);},
  }}});
  t.after(() => {if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");});
  return {values, writes};
}
const changed = (): ScopePreferences => ({
  options: {waypoints: true, navaids: true, airspaces: false, taxiways: false, approaches: false,
    uncontrolledAirports: false, trails: false, frequencyTrails: false, windsAloft: true, filter: "below15", terrain: true, terrainReference: 9000},
  camera: {center: {x: 2.5, y: -6.75}, scale: 120}, windAltitude: 13000, procedureOpacity: .4,
});

test("every radar setting roundtrips independently for each account, airport, mode and frequency", t => {
  const {values} = storage(t);
  scopePreferenceWriter(ground).update(changed());
  assert.deepEqual(readScopePreferences(ground), changed());
  for (const key of [scopePreferenceKey("bob", "KDAL", "local", "ground"), scopePreferenceKey("alice", "EGPH", "local", "ground"),
    scopePreferenceKey("alice", "KDAL", "local", "tower"), scopePreferenceKey("alice", "KDAL", "approach", "all"),
    scopePreferenceKey("alice", "KDAL", "center", "all"), scopePreferenceKey("alice", "KDAL", "local", "all")]) {
    assert.deepEqual(readScopePreferences(key).options, initialOptions);
  }
  assert.equal(values.size, 1);
  assert.equal(scopePreferenceKey("alice", "kdal", "local", "ground"), ground);
  assert.notEqual(scopePreferenceKey("a:b", "KDAL", "local", "ground"), scopePreferenceKey("a%3Ab", "KDAL", "local", "ground"));
});

test("corrupt, obsolete and invalid fields recover safe defaults without losing valid switches", t => {
  const {values} = storage(t);
  for (const raw of ["broken", "null", "[]", '"string"']) {
    values.set(ground, raw);
    assert.deepEqual(readScopePreferences(ground), {options: initialOptions, windAltitude: -1, procedureOpacity: 1});
  }
  values.set(ground, JSON.stringify({options: {waypoints: true, navaids: "true", filter: "oops"}, camera: {center: {x: 0, y: 1}, scale: -1}, windAltitude: 1234, procedureOpacity: 2, aircraft: ["must not persist"]}));
  assert.deepEqual(readScopePreferences(ground), {options: {...initialOptions, waypoints: true}, camera: undefined, windAltitude: -1, procedureOpacity: 1});
  // Old airspace-only values were shared between accounts and airports; never import them.
  values.clear(); values.set("sweatbox:airspaces:ground", "false");
  assert.equal(readScopePreferences(ground).options.airspaces, true);
});

test("camera zoom beyond the old fixed limits survives saving and reload", t => {
  storage(t);
  for (const scale of [.01, .2, 8, 1800, 20000, 50000]) {
    const preferences = {...changed(), camera: {center: {x: 2, y: -3}, scale}};
    scopePreferenceWriter(ground).update(preferences);
    assert.deepEqual(readScopePreferences(ground).camera, preferences.camera);
  }
});

test("camera animation writes coalesce, while switches and background/unmount flushes save immediately", t => {
  const {writes} = storage(t);
  t.mock.timers.enable({apis: ["setTimeout"]});
  const writer = scopePreferenceWriter(ground), preferences = changed();
  writer.update(preferences);
  assert.equal(writes.length, 1);
  for (let x = 1; x <= 20; x++) writer.update({...preferences, camera: {center: {x, y: 1}, scale: 150}});
  assert.equal(writes.length, 1);
  t.mock.timers.tick(150);
  assert.equal(writes.length, 2);
  assert.equal(readScopePreferences(ground).camera?.center.x, 20);
  writer.update({...preferences, camera: {center: {x: 30, y: 1}, scale: 150}});
  writer.flush();
  assert.equal(readScopePreferences(ground).camera?.center.x, 30);
  writer.update({...preferences, options: {...preferences.options, taxiways: true}});
  assert.equal(readScopePreferences(ground).options.taxiways, true);
  writer.flush(); t.mock.timers.tick(500);
  assert.equal(writes.length, 4);
});

test("pending saves retain their original account/frequency when another scope mounts", t => {
  storage(t); t.mock.timers.enable({apis: ["setTimeout"]});
  const tower = scopePreferenceKey("alice", "KDAL", "local", "tower")!, bob = scopePreferenceKey("bob", "KDAL", "local", "ground")!;
  const writer = scopePreferenceWriter(ground), first = changed();
  writer.update(first); writer.update({...first, camera: {center: {x: 17, y: 2}, scale: 300}});
  scopePreferenceWriter(tower).update({...first, options: {...initialOptions}});
  scopePreferenceWriter(bob).update({...first, windAltitude: 3000});
  writer.flush();
  assert.equal(readScopePreferences(ground).camera?.center.x, 17);
  assert.deepEqual(readScopePreferences(tower).options, initialOptions);
  assert.equal(readScopePreferences(bob).windAltitude, 3000);
});

test("server rendering, missing identity and blocked/full browser storage do not break the radar", t => {
  const {values} = storage(t);
  scopePreferenceWriter(undefined).update(changed());
  assert.equal(values.size, 0);
  assert.deepEqual(readScopePreferences(undefined).options, initialOptions);
  Object.defineProperty(window, "localStorage", {get() {throw new Error("Storage blocked");}});
  assert.deepEqual(readScopePreferences(ground).options, initialOptions);
  assert.doesNotThrow(() => {const writer = scopePreferenceWriter(ground); writer.update(changed()); writer.flush();});
  Reflect.deleteProperty(globalThis, "window");
  assert.deepEqual(readScopePreferences(ground).options, initialOptions);
});
