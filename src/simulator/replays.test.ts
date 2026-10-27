import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {initialExercise, newAircraft} from "./engine";
import {participantReplay, applyReplayDelta, replayDelta, replayState, ReplayTimeline, canPlayReplay, recordingLabel, type ReplayFrame, type ReplaySummary} from "./replays";
import {createReplayApi} from "./server/replay-api";
import {SessionError} from "./sessions";
import {setPoolForTests, setWritePoolForTests} from "../lib/db";
import type {Pool} from "mysql2/promise";
import {listReplays, readReplay} from "./server/replay-store";
import {updateReplayFeedback} from "./server/replay-feedback";

test("empty recordings remain reviewable without being advertised as playable", () => {
  const replay = {kind: "recording", duration: 0, partial: false} as ReplaySummary;
  assert.equal(canPlayReplay(replay), false);
  assert.equal(recordingLabel(replay), "No elapsed time");
  assert.equal(canPlayReplay({...replay, duration: 1}), true);
  assert.equal(recordingLabel({...replay, duration: 1, partial: true}), "Partial recording");
  assert.equal(canPlayReplay({...replay, kind: "snapshot", duration: 100}), false);
  assert.equal(recordingLabel({...replay, kind: "unavailable"}), "Summary only");
});

test("replay date filters validate calendar dates and use UTC regardless of the viewer timezone", async () => {
  let reads = 0;
  const api = createReplayApi(async () => ({accountId: "mentor", staff: true}), async (offset, filters) => {
    reads++;
    assert.equal(offset, 0);
    assert.deepEqual(filters, {mentorId: "mentor", search: "Kai", airport: "EGPH", recordedOn: Date.UTC(2026, 9, 14)});
    return {replays: [], next: null};
  });
  assert.equal((await api(new Request("https://example.com/api/simulator/replays?date=2026-10-14&scope=mine&q=Kai&airport=EGPH"))).status, 200);
  for (const date of ["2026-02-30", "14/10/2026", "invalid"]) {
    assert.equal((await api(new Request(`https://example.com/api/simulator/replays?date=${date}`))).status, 400);
  }
  assert.equal(reads, 1);
});

