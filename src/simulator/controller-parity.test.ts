import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {envelopeSchema, menteeActionAllowed} from "./protocol";
import type {Instruction} from "./model";

test("guard reaches an untuned aircraft without granting other controller commands", () => {
  const engine = engineFor({trainingStation: "EGPH:approach"}), state = engine.initialExercise();
  const aircraft = engine.newAircraft("guard-test", true); aircraft.frequency = "center"; state.aircraft = [aircraft];
  const command: Instruction = {type: "atc", action: "guard", frequency: "approach", variant: "contact"};
  assert.equal(engine.validateControllerMessage(state, aircraft, command, "approach"), null);
  if (command.type === "atc") {
    assert.equal(menteeActionAllowed({kind: "command", aircraftId: aircraft.id, frequency: "approach", command, text: "Guard warning"}, state), true);
    assert.equal(menteeActionAllowed({kind: "command", aircraftId: aircraft.id, frequency: "approach", command: {type: "vector", heading: 90}, text: "Vector"}, state), false);
    assert.equal(menteeActionAllowed({kind: "command", aircraftId: aircraft.id, frequency: "atis", command, text: "Guard warning"}, state), false);
  }
  assert.ok(engine.validateControllerMessage(state, aircraft, {type: "vector", heading: 90}, "approach"));
  assert.ok(engine.validateControllerMessage(state, aircraft, {...command, frequency: "center"}, "approach"));
  assert.ok(engine.validateControllerMessage(state, aircraft, command, "atis"));
  const result = engine.applyEnvelope(state, {id: "guard-warning", time: 1000, action: {kind: "command", aircraftId: aircraft.id, frequency: "approach", command}});
  assert.equal(result.error, undefined); assert.equal(result.state.messages.at(-1)?.frequency, "approach");
  assert.equal(result.state.aircraft[0].frequency, "center");
  assert.deepEqual(result.state.aircraft[0].position, aircraft.position);
  aircraft.active = false; assert.ok(engine.validateControllerMessage(state, aircraft, command, "approach"));
});

test("direct-to preserves the snapped waypoint and rejects a changed route", () => {
  const engine = engineFor({trainingStation: "EGPH:approach"}), state = engine.initialExercise();
  const aircraft = engine.newAircraft("direct-test", true); aircraft.flightPlan = [{name: "MERGE", x: 10, y: 2}]; state.aircraft = [aircraft];
  const command: Instruction = {type: "route", index: 0, name: "MERGE", point: {x: 10, y: 2}};
  const envelope = {id: "direct", time: 1000, action: {kind: "command", aircraftId: aircraft.id, frequency: "approach", command, text: "Proceed direct MERGE"}};
  const parsed = envelopeSchema.parse(envelope); assert.deepEqual(parsed.action.kind === "command" && parsed.action.command, command);
  assert.equal(engine.validateControllerMessage(state, aircraft, command, "approach"), null);
  aircraft.flightPlan[0].x = 11; assert.match(engine.validateControllerMessage(state, aircraft, command, "approach") ?? "", /waypoint has changed/);
});
