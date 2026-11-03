import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {initialExercise} from "./engine";
import {createScenarioExercise, scenarioFromExercise} from "./scenarios";
import {MemoryStore} from "./session-test-store";
import {SessionService} from "./server/session-service";

test("ATCMH prepares scripted radio after a successful join using its own cache namespace", async () => {
  const store = new MemoryStore(), prepared: {account: string; texts: readonly string[]; namespace?: string}[] = [];
  const service = new SessionService(store, () => 1000, randomUUID, undefined, undefined, undefined, (account, texts, namespace) => {
    assert.ok([...store.records.values()].some(record => record.staff), "join must commit before preparing audio");
    prepared.push({account, texts, namespace});
  });
  const definition = scenarioFromExercise(initialExercise(), "Radio preparation"), aircraftKey = definition.aircraft[0].key;
  definition.events = [{id: "call", title: "Call", trigger: {type: "time", at: 30}, actions: [{type: "transmission", aircraftKey, text: "Request ILS approach"}]}];
  const source = createScenarioExercise(definition, randomUUID(), randomUUID());
  const actor = {accountId: "mentor", staff: true}, session = await service.create(actor, "Radio", source.exercise, source.runtime);
  await service.join(actor, session.id, "staff", randomUUID());
  assert.equal(prepared.length, 1); assert.equal(prepared[0].account, actor.accountId);
  assert.equal(prepared[0].namespace, process.env.FRONTEND_PUBLIC_ORIGIN ?? "atcmh");
  assert.equal(prepared[0].texts.length, 1); assert.match(prepared[0].texts[0], /Request I-L-S approach/);
  await assert.rejects(service.join({accountId: "other", staff: true}, session.id, "staff", randomUUID()));
  assert.equal(prepared.length, 1, "a rejected join must not prepare scenario text");
});
