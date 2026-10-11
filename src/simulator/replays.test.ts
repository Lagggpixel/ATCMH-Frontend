import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {initialExercise, newAircraft} from "./engine";
import {applyReplayDelta, replayDelta, replayState, ReplayTimeline, type ReplayFrame} from "./replays";
import {createReplayApi} from "./server/replay-api";
import {SessionError} from "./sessions";
import {setPoolForTests} from "../lib/db";
import type {Pool} from "mysql2/promise";
import {listReplays, readReplay} from "./server/replay-store";

test("replay deltas round trip commands, radio/ATIS, additions, removals and cleared optional fields", () => {
  const before = replayState(initialExercise(randomUUID()));
  const a = newAircraft("one", false); a.sequence = {number: 2}; before.aircraft = [a];
  const after = structuredClone(before); after.elapsed = 1; after.aircraft[0].position.x += .1; delete after.aircraft[0].sequence;
  after.aircraft.push(newAircraft("two", true)); after.publishedAtis = "Information Bravo";
  after.messages.push({id: "m", aircraftId: a.id, time: 1, frequency: "tower", sender: "pilot", text: "Call inbound"});
  assert.deepEqual(applyReplayDelta(before, replayDelta(before, after)), after);
  const removed = {...after, aircraft: after.aircraft.slice(1)};
  assert.deepEqual(applyReplayDelta(after, replayDelta(after, removed)), removed);
  assert.equal(replayDelta(before, after).aircraft.find(change => change.id === a.id)?.value?.taxiPath, undefined, "unchanged aircraft configuration is not repeated");
});
test("seeking honours same-time command ordering, interpolates shortest heading, and never blends edits", () => {
  const initial = replayState(initialExercise(randomUUID())); initial.aircraft = [newAircraft("one", true)]; initial.aircraft[0].heading = 359;
  const next = structuredClone(initial); next.elapsed = 1; next.aircraft[0].heading = 1; next.aircraft[0].position.x += 2;
  const edited = structuredClone(next); edited.aircraft[0].position.x = 10;
  const frames: ReplayFrame[] = [{sequence: 1, at: 1, delta: replayDelta(initial, next), interpolate: true}, {sequence: 2, at: 1, delta: replayDelta(next, edited), interpolate: false}];
  const timeline = new ReplayTimeline(initial, frames);
  assert.equal(timeline.at(.5).aircraft[0].heading, 0);
  assert.equal(timeline.at(.5).aircraft[0].position.x, initial.aircraft[0].position.x + 1);
  assert.equal(timeline.at(1).aircraft[0].position.x, 10);
  const editOnly = new ReplayTimeline(initial, [{...frames[1], delta: replayDelta(initial, edited)}]);
  assert.equal(editOnly.at(.9).aircraft[0].position.x, initial.aircraft[0].position.x);
});
test("checkpoint seeks reconstruct long recordings in both directions without mutating initial state", () => {
  const initial = replayState(initialExercise(randomUUID())), frames: ReplayFrame[] = []; let previous = initial;
  for (let i = 1; i <= 200; i++) {const state = {...previous, elapsed: i, publishedAtis: `ATIS ${i}`}; frames.push({sequence: i, at: i, delta: replayDelta(previous, state), interpolate: false}); previous = state;}
  const timeline = new ReplayTimeline(initial, frames);
  for (const i of [200, 60, 0, 119, 120, 1]) assert.equal(timeline.at(i).publishedAtis, i ? `ATIS ${i}` : initial.publishedAtis);
  assert.equal(initial.elapsed, 0);
});
test("replay endpoints require simulator staff authorization before reading, validate cursors and disable caching", async () => {
  let reads = 0;
  const denied = createReplayApi(async () => {throw new SessionError("unauthorized", "Sign in", 401);}, async () => {reads++; return {replays: [], next: null};});
  assert.equal((await denied(new Request("https://example.com/api/simulator/replays"))).status, 401); assert.equal(reads, 0);
  const allowed = createReplayApi(async (_request, staff) => {assert.equal(staff, true); return {accountId: "staff", staff};}, async offset => {reads++; assert.equal(offset, 50); return {replays: [], next: null};});
  const response = await allowed(new Request("https://example.com/api/simulator/replays?offset=50"));
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await allowed(new Request("https://example.com/api/simulator/replays?offset=-1"))).status, 400);
  assert.equal((await allowed(new Request("https://example.com/api/simulator/replays"), "bad-id")).status, 400); assert.equal(reads, 1);
});

test("replay reader paginates recorded frames and exposes surviving legacy snapshots or summary-only attempts", async () => {
  const id = randomUUID(), exercise = initialExercise(id);
  const header = {id, session_id: id, owner_id: "staff", owner_name: "Mentor", title: "Recorded", started_at: 1, ended_at: 2, status: "ended", duration: 501, sequence_no: 501, initial_state: JSON.stringify(exercise), participants: "[]", partial: 0};
  const oldId = randomUUID(), missingId = randomUUID();
  const old = {id: oldId, session_id: oldId, title: "Old", owner_id: "staff", learner_id: "learner", started_at: 1, finished_at: 3, elapsed: 45, status: "finished", feedback: "Review", result: JSON.stringify({exercise})};
  const absent = {...old, id: missingId, finished_at: 4, result: null};
  const pool = {async execute(sql: string, values: unknown[] = []) {
    if (sql.includes("FROM simulator_replay_frames")) return [Array.from({length: 501}, (_, i) => ({sequence_no: i + 1, at_seconds: i + 1, delta: JSON.stringify({state: {elapsed: i + 1}, aircraft: []}), interpolate: 1})).filter(f => f.sequence_no > Number(values[1])).slice(0, 500), []];
    if (sql.includes("FROM simulator_replays WHERE id=?")) return [values[0] === id ? [header] : [], []];
    if (sql.includes("FROM simulator_attempts a")) return [sql.includes("a.id=?") ? [old, absent].filter(a => a.id === values[0]) : [old, absent], []];
    return [[header], []];
  }} as unknown as Pool;
  setPoolForTests(pool);
  try {
    const list = await listReplays(0); assert.deepEqual(list.replays.map(r => r.kind), ["unavailable", "snapshot", "recording"]); assert.equal(list.next, null);
    const first = await readReplay(id, 0); assert.equal(first.frames.length, 500); assert.equal(first.next, 500);
    const last = await readReplay(id, 500); assert.equal(last.frames.length, 1); assert.equal(last.next, null);
    assert.equal(new ReplayTimeline(first.initial!, [...first.frames, ...last.frames]).at(501).elapsed, 501);
    const legacy = await readReplay(oldId, 0); assert.deepEqual(legacy.initial, exercise); assert.equal(legacy.replay.feedback, "Review"); assert.equal(legacy.frames.length, 0);
    assert.equal((await readReplay(missingId, 0)).initial, null);
    await assert.rejects(readReplay(randomUUID(), 0), /unavailable/);
  } finally {setPoolForTests(undefined);}
});
