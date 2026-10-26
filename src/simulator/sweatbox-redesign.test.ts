import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import type {Pool} from "mysql2/promise";
import {initialExercise} from "./engine";
import {replayState, type ReplayDetail} from "./replays";
import {createReplayApi} from "./server/replay-api";
import {listReplays, readReplay, recordReplay} from "./server/replay-store";
import {createSessionApi} from "./server/session-api";
import {SessionService, type SessionRecord} from "./server/session-service";
import {MemoryStore} from "./session-test-store";
import {setPoolForTests} from "../lib/db";
import {adjacentMoment, currentMoment, momentCounts, replayMoments} from "./replay-moments";
import {lastActive, matchesFilter, menteeState, sessionStatus} from "./session-status";
import type {SessionSummary} from "./sessions";

const summary = (patch: Partial<SessionSummary>): SessionSummary => ({id: randomUUID(), title: "Session", createdAt: 0, updatedAt: 0, staffOccupied: false, menteeOccupied: false, ...patch});

test("session status and filters describe who is connected", () => {
  assert.deepEqual(sessionStatus(summary({staffOccupied: true, menteeOccupied: true})), {label: "Live", tone: "live"});
  assert.deepEqual(sessionStatus(summary({menteeOccupied: true})), {label: "Mentee waiting", tone: "wait"});
  assert.deepEqual(sessionStatus(summary({staffOccupied: true})), {label: "Waiting for Mentee", tone: "wait"});
  assert.equal(sessionStatus(summary({assignedMenteeId: "1"})).label, "Assigned");
  assert.equal(sessionStatus(summary({})).label, "Idle");
  assert.equal(menteeState(summary({assignedMenteeId: "1"})), "Assigned, not joined");
  assert.equal(menteeState(summary({menteeOccupied: true})), "Waiting for Mentor");
  const mine = summary({ownerId: "me"}), live = summary({ownerId: "other", menteeOccupied: true});
  assert.deepEqual([mine, live].filter(s => matchesFilter(s, "mine", "me")), [mine]);
  assert.deepEqual([mine, live].filter(s => matchesFilter(s, "live", "me")), [live]);
  assert.deepEqual([mine, live].filter(s => matchesFilter(s, "idle", "me")), [mine]);
  assert.equal(lastActive(1_000_000, 1_020_000), "Now");
  assert.equal(lastActive(0, 25 * 60_000), "25 min ago");
  assert.equal(lastActive(Date.UTC(2026, 9, 20, 18, 40), Date.UTC(2026, 9, 25)), "20 Oct, 18:40 UTC");
});

test("key moments list bookmarks and collisions on the recording's own clock", () => {
  const initial = initialExercise(randomUUID());
  initial.elapsed = 100;
  const aircraft = initial.aircraft[0];
  assert.ok(aircraft, "the default exercise has traffic");
  const final = {...initial, elapsed: 400,
    bookmarks: [{id: "b1", elapsed: 160, aircraftId: aircraft.id, label: "Talk about this"}, {id: "early", elapsed: 50, aircraftId: aircraft.id, label: "Before recording"}],
    collisions: [{kind: "terrain" as const, id: "c1", elapsed: 250, aircraft: [{id: aircraft.id, callsign: "BAW12"}], position: {x: 0, y: 0}}]};
  const moments = replayMoments(initial, [], final, 300);
  assert.deepEqual(moments.map(m => [m.kind, m.at]), [["start", 0], ["bookmark", 60], ["terrain", 150], ["end", 300]]);
  assert.equal(adjacentMoment(moments, 0, 1)?.kind, "bookmark");
  assert.equal(adjacentMoment(moments, 60, 1)?.kind, "terrain");
  assert.equal(adjacentMoment(moments, 60, -1), undefined);
  assert.equal(currentMoment(moments, 100)?.kind, "bookmark");
  assert.deepEqual(momentCounts(moments), {bookmarks: 1, incidents: 1});
});

test("a Mentee's replay scope admits any signed-in account but filters to their own Mentee seat", async () => {
  const calls: unknown[] = [];
  const api = createReplayApi(async (_request, staff, admission) => {calls.push({staff, admission}); return {accountId: "mentee-account", staff: false, simulatorAccess: false};},
    async (offset, filters) => {calls.push({offset, filters}); return {replays: [], next: null};},
    async (id, after, menteeId) => {calls.push({id, after, menteeId}); return {replay: {id, participants: [{role: "mentee", accountId: "mentee-account"}]}, initial: null, frames: [], next: null} as unknown as ReplayDetail;});
  assert.equal((await api(new Request("https://example.com/api/simulator/replays?scope=self&offset=50"))).status, 200);
  const id = randomUUID();
  assert.equal((await api(new Request(`https://example.com/api/simulator/replays/${id}?scope=self&after=7`), id)).status, 200);
  assert.deepEqual(calls, [
    {staff: false, admission: {anySignedIn: true}}, {offset: 50, filters: {menteeId: "mentee-account", search: "", airport: "", recordedOn: undefined}},
    {staff: false, admission: {anySignedIn: true}}, {id, after: 7, menteeId: "mentee-account"},
  ]);
});

