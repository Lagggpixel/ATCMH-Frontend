import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor, applyEnvelope, advance, autoReadbacks, restoreExercise} from "./engine";
import {getAirport} from "./airports";
import {catalogFor, type MenuEntry} from "./catalog";
import {headingDifference} from "./radar";
import {magneticToTrue} from "./magnetic-headings";
import {exerciseSchema} from "./protocol";
import type {Instruction} from "./model";

const leaves = (entries: MenuEntry[]): Instruction[] => entries.flatMap(e => e.instruction ? [e.instruction] : leaves(e.children ?? []));
for (const mode of ["approach", "center"]) for (const automatic of [true, false]) for (const heading of [10, 180, 360]) test(`${mode} Automatic ${automatic}: missed heading ${heading} turns after accepted readback and restore`, () => {
  let state = engineFor({trainingStation: `EGPH:${mode}`}).initialExercise(); state.running = true; state.autoReadback = automatic;
  const a = state.aircraft[0], airport = getAirport(state);
  a.radar!.expected = a.radar!.cleared = state.radarEnvironment!.approaches[0].id; delete a.radar!.report;
  a.heading = a.targetHeading = magneticToTrue(90, airport);
  const initialHeading = a.heading;
  const menu = catalogFor(airport, state.radarEnvironment).messageMenu(mode as "approach" | "center", a);
  const commands = leaves(menu.find(e => e.label === "Missed Approach Instructions")!.children!.find(e => e.label === "Altitude and Heading")!.children!);
  const command = commands.find(c => c.type === "missed-approach" && c.heading === heading && c.altitude.unit === "feet" && c.altitude.value === 6000)!;
  assert.ok(command);
  let result = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "command", aircraftId: a.id, frequency: mode as "approach" | "center", command, text: ""}});
  assert.equal(result.error, undefined); state = result.state;
  assert.equal(state.aircraft[0].targetHeading, initialHeading, "sending alone does not apply flight controls");
  if (automatic) state = autoReadbacks(advance(state, 1.5), 1500, randomUUID);
  else {
    state = advance(state, 2);
    assert.equal(state.aircraft[0].targetHeading, initialHeading);
    result = applyEnvelope(state, {id: randomUUID(), time: 2000, action: {kind: "pilot", aircraftId: a.id, replyTo: state.messages[0].id, text: "Readback", assign: true}});
    assert.equal(result.error, undefined); state = result.state;
  }
  state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  const target = magneticToTrue(heading, airport), before = Math.abs(headingDifference(target, state.aircraft[0].heading));
  assert.ok(Math.abs(headingDifference(target, state.aircraft[0].targetHeading)) < 1e-8);
  const after = advance(state, 10).aircraft[0];
  assert.ok(Math.abs(headingDifference(target, after.heading)) < before, "physical heading must change toward the assigned heading");
  assert.equal(after.radar!.navigation, "missed");
});
for (const heading of [-1, 361, NaN]) test(`missed approach rejects invalid heading ${heading}`, () => {
  const engine = engineFor({trainingStation: "EGPH:approach"}), a = engine.initialExercise().aircraft[0];
  assert.match(engine.validateAssignment(a, {type: "missed-approach", heading, altitude: {unit: "feet", value: 6000}})!, /heading from 0 to 360/);
});
