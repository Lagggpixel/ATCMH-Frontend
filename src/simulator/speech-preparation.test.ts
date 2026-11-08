import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {initialExercise} from "./engine";
import {createScenarioExercise, scenarioFromExercise} from "./scenarios";
import {MemoryStore} from "./session-test-store";
import {SessionService} from "./server/session-service";

test("ATCMH joining never triggers speculative speech generation", async () => {
  const store = new MemoryStore(), service = new SessionService(store, () => 1000);
  const definition = scenarioFromExercise(initialExercise(), "Radio preparation"), aircraftKey = definition.aircraft[0].key;
  definition.events = [{id: "call", title: "Call", trigger: {type: "time", at: 30}, actions: [{type: "transmission", aircraftKey, text: "Request ILS approach"}]}];
  const source = createScenarioExercise(definition, randomUUID(), randomUUID());
  const actor = {accountId: "mentor", staff: true}, session = await service.create(actor, "Radio", source.exercise, source.runtime);
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {requests++; return new Response();}) as typeof fetch;
  try {
    await service.join(actor, session.id, "staff", randomUUID());
    await assert.rejects(service.join({accountId: "other", staff: true}, session.id, "staff", randomUUID()));
    assert.equal(requests, 0);
  } finally {globalThis.fetch = original;}
});
