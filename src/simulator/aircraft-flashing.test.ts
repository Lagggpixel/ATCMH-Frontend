import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {aircraftAppearance} from "./aircraft-flashing";
import {applyEnvelope, initialExercise, newAircraft, restoreExercise} from "./engine";
import {frequencyPendingRequests, pendingPilotMessage, pendingRequestCount, type Action, type Exercise} from "./model";

const aircraft = () => ({...newAircraft("flash-aircraft", true), frequency: "tower" as const, clearedToLand: false, assigned: undefined});

test("pending requests flash the on-frequency icon and text independently", () => {
  const a = aircraft();
  assert.deepEqual(aircraftAppearance(a, "tower", {pending: true}), {iconColor: "#87cefa", textColor: "#d3d3d3", iconFlash: "pending", textFlash: "pending"});
  const highlighted = aircraftAppearance({...a, color: "#5593d0"}, "tower", {pending: true});
  assert.equal(highlighted.iconFlash, "pending"); assert.equal(highlighted.textFlash, undefined); assert.equal(highlighted.textColor, "#5593d0");
});

test("off-frequency requests stay gray and selected/open labels stay white", () => {
  const a = aircraft();
  for (const attention of [{pending: true}, {pending: true, selected: true}, {open: true}]) {
    const colors = aircraftAppearance(a, "ground", attention);
    assert.equal(colors.iconColor, "#808080"); assert.equal(colors.iconFlash, undefined);
    if ("selected" in attention || "open" in attention) {assert.equal(colors.textColor, "#ffffff"); assert.equal(colors.textFlash, undefined);}
  }
});

test("open-strip alternation overrides reminders and reminders override request flashes", () => {
  const a = aircraft();
  assert.equal(aircraftAppearance(a, "tower", {open: true, reminder: true, pending: true}).iconFlash, "extended");
  assert.equal(aircraftAppearance(a, "tower", {reminder: true, pending: true}).iconFlash, "reminder");
  assert.equal(aircraftAppearance(a, "tower", {reminder: true, pending: true}).textFlash, "reminder");
  assert.equal(aircraftAppearance({...a, clearedToLand: true}, "tower").textColor, "#90ee90");
});

test("a dismissed strip keeps its tuned aircraft white while its text can still request attention", () => {
  const colors = aircraftAppearance(aircraft(), "tower", {pending: true, hasStripControl: false});
  assert.equal(colors.iconColor, "#ffffff"); assert.equal(colors.iconFlash, undefined); assert.equal(colors.textFlash, "pending");
  assert.equal(aircraftAppearance(aircraft(), "ground", {hasStripControl: false}).iconColor, "#808080");
  assert.equal(aircraftAppearance(aircraft(), "tower", {hasStripControl: false, alert: "alert"}).iconColor, "#ff0000");
});

test("TCAS overrides icon flashing without suppressing text and drag overrides custom text", () => {
  const a = aircraft();
  for (const alert of ["warning", "alert"] as const) {
    const colors = aircraftAppearance(a, "tower", {open: true, alert});
    assert.equal(colors.iconColor, alert === "alert" ? "#ff0000" : "#ffa500");
    assert.equal(colors.iconFlash, undefined); assert.equal(colors.textFlash, "extended");
  }
  const dragging = aircraftAppearance({...a, color: "#fc473a"}, "tower", {open: true, dragging: true});
  assert.equal(dragging.textColor, "#ff00ff"); assert.equal(dragging.textFlash, undefined); assert.equal(dragging.iconFlash, "extended");
});

let sequence = 0;
const act = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, {id: `flash-${++sequence}`, time: 1000 + sequence, action});
  assert.equal(result.error, undefined); return result.state;
};
test("viewing a strip clears every notification and reminder but preserves contextual replies after reload", () => {
  let state = initialExercise();
  for (let i = 0; i < 3; i++) state = act(state, {kind: "pilot", aircraftId: "demo-ground", text: `Request ${i}`});
  state = act(state, {kind: "edit", aircraftId: "demo-ground", patch: {reminderAt: 0}});
  assert.equal(pendingRequestCount(state, "demo-ground", "ground"), 3);
  state = act(state, {kind: "read", aircraftId: "demo-ground", frequency: "ground"});
  state = restoreExercise(state);
  assert.equal(pendingRequestCount(state, "demo-ground", "ground"), 0);
  assert.equal(state.aircraft.find(a => a.id === "demo-ground")!.reminderAt, null);
  assert.ok(pendingPilotMessage(state, "demo-ground", "ground"));
  state = act(state, {kind: "pilot", aircraftId: "demo-ground", text: "A new request"});
  assert.equal(frequencyPendingRequests(state).ground, 1);
});

test("acknowledgements, standby, miscellaneous calls and readbacks never create attention", () => {
  const state = initialExercise();
  state.messages = (["roger", "wilco", "unable", "standby", "excellent-service", "back-with-you"] as const).map((id, index) => ({id: `ignored-${index}`, aircraftId: "demo-ground", frequency: "ground", sender: "pilot", time: index, text: "No attention", read: false, request: {id, runway: "24"}}));
  state.messages.push({id: "readback", aircraftId: "demo-ground", frequency: "ground", sender: "pilot", time: 10, text: "Changing frequency", read: false, commandId: "handoff"});
  assert.equal(frequencyPendingRequests(state).ground, 0);
  state.messages.push({id: "request", aircraftId: "demo-ground", frequency: "ground", sender: "pilot", time: 11, text: "Request taxi", read: false});
  assert.equal(frequencyPendingRequests(state).ground, 1);
});

test("rendered aircraft pair icon/text flashes, show open-strip state and retain notification counts", () => {
  const require = createRequire(import.meta.url), original = require.extensions[".css"];
  require.extensions[".css"] = module => {module.exports = new Proxy({}, {get: (_, key) => key === "__esModule" ? false : String(key)});};
  try {
    const Scope = require("./Scope").default as typeof import("./Scope").default;
    const Strip = require("./ControllerStrip").default as typeof import("./ControllerStrip").default;
    const a = {...aircraft(), position: {x: 0, y: 0}};
    const props = {aircraft: [a], frequency: "tower" as const, running: false, selected: null, onSelect() {}};
    const pending = renderToStaticMarkup(createElement(Scope, {...props, pendingAircraft: [a.id]}));
    assert.match(pending, /class="aircraft pendingAircraft /); assert.match(pending, /class="aircraftTag pendingAircraftLabel /);
    const open = renderToStaticMarkup(createElement(Scope, {...props, openStripId: a.id}));
    assert.match(open, /class="aircraft extendedAircraftPulse extendedAircraftIndicator/); assert.match(open, /class="aircraftTag extendedAircraftLabel /);
    const off = renderToStaticMarkup(createElement(Scope, {...props, frequency: "ground", selected: a.id, pendingAircraft: [a.id]}));
    assert.ok(!off.includes("pendingAircraftLabel")); assert.ok(!off.includes("aircraft pendingAircraft "));
    const strip = renderToStaticMarkup(createElement(Strip, {aircraft: a, runway: "24", selected: false, pending: 3, reminder: true, connected: true, onSelect() {}, onFocus() {}, onMessages() {}, onDismiss() {}}));
    assert.ok(strip.includes("ATC (3)")); assert.match(strip, /class="strip  reminder"/);
  } finally {if (original) require.extensions[".css"] = original; else delete require.extensions[".css"];}
});
