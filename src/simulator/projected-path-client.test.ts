import assert from "node:assert/strict";
import test from "node:test";
import {projectedPathClient, type PredictionWorker} from "./projected-path-client";
import type {PathPredictionRequest, PathPredictionResponse} from "./projected-path";

function harness() {
  const sent: PathPredictionRequest[] = [], results: {context: object; points: unknown}[] = [];
  let failures = 0, terminated = 0;
  const worker: PredictionWorker = {onmessage: null, onerror: null, onmessageerror: null,
    postMessage: (request: PathPredictionRequest) => {sent.push(structuredClone(request));}, terminate: () => {terminated++;}};
  const client = projectedPathClient(worker, (context, points) => results.push({context, points}), () => {failures++;});
  const job = (aircraftId: string, context: object, airport = "EGLL") => ({context, input: {aircraftId, aircraft: [], airport, autoReadback: true}});
  const respond = (response: PathPredictionResponse) => worker.onmessage?.call(worker as Worker, {data: response} as MessageEvent);
  return {worker, client, sent, results, job, respond, failures: () => failures, terminated: () => terminated};
}

test("busy forecasts keep only the newest queued snapshot", () => {
  const h = harness(), context = {};
  h.client.update(h.job("one", context));
  for (let i = 0; i < 100; i++) h.client.update(h.job(String(i), {}));
  assert.equal(h.sent.length, 1);
  h.respond({id: h.sent[0].id, points: [{x: 1, y: 2}]});
  assert.equal(h.results.length, 0, "the previous selection cannot paint");
  assert.equal(h.sent.length, 2); assert.equal(h.sent[1].input.aircraftId, "99");
  h.respond({id: h.sent[1].id, points: [{x: 3, y: 4}]});
  assert.equal(h.results.length, 1); assert.equal(h.sent.length, 2);
});

test("ongoing motion does not starve results for the current selection", () => {
  const h = harness(), context = {};
  h.client.update(h.job("one", context)); h.client.update(h.job("one", context));
  h.respond({id: h.sent[0].id, points: [{x: 1, y: 2}]});
  assert.deepEqual(h.results, [{context, points: [{x: 1, y: 2}]}]);
  assert.equal(h.sent.length, 2);
  h.client.update(h.job("one", context));
  h.respond({id: h.sent[1].id, points: [{x: 2, y: 3}]});
  assert.equal(h.results.length, 2); assert.equal(h.sent.length, 3);
});

test("configuration changes and returning to the same aircraft reject old results", () => {
  const h = harness(), original = {}, changed = {}, returned = {};
  h.client.update(h.job("one", original));
  h.client.update(h.job("two", changed)); h.client.update(h.job("one", returned));
  h.respond({id: h.sent[0].id, points: [{x: 1, y: 2}]});
  assert.equal(h.results.length, 0);
  h.respond({id: h.sent[1].id, points: [{x: 3, y: 4}]});
  assert.equal(h.results[0].context, returned);
  h.client.update(h.job("one", changed, "EGPH"));
  h.respond({id: -1, points: []}); assert.equal(h.results.length, 1, "unknown responses are ignored");
});

test("clearing selection discards queued work and late responses", () => {
  const h = harness(); h.client.update(h.job("one", {})); h.client.update(h.job("two", {}));
  h.client.update(null); h.respond({id: h.sent[0].id, points: [{x: 1, y: 2}]});
  assert.equal(h.results.length, 0); assert.equal(h.sent.length, 1);
  h.client.stop(); assert.equal(h.terminated(), 1); assert.equal(h.worker.onmessage, null);
});

test("worker errors stop forecasts without falling back to the UI thread", () => {
  for (const kind of ["error", "messageerror", "calculation", "clone"] as const) {
    const h = harness();
    if (kind === "clone") h.worker.postMessage = () => {throw new Error("cannot clone");};
    h.client.update(h.job("one", {}));
    if (kind === "error") h.worker.onerror?.call(h.worker as Worker, {} as ErrorEvent);
    if (kind === "messageerror") h.worker.onmessageerror?.call(h.worker as Worker, {} as MessageEvent);
    if (kind === "calculation") h.respond({id: h.sent[0].id, error: true});
    assert.equal(h.failures(), 1); assert.equal(h.terminated(), 1);
    h.client.update(h.job("two", {})); assert.equal(h.results.length, 0);
    assert.equal(h.sent.length, kind === "clone" ? 0 : 1);
  }
});
