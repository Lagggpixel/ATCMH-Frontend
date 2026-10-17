import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {advance, applyEnvelope, autoReadbacks, engineFor, initialExercise, restoreExercise} from "./engine";
import {exerciseSchema} from "./protocol";
import {radioMessageText} from "./radio-audio";
import {SessionService} from "./server/session-service";
import {MemoryStore} from "./session-test-store";
import type {Action, Exercise} from "./model";

const act = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined);
  return result.state;
};
function refusedSpeed() {
  let state = engineFor({trainingStation: "EGPH:approach"}).initialExercise();
  state.aircraft = [state.aircraft[0]];
  state.running = true; state.autoReadback = true;
  delete state.aircraft[0].radar!.report;
  state = act(state, {kind: "command", aircraftId: state.aircraft[0].id, frequency: "approach",
    command: {type: "radar-speed", mode: "maintain", unit: "knots", value: 100, relation: "exact"}, text: ""});
  return autoReadbacks(advance(state, 1.5), 2500, randomUUID);
}

test("automatic Unable retains its exact reason through snapshot restoration without changing radio speech", () => {
  const state = refusedSpeed(), reply = state.messages.at(-1)!;
  assert.equal(reply.unableReason, "Speed outside aircraft limits.");
  assert.equal(reply.text, `Unable, ${state.aircraft[0].callsign}`);
  assert.equal(radioMessageText(reply), reply.text);
  const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))) as Exercise);
  assert.equal(restored.messages.at(-1)!.unableReason, reply.unableReason);
  assert.equal(restored.messages[0].unableReason, undefined);
});

test("manual Unable explains an invalid assignment or records the mentor's choice for a valid one", () => {
  for (const instruction of [{type: "takeoff", runway: "24"}, {type: "extend", leg: "downwind"}] satisfies Extract<Action, {kind: "command"}>["command"][]) {
    let state = initialExercise(); state.autoReadback = false;
    state = act(state, {kind: "command", aircraftId: "demo-air", frequency: "tower", command: instruction, text: ""});
    const before = structuredClone(state.aircraft);
    state = act(state, {kind: "pilot", aircraftId: "demo-air", replyTo: state.messages[0].id, text: "Unable, Speedbird 124"});
    const reason = state.messages.at(-1)!.unableReason;
    if (instruction.type === "takeoff") assert.ok(reason && reason !== "Declined by mentor.");
    else assert.equal(reason, "Declined by mentor.");
    assert.deepEqual(state.aircraft.map(a => a.mode), before.map(a => a.mode));
  }
});

test("mentor logs show gray bracketed reasons; learner logs and old messages have none", () => {
  const require = createRequire(import.meta.url), original = require.extensions[".css"];
  require.extensions[".css"] = module => {module.exports = {unableReason: "unableReason"};};
  try {
    const {MessageLog} = require("./MessagePanel.tsx") as typeof import("./MessagePanel");
    const state = refusedSpeed();
    const render = (showUnableReasons = false, aircraftId?: string) => renderToStaticMarkup(React.createElement(MessageLog, {
      messages: state.messages, frequency: "all", showUnableReasons, aircraftId,
    }));
    assert.match(render(true), /class="unableReason"> \[Speed outside aircraft limits\.\]<\/span>/);
    assert.doesNotMatch(render(), /Speed outside aircraft limits/);
    assert.match(render(true, state.aircraft[0].id), /\[Speed outside aircraft limits\.\]/);
    delete state.messages.at(-1)!.unableReason;
    assert.doesNotMatch(render(true), /class="unableReason"/);
    const css = readFileSync(new URL("./Simulator.module.css", import.meta.url), "utf8");
    assert.match(css, /\.unableReason\s*\{color:#a3adb7\}/);
  } finally {
    if (original) require.extensions[".css"] = original;
    else delete require.extensions[".css"];
  }
});

test("learner join and stream frames omit the reason while mentor reconnect retains it", async () => {
  const store = new MemoryStore(), service = new SessionService(store, () => 1000);
  const staff = {accountId: "mentor", staff: true};
  const session = await service.create(staff, "Unable reasons", refusedSpeed());
  const learner = {accountId: "learner", staff: false, learnerSession: session.id};
  const control = randomUUID(), student = randomUUID();
  const mentor = await service.join(staff, session.id, "staff", control);
  assert.equal(mentor.exercise.messages.at(-1)!.unableReason, "Speed outside aircraft limits.");
  for (const view of [await service.join(learner, session.id, "mentee", student), await service.frame(learner, session.id, "mentee", student)]) {
    assert.equal("unableReason" in view.exercise.messages.at(-1)!, false);
    assert.equal(view.exercise.messages.at(-1)!.text, mentor.exercise.messages.at(-1)!.text);
  }
  const reconnected = await service.frame(staff, session.id, "staff", control);
  assert.equal(reconnected.exercise.messages.at(-1)!.unableReason, "Speed outside aircraft limits.");
});
