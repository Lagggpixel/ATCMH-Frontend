import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {createRequire} from "node:module";
import {renderToStaticMarkup} from "react-dom/server";
import {getAirport} from "./airports";
import {initialExercise} from "./engine";
import type {DemoState} from "./demonstration";
import {latestShadowState, readTraineeControls, traineeControlsKey, traineeFocus, traineePath, traineeShortcut, traineeStep, writeTraineeControls} from "./trainee-overlay";

// Components import CSS modules; class names are not under test.
const require = createRequire(import.meta.url);
require.extensions[".css"] = module => {module.exports = {};};
const {TraineeControlsSwitch, TraineeMessages, TraineeScopeLayer, traineePeek} = require("./TraineeOverlay") as typeof import("./TraineeOverlay");

const state = (extra: Partial<DemoState> = {}): DemoState => ({
  frequency: "approach", selectedId: null, messageId: null, menuPath: [], dismissedStrips: {},
  quickHidden: false, utility: null, vectorDraft: null, ground: null, camera: null, ...extra,
});

test("each account keeps its own trainee controls setting: shown by default, not followed", () => {
  const saved = new Map<string, string>();
  const storage = {getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => {saved.set(key, value);}};
  assert.deepEqual(readTraineeControls(storage, "trainer"), {show: true, follow: false});
  writeTraineeControls(storage, "owner", {show: false, follow: true});
  assert.deepEqual(readTraineeControls(storage, "owner"), {show: false, follow: true});
  assert.deepEqual(readTraineeControls(storage, "trainer"), {show: true, follow: false}, "the Owner's choice does not change the trainer's");
  saved.set(traineeControlsKey("broken"), "{not json");
  assert.deepEqual(readTraineeControls(storage, "broken"), {show: true, follow: false});
  assert.deepEqual(readTraineeControls({getItem: () => {throw new Error("blocked");}, setItem: () => {}}, "x"), {show: true, follow: false});
  saved.set(traineeControlsKey("legacy"), JSON.stringify({show: true, followZoom: true}));
  assert.deepEqual(readTraineeControls(storage, "legacy"), {show: true, follow: true}, "the older zoom-only setting carries over as Follow");
});

test("the newest shadow state wins and open messages take focus over selection", () => {
  const first = state({selectedId: "a1"}), second = state({selectedId: "a2", messageId: "a3"});
  assert.equal(latestShadowState(null, {seq: 1, state: first, batches: []}), first);
  assert.equal(latestShadowState(first, {seq: 2, batches: [{seq: 1, sentAt: 0, elapsed: 0, pointer: [], events: [], state: second}, {seq: 2, sentAt: 0, elapsed: 0, pointer: [], events: []}]}), second);
  assert.equal(latestShadowState(first, {seq: 3, batches: []}), first, "a frame with only clicks keeps the last state");
  assert.equal(traineeFocus(first), "a1"); assert.equal(traineeFocus(second), "a3"); assert.equal(traineeFocus(null), null);
});

test("V toggles only while the scope has focus and nobody is typing", () => {
  const scope = {tagName: "DIV", closest: (selector: string) => selector.includes("radar") ? {} : null};
  const outside = {tagName: "DIV", closest: () => null};
  const input = {tagName: "INPUT", closest: () => ({})};
  const key = (target: unknown, extra = {}) => ({key: "v", ctrlKey: false, metaKey: false, altKey: false, target: target as EventTarget, ...extra});
  assert.equal(traineeShortcut(key(scope)), true);
  assert.equal(traineeShortcut(key(scope, {key: "V"})), true);
  assert.equal(traineeShortcut(key(outside)), false);
  assert.equal(traineeShortcut(key(input)), false);
  assert.equal(traineeShortcut(key(scope, {ctrlKey: true})), false, "Ctrl+V still pastes");
});

