import assert from "node:assert/strict";
import test from "node:test";
import type {DemoState} from "./demonstration";
import {traineeReplayEvents} from "./replay-events";
import {participantReplay, type ReplayDetail} from "./replays";
import {replayTraineeAt, replayTraineePositions, traineeReplayMarks} from "./trainee-overlay";

const state = (extra: Partial<DemoState> = {}): DemoState => ({
  frequency: "approach", selectedId: null, messageId: null, menuPath: [], dismissedStrips: {},
  quickHidden: false, utility: null, vectorDraft: null, ground: null, camera: null, ...extra,
});
// One batch per second of exercise time; each was sent at the end of its second.
const batch = (elapsed: number, extra: Partial<DemoState> | null, events: {kind: "sent"; t: number; callsign: string; text: string; path: string[]}[] = []) =>
  ({elapsed, batch: {sentAt: elapsed * 1000, elapsed, pointer: [], events, ...(extra ? {state: state(extra)} : {})}});

test("shadow traces become replay marks on the replay clock, keeping only what the overlay draws", () => {
  const marks = traineeReplayMarks([
    batch(10, {selectedId: "a1", quickHidden: true}),
    batch(11, {selectedId: "a1", quickHidden: false}),
    batch(12, {selectedId: "a1", messageId: "a1"}, [{kind: "sent", t: 12_000, callsign: "EZY24", text: "Descend 5000", path: ["Altitude"]}]),
  ], "north", 30, 12);
  assert.deepEqual(marks.map(mark => mark.at), [28, 30, 30], "exercise second 12 is replay second 30");
  assert.equal(marks.filter(mark => mark.state).length, 2, "a change only to quick commands is not a new mark");
  assert.ok(!("quickHidden" in marks[0].state!), "quick commands stay out of replays");
  assert.deepEqual(marks.at(-1)!.sent, {callsign: "EZY24", text: "Descend 5000", path: ["Altitude"]});
  assert.ok(marks.every(mark => mark.positionId === "north"));
});

test("a drag keeps at most ten marks a second", () => {
  const entries = Array.from({length: 30}, (_, i) => ({elapsed: i / 30, batch: {sentAt: i / 30 * 1000, elapsed: i / 30, pointer: [], events: [], state: state({vectorDraft: {aircraftId: "a1", point: {x: i, y: 0}}})}}));
  const marks = traineeReplayMarks(entries, "main", 1, 1);
  assert.ok(marks.length <= 11, `${marks.length} marks`);
  assert.equal(marks.at(-1)!.state!.vectorDraft!.point.x, 29, "the newest drag point is kept");
});

test("the replay shows one position's latest controls and its sent command for a few seconds", () => {
  const marks = [
    {at: 5, positionId: "north", state: state({selectedId: "a1"})},
    {at: 6, positionId: "south", state: state({selectedId: "b1"})},
    {at: 8, positionId: "north", sent: {callsign: "EZY24", text: "Descend", path: []}},
  ];
  assert.deepEqual(replayTraineePositions(marks), ["north", "south"]);
  assert.equal(replayTraineeAt(marks, "north", 4).state, null);
  assert.equal(replayTraineeAt(marks, "north", 7).state?.selectedId, "a1");
  assert.equal(replayTraineeAt(marks, "south", 7).state?.selectedId, "b1");
  assert.equal(replayTraineeAt(marks, "north", 9).sent?.callsign, "EZY24");
  assert.equal(replayTraineeAt(marks, "north", 60).sent, null, "the sent card fades");
  const events = traineeReplayEvents(marks, "north", 100);
  assert.equal(events.length, 1); assert.equal(events[0].kind, "trainee"); assert.equal(events[0].at, 8);
  assert.equal(traineeReplayEvents(marks, "north", 7).length, 0, "events past the recording are dropped");
});

test("a trainee replays only their own position's controls", () => {
  const detail = {
    replay: {participants: [{role: "mentee", accountId: "t1", positionId: "north", name: "Alex"}, {role: "mentee", accountId: "t2", positionId: "south", name: "Sam"}]},
    initial: null,
    frames: [{at: 1, delta: {state: {}, shadow: [{at: 1, positionId: "north", state: state()}, {at: 1, positionId: "south", state: state()}, {at: 1, positionId: "main", state: state()}]}}],
  } as unknown as ReplayDetail;
  assert.deepEqual(participantReplay(detail, "t1").frames[0].delta.shadow?.map(mark => mark.positionId), ["north", "main"]);
  assert.deepEqual(participantReplay(detail, "t2").frames[0].delta.shadow?.map(mark => mark.positionId), ["south", "main"]);
  assert.equal(participantReplay(detail, "someone").frames[0].delta.shadow, undefined, "a non-participant sees none");
});

test("trainee marks survive the compact replay format", async () => {
  const {ByteReader, decodeReplayFrame, encodeReplayFrame, framesMatch} = await import("./sweatbox-codec");
  const {initialExercise} = await import("./engine");
  const before = initialExercise();
  const shadow = [{at: 2.5, positionId: "north", state: state({selectedId: before.aircraft[0]?.id ?? null, vectorDraft: {aircraftId: "a1", point: {x: 3.25, y: 1}}})}, {at: 3, positionId: "north", sent: {callsign: "EZY24", text: "Descend 5000", path: ["Altitude"]}}];
  const frame = {sequence: 1, at: 3, interpolate: false, delta: {state: {}, aircraft: [], shadow}};
  const decoded = decodeReplayFrame(new ByteReader(encodeReplayFrame(before, frame)), before);
  assert.deepEqual(decoded.delta.shadow, shadow);
  assert.ok(framesMatch(frame.delta, decoded.delta), "backfill verification sees the marks");
});