test("date and participant filters apply to both recorded and older sessions before pagination", async () => {
  const calls: {sql: string; values: unknown[]}[] = [];
  setPoolForTests({execute: async (sql: string, values: unknown[]) => {calls.push({sql, values}); return [[], []];}} as unknown as Pool);
  try {
    const start = Date.UTC(2026, 9, 14);
    await listReplays(50, {recordedOn: start, mentorId: "mentor", search: "Kai", airport: "EGPH"});
    assert.equal(calls.length, 2);
    assert.match(calls[0].sql, /ended_at>=\? AND ended_at<\?/);
    assert.match(calls[1].sql, /a.finished_at>=\? AND a.finished_at<\?/);
    for (const call of calls) {
      assert.deepEqual(call.values.slice(0, 2), [start, start + 86_400_000]);
      assert.match(call.sql, /LIMIT 101/);
      assert.ok(call.values.includes("Kai"));
      assert.ok(call.values.includes("EGPH"));
    }
  } finally {setPoolForTests(undefined);}
});

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
  const header = {id, session_id: id, owner_id: "staff", owner_name: "Mentor", title: "Recorded", started_at: 1, ended_at: 2, status: "ended", duration: 501, sequence_no: 501, initial_state: JSON.stringify(exercise), last_state: JSON.stringify(exercise), participants: "[]", partial: 0};
  const oldId = randomUUID(), missingId = randomUUID();
  const old = {id: oldId, session_id: oldId, title: "Old", owner_id: "staff", learner_id: "learner", started_at: 1, finished_at: 3, elapsed: 45, status: "finished", feedback: "Review", result: JSON.stringify({exercise})};
  const absent = {...old, id: missingId, finished_at: 4, result: null};
  const pool = {async execute(sql: string, values: unknown[] = []) {
    if (sql.includes("FROM simulator_replay_position_feedback")) return [[], []];
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

test("my replay filter uses the authenticated account, validates filters and retains pagination", async () => {
  const calls: unknown[] = [];
  const api = createReplayApi(async () => ({accountId: "signed-in-mentor", staff: true}), async (offset, filters) => {
    calls.push({offset, filters}); return {replays: [], next: null};
  });
  assert.equal((await api(new Request("https://example.com/api/simulator/replays?scope=mine&mentorId=someone-else&offset=50&q=Alex&airport=KDAL"))).status, 200);
  assert.deepEqual(calls, [{offset: 50, filters: {mentorId: "signed-in-mentor", search: "Alex", airport: "KDAL", recordedOn: undefined}}]);
  for (const query of ["scope=other", "airport=INVALID", `q=${"x".repeat(101)}`]) assert.equal((await api(new Request(`https://example.com/api/simulator/replays?${query}`))).status, 400);
  assert.equal(calls.length, 1);
  await api(new Request("https://example.com/api/simulator/replays"));
  assert.deepEqual(calls[1], {offset: 0, filters: {mentorId: undefined, search: "", airport: "", recordedOn: undefined}});
});

test("replay filters bind historical staff identity and search before both source limits", async () => {
  const queries: {sql: string; values: unknown[]}[] = [];
  setPoolForTests({async execute(sql: string, values: unknown[] = []) {queries.push({sql, values}); return [[], []];}} as unknown as Pool);
  try {
    await listReplays(50, {mentorId: "mentor-id", search: "50%_'", airport: "KDAL"});
    const [recorded, legacy] = queries;
    assert.match(recorded.sql, /JSON_CONTAINS\(participants, \?\) = 1.*ORDER BY.*LIMIT 101/);
    assert.deepEqual(JSON.parse(recorded.values[0] as string), {role: "staff", accountId: "mentor-id"});
    assert.deepEqual(recorded.values.slice(1), ["KDAL", "50%_'"]);
    assert.match(legacy.sql, /a.owner_id=\?.*ORDER BY.*LIMIT 101/);
    assert.deepEqual(legacy.values, ["mentor-id", "KDAL", "50%_'"]);
    assert.ok(queries.every(query => !query.sql.includes("mentor-id") && !query.sql.includes("50%_'")));
  } finally {setPoolForTests(undefined);}
});

test("feedback amendments require staff, reject stale edits and notify mentees once", async () => {
  const id = randomUUID(), attempt = randomUUID(), exercise = initialExercise(id);
  const row = {id, session_id: randomUUID(), attempt_id: attempt, owner_id: "trainer", ended_at: 2, title: "Training", feedback: "Original", last_state: JSON.stringify(exercise), participants: JSON.stringify([{role: "mentee", accountId: "one"}, {role: "mentee", accountId: "one"}, {role: "mentee", accountId: "two"}])};
  const notices: string[] = [], statements: string[] = [];
  const connection = {query: async () => {}, commit: async () => {}, rollback: async () => {}, release() {}, execute: async (sql: string, values: unknown[]) => {statements.push(sql); if (sql.startsWith("SELECT * FROM simulator_replays")) return [[{...row}], []]; if (sql.startsWith("UPDATE simulator_replays")) row.feedback = String(values[0]); return [{affectedRows: 1}, []];}};
  setWritePoolForTests({getConnection: async () => connection} as unknown as Pool);
  const notify = async (notice: {accountId?: string}) => {notices.push(notice.accountId!); return true;};
  try {
    await assert.rejects(updateReplayFeedback(id, {accountId: "other", staff: false}, "Original", "New", notify), /access/);
    await assert.rejects(updateReplayFeedback(id, {accountId: "trainer", staff: true}, "stale", "New", notify), /changed/);
    await updateReplayFeedback(id, {accountId: "trainer", staff: true}, "Original", "New", notify);
    assert.equal(row.feedback, "New"); assert.equal(statements.some(sql => sql.startsWith("UPDATE simulator_attempts")), true);
    assert.deepEqual(notices, ["one", "two"]);
    await updateReplayFeedback(id, {accountId: "trainer", staff: true}, "New", "New", notify); assert.equal(notices.length, 2);
  } finally {setWritePoolForTests(undefined);}
});
test("amended position feedback is filtered to the mentee's recorded positions", () => {
  const detail = {replay: {participants: [{role: "mentee", accountId: "one", positionId: "north"}, {role: "mentee", accountId: "two", positionId: "south"}]}, initial: null, frames: [], next: null, positionFeedback: {north: "First", south: "Private"}} as unknown as import("./replays").ReplayDetail;
  assert.deepEqual(participantReplay(detail, "one").positionFeedback, {north: "First"});
});
