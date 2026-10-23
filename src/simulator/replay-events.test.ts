import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {replayDelta} from "./replays";
import {groupReplayEvents, replayEvents, replaySnapshots, replayTerrainEvents, type ReplayEvent, type ReplaySnapshot} from "./replay-events";

function fixture() {
  const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise();
  const a = structuredClone(state.aircraft[0]), b = structuredClone(a);
  a.id = "a"; a.callsign = "BAW124"; a.active = true; a.position = {x: 0, y: 0}; a.altitude = 5000;
  b.id = "b"; b.callsign = "EZY31"; b.position = {x: 1, y: 0}; b.altitude = 5500;
  state.aircraft = [a, b]; state.elapsed = 120;
  return state;
}

test("separation indexes one pair per continuous incident, then a fresh event after resolution", () => {
  const initial = fixture(), ongoing = structuredClone(initial), clear = structuredClone(initial), again = structuredClone(initial);
  ongoing.elapsed += 1; clear.aircraft[1].position.x = 3;
  const snapshots = [{at: 0, state: initial}, {at: 1, state: ongoing}, {at: 2, state: clear}, {at: 3, state: again}];
  const events = replayEvents(snapshots, 4);
  assert.deepEqual(events.map(e => [e.kind, e.at, e.end]), [["separation", 0, 2], ["separation", 3, 3]]);
  assert.deepEqual(events[0].aircraftIds, ["a", "b"]); assert.equal(events[0].detail, "1nm 500ft");
  assert.equal(initial.aircraft[1].position.x, 1);
});

test("same-time command ordering does not create a transient phantom incident", () => {
  const initial = fixture(); initial.aircraft[1].position.x = 5;
  const conflict = structuredClone(initial); conflict.aircraft[1].position.x = 2;
  const clear = structuredClone(initial); clear.aircraft[1].position.x = 6;
  const frames = [{sequence: 1, at: 1, delta: replayDelta(initial, conflict), interpolate: false}, {sequence: 2, at: 1, delta: replayDelta(conflict, clear), interpolate: false}];
  const snapshots = replaySnapshots(initial, frames);
  assert.deepEqual(snapshots.map(s => s.at), [0, 1]); assert.equal(replayEvents(snapshots, 1).length, 0);
});

test("bookmarks use recording-relative time, survive later removal, and omit pre-recording/out-of-range marks", () => {
  const initial = fixture(); initial.aircraft = [];
  initial.bookmarks = [{id: "old", elapsed: 60, aircraftId: "a", label: "Before recording"}];
  const next = {...initial, elapsed: 125, bookmarks: [...initial.bookmarks, {id: "new", elapsed: 125, aircraftId: "a", label: "Review vector"}, {id: "future", elapsed: 200, aircraftId: "a", label: "Outside"}]};
  const final = {...next, bookmarks: []};
  const events = replayEvents([{at: 0, state: initial}, {at: 5, state: next}, {at: 10, state: final}], 10);
  assert.equal(events.length, 1); assert.equal(events[0].at, 5); assert.equal(events[0].label, "Review vector");
});

test("separation respects the live radar's strict limits and approach exemptions", () => {
  const state = fixture(), [a, b] = state.aircraft;
  b.altitude = 6000; assert.equal(replayEvents([{at: 0, state}], 1).length, 0);
  b.altitude = 7000;
  const approach = state.radarEnvironment!.approaches.find(p => p.type === "gps")!;
  for (const aircraft of [a, b]) {aircraft.radar!.cleared = approach.id; aircraft.radar!.navigation = "approach";}
  assert.equal(replayEvents([{at: 0, state}], 1).length, 0);
});

test("nearby events group responsively while keeping each original event/time available", () => {
  const events = [10, 11, 30, 90].map((at, i) => ({id: String(i), kind: "bookmark", at, label: "Mark", detail: "", aircraftIds: []} as ReplayEvent));
  assert.deepEqual(groupReplayEvents(events, 100, 1000).map(g => g.length), [2, 1, 1]);
  assert.deepEqual(groupReplayEvents(events, 100, 100).map(g => g.length), [3, 1]);
  assert.deepEqual(groupReplayEvents(events, 100, 100).flat(), events);
});

test("terrain reconstruction uses raw AGL, coalesces incidents, and never assumes sea level on failure", async () => {
  const initial = fixture(); initial.aircraft = [initial.aircraft[0]];
  const low = structuredClone(initial); low.aircraft[0].altitude = 4500;
  const cleared = structuredClone(initial);
  const snapshots = [{at: 0, state: initial}, {at: 2, state: low}, {at: 4, state: low}, {at: 6, state: cleared}];
  const result = await replayTerrainEvents(snapshots, new AbortController().signal, () => {}, async () => 4000);
  assert.equal(result.total, 1); assert.equal(result.failed, 0);
  assert.deepEqual(result.events.map(e => [e.at, e.end, e.detail]), [[2, 6, "500ft AGL"]]);
  const failed = await replayTerrainEvents(snapshots, new AbortController().signal, () => {}, async () => {throw new Error("offline");});
  assert.equal(failed.failed, 1); assert.deepEqual(failed.events, []);
});

test("terrain requests are bounded to four and finish in timeline order even if responses arrive out of order", async () => {
  const initial = fixture(); initial.aircraft = [initial.aircraft[0]]; initial.aircraft[0].altitude = 4500;
  const snapshots: ReplaySnapshot[] = Array.from({length: 12}, (_, at) => {
    const state = structuredClone(initial); state.aircraft[0].position.x = at;
    return {at, state};
  });
  let active = 0, peak = 0, progress = 0;
  const result = await replayTerrainEvents(snapshots, new AbortController().signal, completed => {progress = completed;}, async (_lat, lon) => {
    peak = Math.max(peak, ++active); await new Promise(resolve => setTimeout(resolve, Math.abs(Math.round(lon * 100)) % 5)); active--; return 4000;
  });
  assert.ok(peak <= 4); assert.equal(result.total, 12); assert.equal(progress, 12);
  assert.equal(result.events.length, 1); assert.equal(result.events[0].at, 0);
});

test("terrain honors approach/departure exemptions and cancels without false results", async () => {
  const state = fixture(); state.aircraft = [state.aircraft[0]];
  state.aircraft[0].radar!.navigation = "approach"; state.aircraft[0].radar!.cleared = state.radarEnvironment!.approaches.find(p => p.type === "gps")!.id;
  const result = await replayTerrainEvents([{at: 0, state}], new AbortController().signal, () => {}, async () => {throw new Error("must not request");});
  assert.equal(result.total, 0); assert.equal(result.failed, 0); assert.deepEqual(result.events, []);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(replayTerrainEvents([{at: 0, state: fixture()}], controller.signal, () => {}), {name: "AbortError"});
});

test("a terrain-service outage stops the scan promptly and reports unchecked samples as unavailable", async () => {
  const snapshots = Array.from({length: 100}, (_, at) => {
    const state = fixture(); state.aircraft = [state.aircraft[0]]; state.aircraft[0].position.x = at;
    return {at, state};
  });
  let requests = 0;
  const result = await replayTerrainEvents(snapshots, new AbortController().signal, () => {}, async () => {requests++; throw new Error("offline");});
  assert.ok(requests <= 7); assert.equal(result.total, 100); assert.equal(result.failed, 100); assert.deepEqual(result.events, []);
});
