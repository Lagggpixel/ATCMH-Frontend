import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {facilityActive} from "./facility-activity";
import {facilities, availableHandoffs} from "./aviation";
import {engineFor, applyEnvelope, restoreExercise, validateControllerMessage} from "./engine";
import {getAirport} from "./airports";
import {radarEnvironmentFor} from "./radar";
import {catalogFor} from "./catalog";
import {atisFrequencies} from "./atis-options";
import {exerciseSchema} from "./protocol";
import {airspaceOutlines, projectAirspaces} from "./scope-airspaces";

for (const mode of ["local", "approach", "center"] as const) test(`${mode}: fresh exercises keep other controllers offline, own services and Traffic available`, () => {
  const state = engineFor({trainingStation: `EGPH:${mode}`}).initialExercise(), environment = state.radarEnvironment!;
  assert.equal(environment.facilityDefaultActive, false);
  for (const f of facilities) {
    if (f.type === "unicom") assert.ok(facilityActive(f, environment));
    else if (!Object.hasOwn(environment.facilityActivity!, f.id)) assert.equal(facilityActive(f, environment), false);
  }
  const services = mode === "local" ? ["ground", "tower", "atis"] : [mode, "atis"];
  for (const type of services) assert.equal(environment.facilityActivity![`EGPH:${type}`], true);
  const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  assert.deepEqual(restored.radarEnvironment, environment);
  assert.deepEqual(atisFrequencies(getAirport(state), environment), []);
  if (mode !== "local") {
    const handoffs = catalogFor(getAirport(state), environment).messageMenu(mode, state.aircraft[0]).find(m => m.label === "Contact Other Frequency")!.children!;
    assert.ok(handoffs.some(m => m.label.startsWith("Traffic on")));
  }
});
test("explicit facility choices survive fresh scenarios, restore, and local reset", () => {
  const airport = getAirport(), environment = {...radarEnvironmentFor(airport), facilityActivity: {custom: true, "EGPH:tower": false}};
  const state = engineFor({trainingStation: "EGPH:local", radarEnvironment: environment}).initialExercise();
  assert.equal(state.radarEnvironment!.facilityActivity!.custom, true);
  assert.equal(state.radarEnvironment!.facilityActivity!["EGPH:tower"], false);
  const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  const result = applyEnvelope(restored, {id: randomUUID(), time: 0, action: {kind: "reset"}});
  assert.equal(result.error, undefined);
  assert.equal(result.state.radarEnvironment!.facilityActivity!.custom, true);
  assert.equal(result.state.radarEnvironment!.facilityActivity!["EGPH:tower"], false);
});
test("legacy snapshots retain their previous online defaults without being rewritten", () => {
  const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise();
  state.radarEnvironment = radarEnvironmentFor(getAirport(state));
  const before = structuredClone(state.radarEnvironment);
  const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  assert.deepEqual(restored.radarEnvironment, before);
  assert.equal(restored.radarEnvironment!.facilityDefaultActive, undefined);
  assert.ok(facilityActive(facilities.find(f => f.type === "tower")!, restored.radarEnvironment));
});
test("explicit configured facilities retain both online and offline choices in a fresh session", () => {
  const airport = getAirport(), source = facilities.find(f => f.type === "tower")!;
  const environment = {...radarEnvironmentFor(airport), facilities: [{...source, id: "online", active: true}, {...source, id: "offline", active: false}]};
  const state = engineFor({trainingStation: "EGPH:approach", radarEnvironment: environment}).initialExercise();
  assert.equal(facilityActive(environment.facilities[0], state.radarEnvironment), true);
  assert.equal(facilityActive(environment.facilities[1], state.radarEnvironment), false);
  assert.equal(facilityActive({...source, id: "unknown"}, state.radarEnvironment), false);
  assert.equal(facilityActive({...source, type: "unicom", active: false}, radarEnvironmentFor(airport)), false);
});
test("handoff menu and server validation follow explicit activity changes", () => {
  let state = engineFor({trainingStation: "EGPH:approach"}).initialExercise();
  const airport = getAirport(state), traffic = availableHandoffs(state.aircraft[0], airport, "approach")[0];
  assert.equal(traffic.type, "unicom");
  const instruction = {type: "frequency" as const, frequency: traffic.type, facilityId: traffic.id};
  assert.equal(validateControllerMessage(state, state.aircraft[0], instruction, "approach"), null);
  const result = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "facilities", activity: {...state.radarEnvironment!.facilityActivity, [traffic.id]: false}}});
  assert.equal(result.error, undefined); state = result.state;
  assert.ok(validateControllerMessage(state, state.aircraft[0], instruction, "approach"));
  const menu = catalogFor(airport, state.radarEnvironment).messageMenu("approach", state.aircraft[0]);
  assert.equal(menu.find(m => m.label === "Contact Other Frequency")!.children!.some(m => m.instruction?.type === "frequency" && m.instruction.facilityId === traffic.id), false);
});
test("activity overrides configured availability consistently, including offline default and airspace highlighting", () => {
  const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise(), environment = state.radarEnvironment!;
  const custom = {id: "custom-sector", type: "center" as const, active: false};
  assert.equal(facilityActive(custom, environment), false);
  environment.facilityActivity![custom.id] = true;
  assert.equal(facilityActive(custom, environment), true);
  const airspaces = projectAirspaces(getAirport(state));
  assert.equal(airspaceOutlines(airspaces, false, [], {}, false).length, 0);
  if (airspaces.length) {
    assert.equal(airspaceOutlines(airspaces, false, [airspaces[0].id], {}, false).length, 1);
    assert.equal(airspaceOutlines(airspaces, false, [], {[airspaces[0].id]: true}, false).length, 1);
  }
});
