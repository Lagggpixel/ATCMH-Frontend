import assert from "node:assert/strict";
import test from "node:test";
import {CLEARED_VISIBLE_SECONDS, currentIncidents, incidentClock, incidentSignature, orderedIncidents, tagLineText, trackIncidents} from "./separation-incidents";
import type {SeparationAlert} from "./radar-safety";

const callsigns: Record<string, string> = {a: "BAW123", b: "DAL45", c: "N512CP"};
const alert = (otherId: string, lateral: number, vertical: number): SeparationAlert => ({otherId, lateral, vertical, seconds: 0, level: "alert"});
const pair = (lateral: number, vertical: number) => new Map([["a", [alert("b", lateral, vertical)]], ["b", [alert("a", lateral, vertical)]]]);
const now = (lateral: number, vertical: number, terrain = new Map<string, number>()) => currentIncidents(pair(lateral, vertical), terrain, id => callsigns[id]);

test("a separation pair is one incident naming both aircraft, terrain is one per aircraft", () => {
  const incidents = now(2.4, 600, new Map([["c", 640]]));
  assert.deepEqual(incidents.map(i => [i.key, i.callsigns.join(" · ")]), [["los:a/b", "BAW123 · DAL45"], ["terr:c", "N512CP"]]);
});

test("an incident keeps its start time and the closest lateral and vertical values separately", () => {
  let log = trackIncidents(undefined, now(2.8, 900), 100);
  log = trackIncidents(log, now(2.1, 950), 110);
  log = trackIncidents(log, now(2.6, 400), 120);
  const record = log.records.get("los:a/b")!;
  assert.deepEqual([record.start, record.minLateral, record.minVertical, record.lateral, record.vertical, record.end], [100, 2.1, 400, 2.6, 400, undefined]);
});

test("a cleared incident stays briefly with its duration, then leaves", () => {
  let log = trackIncidents(undefined, now(2, 500), 100);
  log = trackIncidents(log, [], 151);
  assert.equal(log.records.get("los:a/b")?.end, 151);
  assert.equal(incidentClock(log.records.get("los:a/b")!.end! - 100), "0:51");
  log = trackIncidents(log, [], 151 + CLEARED_VISIBLE_SECONDS - 1);
  assert.ok(log.records.has("los:a/b"));
  log = trackIncidents(log, [], 151 + CLEARED_VISIBLE_SECONDS);
  assert.equal(log.records.size, 0);
});

test("a pair that loses separation again starts a new incident, and time going backwards starts afresh", () => {
  let log = trackIncidents(undefined, now(2, 500), 100);
  log = trackIncidents(log, [], 110);
  log = trackIncidents(log, now(1.5, 300), 112);
  assert.deepEqual([log.records.get("los:a/b")!.start, log.records.get("los:a/b")!.minLateral], [112, 1.5]);
  log = trackIncidents(log, now(2, 500), 50);
  assert.equal(log.records.get("los:a/b")!.start, 50);
});

test("live incidents come before cleared ones and tag lines name the other aircraft", () => {
  let log = trackIncidents(undefined, now(2, 500, new Map([["c", 600]])), 100);
  log = trackIncidents(log, now(2, 500), 105);
  assert.deepEqual(orderedIncidents(log).map(r => r.key), ["los:a/b", "terr:c"]);
  assert.equal(tagLineText("DAL45", {lateral: 2.44, vertical: 600.4}), "DAL45 2.4NM 600FT");
});


test("incident signatures detect callsign and exact measurement changes while paused", () => {
  const first = currentIncidents(pair(2.441, 600), new Map(), id => callsigns[id]);
  const renamed = currentIncidents(pair(2.441, 600), new Map(), id => id === "a" ? "NEW123" : callsigns[id]);
  const closer = currentIncidents(pair(2.439, 600), new Map(), id => callsigns[id]);
  assert.notEqual(incidentSignature(first), incidentSignature(renamed));
  assert.notEqual(incidentSignature(first), incidentSignature(closer));
});