test("the staff radar draws the trainee's ring, vector and open messages in blue, read-only", () => {
  const exercise = initialExercise(), aircraft = exercise.aircraft[0];
  assert.ok(aircraft, "the default exercise has traffic");
  const project = (p: {x: number; y: number}) => ({x: 400 + p.x * 20, y: 300 - p.y * 20});
  const layer = renderToStaticMarkup(React.createElement(TraineeScopeLayer, {state: state({selectedId: aircraft.id, vectorDraft: {aircraftId: aircraft.id, point: {x: aircraft.position.x + 8, y: aircraft.position.y}}}), name: "Alex", aircraft: exercise.aircraft, airport: getAirport(exercise), project, scale: 20, size: {width: 800, height: 600}}));
  assert.match(layer, new RegExp(`Alex has ${aircraft.callsign} selected`));
  assert.match(layer, /Alex is vectoring/);
  assert.match(layer, /stroke="#499cff"/);
  assert.match(layer, /Vector \d{3}° · \d+NM/, "the caption gives the heading in place of a details box");
  assert.doesNotMatch(layer, /aria-expanded/, "a drag has nothing to peek at");
  assert.equal(renderToStaticMarkup(React.createElement(TraineeMessages, {name: "Alex", state: state({selectedId: aircraft.id}), exercise})), "", "no list until the trainee opens messages");
  const messages = renderToStaticMarkup(React.createElement(TraineeMessages, {name: "Alex", state: state({messageId: aircraft.id}), exercise}));
  assert.match(messages, new RegExp(`Alex&#x27;s open messages`));
  assert.match(messages, /<li/);
  assert.doesNotMatch(messages, /<button/, "the staff copy cannot send");
});

test("the caption names the step the trainee is on, in one short line", () => {
  assert.equal(traineeStep(null), null);
  assert.equal(traineeStep(state({selectedId: "a1", quickHidden: true})), null, "selected with no menu open: just their name");
  assert.equal(traineeStep(state({selectedId: "a1"})), "Menu open");
  assert.equal(traineeStep(state({selectedId: "a1", quickPicker: "altitude"})), "Assign Altitude");
  assert.equal(traineeStep(state({selectedId: "a1", quickPicker: "altitude", vectorHeading: 270})), "Assign Altitude · 270°");
  assert.equal(traineeStep(state({selectedId: "a1", vectorHeading: 0})), "Vector 360°");
  assert.equal(traineeStep(state({selectedId: "a1", quickPicker: "direct-altitude", vectorTarget: {index: 2, name: "LAM", point: {x: 0, y: 0}}})), "Direct To LAM + Altitude");
  assert.equal(traineeStep(state({selectedId: "a1", messageId: "a1", menuPath: ["Request Hold", "Present Position"]})), "Request Hold › Present Position");
  assert.equal(traineeStep(state({messageId: "a1"})), "Other Message");
  assert.equal(traineePath(["Approach", "Expect", "ILS 27R"]), "… › Expect › ILS 27R", "long paths keep the last two steps");
  assert.equal(traineeStep(state({selectedId: "a1", ground: {aircraftId: "a1", kind: "pushback", controls: [], destination: {type: "point"}, holds: {}}})), "Pushback draft");
  assert.equal(traineeStep(state({selectedId: "a1", vectorDraft: {aircraftId: "a1", point: {x: 0, y: 0}, initial: true}})), "Vector");
});

test("the trainee's menus are not copied onto the radar; the caption peeks at them on request", () => {
  const exercise = initialExercise(), aircraft = exercise.aircraft[0];
  const project = (p: {x: number; y: number}) => ({x: 400 + p.x * 20, y: 300 - p.y * 20});
  const view = state({selectedId: aircraft.id, quickPicker: "altitude"});
  const menu = () => React.createElement("div", null, "copied menu");
  const trainee = {name: "Sam", state: view, follow: false, menu};
  const peek = traineePeek(trainee, exercise.aircraft);
  assert.ok(peek, "the open menu is available to peek at");
  const layer = renderToStaticMarkup(React.createElement(TraineeScopeLayer, {state: view, name: "Sam", aircraft: exercise.aircraft, airport: getAirport(exercise), project, scale: 20, size: {width: 800, height: 600}, peek}));
  assert.match(layer, />Sam<\/strong><span>Assign Altitude<\/span>/);
  assert.match(layer, /aria-expanded="false"/);
  assert.doesNotMatch(layer, /copied menu/, "closed until hovered or tapped");
  assert.equal(traineePeek({...trainee, state: state({selectedId: aircraft.id, quickHidden: true})}, exercise.aircraft), null);
  const messages = React.createElement("p", null, "list");
  assert.equal(traineePeek({...trainee, state: state({messageId: aircraft.id}), messages}, exercise.aircraft), messages);
});

