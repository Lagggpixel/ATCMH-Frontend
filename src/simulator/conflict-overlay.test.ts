import assert from "node:assert/strict";
import test from "node:test";
import {clock, conflictCards, FINISHED_VISIBLE_SECONDS, trackFinished} from "./conflict-overlay";
import type {TrainingConflict} from "./training-conflicts";
import type {Aircraft} from "./model";

const aircraft = [{id: "a", callsign: "DAL412"}, {id: "b", callsign: "N52KT"}] as Aircraft[];
const conflict = (patch: Partial<TrainingConflict>): TrainingConflict => ({id: "c1", kind: "ga", first: "a", second: "b", runway: "28L", otherRunway: "28L", phase: "setup", started: 100, circuit: 0, ...patch});

test("conflict cards name both aircraft, the runway and the current phase", () => {
  const [card] = conflictCards([conflict({phase: "active"})], aircraft, 184, new Map(), new Set());
  assert.deepEqual([card.first, card.second, card.runway, card.age], ["DAL412", "N52KT", "RWY 28L", "1:24"]);
  assert.deepEqual(card.steps, [{label: "Setup", reached: true, current: false}, {label: "Active", reached: true, current: true}]);
  const [uwc] = conflictCards([conflict({kind: "uwc", otherRunway: "28R", phase: "upwind"})], aircraft, 100, new Map(), new Set());
  assert.equal(uwc.runway, "28L → 28R");
  assert.deepEqual(uwc.steps.map(s => s.current), [false, true, false]);
});

test("finished conflicts show their outcome briefly, after live ones, and old ones stay hidden", () => {
  const finishedAt = new Map<string, number>();
  const old = conflict({id: "old", phase: "complete", outcome: "Conflict resolved"});
  trackFinished([old], 100, finishedAt, true);
  const done = conflict({id: "done", phase: "cancelled", outcome: "Runway change declined"}), live = conflict({id: "live"});
  trackFinished([old, done, live], 200, finishedAt, false);
  assert.deepEqual(conflictCards([old, done, live], aircraft, 200, finishedAt, new Set()).map(c => c.id), ["live", "done"]);
  assert.equal(conflictCards([done], aircraft, 200, finishedAt, new Set())[0].outcome, "Runway change declined");
  assert.deepEqual(conflictCards([done], aircraft, 200 + FINISHED_VISIBLE_SECONDS, finishedAt, new Set()), []);
  assert.deepEqual(conflictCards([live], aircraft, 200, finishedAt, new Set(["live"])), []);
});

test("clock formats exercise seconds", () => {assert.equal(clock(5), "0:05"); assert.equal(clock(-3), "0:00"); assert.equal(clock(3725), "62:05");});