test("Mentee replay queries bind the Mentee seat, and reading someone else's replay looks missing", async () => {
  const queries: {sql: string; values: unknown[]}[] = [];
  const id = randomUUID(), exercise = initialExercise(id);
  const row = {id, session_id: id, owner_id: "staff", owner_name: "Mentor", title: "Recorded", started_at: 1, ended_at: 2, status: "ended", duration: 0, sequence_no: 0, initial_state: JSON.stringify(exercise),
    participants: JSON.stringify([{role: "staff", accountId: "staff"}, {role: "mentee", accountId: "alex"}]), partial: 0, feedback: "Nice work"};
  setPoolForTests({async execute(sql: string, values: unknown[] = []) {
    queries.push({sql, values});
    if (sql.includes("FROM simulator_replays WHERE id=?")) return [[row], []];
    return [[], []];
  }} as unknown as Pool);
  try {
    await listReplays(0, {menteeId: "alex"});
    const [recorded, legacy] = queries;
    assert.deepEqual(JSON.parse(recorded.values[0] as string), {role: "mentee", accountId: "alex"});
    assert.match(legacy.sql, /a.learner_id=\?/); assert.deepEqual(legacy.values, ["alex"]);
    assert.equal((await readReplay(id, 0, "alex")).replay.feedback, "Nice work");
    await assert.rejects(readReplay(id, 0, "sam"), /unavailable/);
    assert.equal((await readReplay(id, 0)).replay.id, id);
  } finally {setPoolForTests(undefined);}
});

test("feedback written while archiving fills the replay only when the attempt has none", async () => {
  const id = randomUUID(), exercise = initialExercise(id);
  const record = {id, title: "Archive me", ownerId: "staff", createdAt: 1, updatedAt: 5, tickAt: 5, contentRevision: 1, exercise, staff: null, mentee: null} as unknown as SessionRecord;
  const run = async (scenarioFeedback: string | undefined, feedback: string | undefined) => {
    const updates: unknown[][] = [];
    const connection = {async execute(sql: string, values: (string | number | null)[]) {
      if (sql.startsWith("SELECT")) return [[{id, session_id: id, attempt_id: null, status: "recording", duration: 0, sequence_no: 0, content_revision: 1, last_state: JSON.stringify(replayState(exercise)), participants: "[]"}], []] as [unknown, unknown];
      if (sql.includes("SET status=?")) updates.push(values);
      return [[], []] as [unknown, unknown];
    }};
    await recordReplay(connection, {...record, ...(scenarioFeedback ? {scenario: {feedback: scenarioFeedback}} : {})} as SessionRecord, record, "ended", feedback);
    return updates[0]?.[2];
  };
  assert.equal(await run(undefined, "Watch your spacing"), "Watch your spacing");
  assert.equal(await run("Saved during the attempt", "Ignored"), "Saved during the attempt");
  assert.equal(await run(undefined, undefined), null);
});

test("archiving accepts optional feedback and still accepts an empty body", async () => {
  const ends: unknown[][] = [];
  const store = new MemoryStore(), end = store.end.bind(store);
  store.end = async (id: string, accountId: string, now: number, feedback?: string) => {ends.push([feedback]); return end(id, accountId, now);};
  const api = createSessionApi(store, async (_request, staff) => ({accountId: "101", staff}));
  const service = new SessionService(store);
  const request = (body?: unknown) => new Request("https://atcmh.test/api/simulator/sessions/x", {method: "DELETE", headers: {cookie: "101", "content-type": "application/json"}, ...(body ? {body: JSON.stringify(body)} : {})});
  const first = await service.create({accountId: "101", staff: true}, "One"), second = await service.create({accountId: "101", staff: true}, "Two");
  assert.equal((await api.sessionOperation(request({feedback: "  Good flow on the ground.  "}), first.id, "end")).status, 200);
  assert.equal((await api.sessionOperation(request(), second.id, "end")).status, 200);
  assert.deepEqual(ends, [["Good flow on the ground."], [undefined]]);
  const third = await service.create({accountId: "101", staff: true}, "Three");
  assert.equal((await api.sessionOperation(request({feedback: "x".repeat(6001)}), third.id, "end")).status, 400);
  assert.equal((await api.sessionOperation(request({other: true}), third.id, "end")).status, 400);
});