test("the trainee control is one pill: controls and Follow, with a picker only when there are several trainees", () => {
  const props = {name: "Sam", show: true, follow: false, onShow: () => {}, onFollow: () => {}};
  const single = renderToStaticMarkup(React.createElement(TraineeControlsSwitch, props));
  assert.match(single, /Sam&#x27;s controls|Sam’s controls/);
  assert.match(single, /role="switch"[^>]*aria-checked="true"/);
  assert.match(single, />Follow</);
  assert.doesNotMatch(single, /role="menu"/);
  const several = renderToStaticMarkup(React.createElement(TraineeControlsSwitch, {...props, positions: [{id: "n", name: "North", trainee: "Sam"}, {id: "s", name: "South", trainee: "Kim"}], position: "s"}));
  assert.match(several, /aria-haspopup="menu"/);
  assert.match(several, /Kim · South/);
  assert.doesNotMatch(several, /role="menu"/, "the picker opens only when asked");
  const off = renderToStaticMarkup(React.createElement(TraineeControlsSwitch, {...props, show: false}));
  assert.match(off, /(Trainee|Mentee) controls/);
  assert.match(off, /<button[^>]*disabled=""[^>]*>.*Follow/, "Follow needs the controls shown first");
});

test("the trainer sees the trainee's menu only while no messages, drag or hidden menu replace it", async () => {
  const {traineeMenuAircraft, traineeView} = await import("./trainee-overlay");
  assert.equal(traineeMenuAircraft(state({selectedId: "a1"})), "a1");
  assert.equal(traineeMenuAircraft(state({selectedId: "a1", messageId: "a1"})), null);
  assert.equal(traineeMenuAircraft(state({selectedId: "a1", quickHidden: true})), null);
  assert.equal(traineeMenuAircraft(state({selectedId: "a1", vectorDraft: {aircraftId: "a1", point: {x: 0, y: 0}}})), null);
  assert.equal(traineeMenuAircraft(null), null);
  const view = traineeView(state({selectedId: "a1", quickPicker: "altitude"}));
  assert.equal(view?.quickPicker, "altitude");
  assert.ok(!("vectorHeading" in (view ?? {})), "unset fields are left out");
});

test("after a seat handover, the replay labels each control with the trainee who produced it", async () => {
  const {replayTraineeAt, replayTraineeName} = await import("./trainee-overlay");
  const {DemoSentCard} = require("./DemoMirror") as typeof import("./DemoMirror");
  const exercise = initialExercise(), aircraft = exercise.aircraft[0];
  const participants = [{role: "mentee" as const, accountId: "alice", name: "Alice", positionId: "north"}, {role: "mentee" as const, accountId: "bob", name: "Bob", positionId: "north"}];
  const marks = [
    {at: 1, positionId: "north", accountId: "alice", state: state({messageId: aircraft.id})},
    {at: 5, positionId: "north", accountId: "bob", state: state({messageId: aircraft.id})},
    {at: 6, positionId: "north", accountId: "bob", sent: {callsign: aircraft.callsign, text: "Descend", path: []}},
  ];
  const render = (time: number) => {
    const at = replayTraineeAt(marks, "north", time);
    const name = replayTraineeName(participants, at.stateBy), sentName = replayTraineeName(participants, at.sent?.accountId);
    return renderToStaticMarkup(React.createElement(React.Fragment, null,
      at.sent ? React.createElement(DemoSentCard, {sent: at.sent, by: sentName ?? "Mentee"}) : null,
      React.createElement(TraineeMessages, {name, state: at.state, exercise})));
  };
  const before = render(2);
  assert.match(before, /Alice&#x27;s open messages/);
  const after = render(7);
  assert.match(after, new RegExp(`Bob sent to ${aircraft.callsign}`));
  assert.match(after, /Bob&#x27;s open messages/);
  assert.doesNotMatch(after, /Alice/, "Bob's controls never borrow Alice's name");
  // Bob's own filtered replay still lists Alice as a participant on north; the mark's account decides.
  assert.equal(replayTraineeName(participants, "bob"), "Bob");
  assert.equal(replayTraineeName(participants, undefined), undefined, "an unattributed mark falls back to the generic label");
});
