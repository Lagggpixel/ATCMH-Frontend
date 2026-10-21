import assert from "node:assert/strict";
import {test} from "node:test";
import {createTrainingApi, type TrainingOperations} from "./server/training-api";
import {blankScenario, type ScenarioRecord} from "./scenarios";
import {brokenScenarioEvents} from "./scenario-dependencies";
import {launchableScenarios, sessionLibrary} from "./session-library";

test("session creation excludes templates, unpublished drafts and read-only scenarios", () => {
  const scenario = {id: "mine", publishedRevision: 1} as ScenarioRecord;
  assert.deepEqual(launchableScenarios([scenario, {...scenario, id: "draft", publishedRevision: 0}, {...scenario, isTemplate: true} as ScenarioRecord, {...scenario, canEdit: false} as ScenarioRecord]), [scenario]);
});

test("deleting an event flags direct and downstream dependants until repaired", () => {
  const draft = blankScenario();
  draft.events = [
    {id: "first", title: "First", trigger: {type: "manual"}, actions: [{type: "note", text: "First"}]},
    {id: "second", title: "Second", trigger: {type: "condition", condition: {type: "event", eventId: "first"}, delay: 0}, actions: [{type: "note", text: "Second"}]},
    {id: "third", title: "Third", trigger: {type: "condition", condition: {type: "event", eventId: "second"}, delay: 0}, actions: [{type: "note", text: "Third"}]},
  ];
  assert.equal(brokenScenarioEvents(draft).size, 0);
  draft.events.shift();
  assert.deepEqual([...brokenScenarioEvents(draft).keys()], ["second", "third"]);
  draft.events[0].trigger = {type: "manual"};
  assert.equal(brokenScenarioEvents(draft).size, 0);
  draft.events[0].trigger = {type: "condition", condition: {type: "event", eventId: "third"}, delay: 0};
  assert.equal(brokenScenarioEvents(draft).size, 2);
});

test("invalidated library reads cannot resurrect ended sessions or replace newer lists", async () => {
  const waiting: ((response: Response) => void)[] = [], received: string[][] = [], errors: string[] = [];
  const fetcher = (() => new Promise<Response>(resolve => waiting.push(resolve))) as typeof fetch;
  const sync = sessionLibrary(sessions => received.push(sessions.map(session => session.id)), error => errors.push(error), fetcher, 100000);
  try {
    const old = sync.refresh();
    sync.invalidate();
    const fresh = sync.refresh();
    waiting[2](Response.json({sessions: [{id: "new"}]})); waiting[3](Response.json({scenarios: []})); await fresh;
    waiting[0](Response.json({sessions: [{id: "ended"}]})); waiting[1](Response.json({scenarios: []})); await old;
    assert.deepEqual(received, [["new"]]); assert.deepEqual(errors, [""]);
    const stopped = sync.refresh(); sync.stop();
    waiting[4](Response.json({sessions: [{id: "late"}]})); waiting[5](Response.json({scenarios: []})); await stopped;
    assert.deepEqual(received, [["new"]]);
  } finally {sync.stop();}
});

test("a library refresh failure is reported independently and can recover", async () => {
  let failing = true; const errors: string[] = [];
  const sync = sessionLibrary(() => {}, error => errors.push(error), (async path => {
    if (failing) throw new Error("Offline");
    return Response.json(String(path).endsWith("sessions") ? {sessions: []} : {scenarios: []});
  }) as typeof fetch, 100000);
  try {await sync.refresh(); failing = false; await sync.refresh(); assert.deepEqual(errors, ["Offline", ""]);} finally {sync.stop();}
});


test("launch APIs validate and forward retry identities", async () => {
  const id = "11111111-2222-4333-8444-555555555555", requestId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const calls: unknown[][] = [];
  const api = createTrainingApi({launchScenario: async (...args: unknown[]) => {calls.push(args); return {sessionId: id};}} as unknown as TrainingOperations, async () => ({accountId: "trainer", staff: true}));
  const request = (value: string) => new Request("https://example.test", {method: "POST", body: JSON.stringify({action: "launch", revision: 1, requestId: value})});
  assert.equal((await api(request(requestId), "scenarios", id)).status, 200);
  assert.equal(calls[0][3], requestId);
  assert.equal((await api(request("invalid"), "scenarios", id)).status, 400);
  assert.equal(calls.length, 1);
});
