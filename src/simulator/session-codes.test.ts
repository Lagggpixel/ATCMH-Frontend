import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {SessionService, type Actor} from "./server/session-service";
import {createSessionApi} from "./server/session-api";
import {MemoryStore} from "./session-test-store";
import {parseSessionEntry, sessionCode, SessionError} from "./sessions";
import {safeLoginReturnTo} from "../platform/auth/login-routing";

const trainer: Actor = {accountId: "mentor", staff: true, displayName: "Reid", discordId: "100000000000000001", canAssign: true};
const assignedOnly = (discordId: string): Actor => ({accountId: `acct-${discordId}`, staff: false, discordId, simulatorAccess: false});

test("session codes use twelve hex characters and accept pasted links", () => {
  const id = "3f9a1c2b-44de-4a11-8c21-7d4e5f6a8b90";
  assert.equal(sessionCode(id, "EGPH"), "EGPH-3F9A1C2B44DE");
  assert.deepEqual(parseSessionEntry(" egph-3f9a1c2b44de "), {code: "EGPH-3F9A1C2B44DE"});
  assert.deepEqual(parseSessionEntry("https://www.atcmh.org/sweatbox/join?code=EGPH-3F9A1C2B44DE"), {code: "EGPH-3F9A1C2B44DE"});
  assert.deepEqual(parseSessionEntry(`https://www.atcmh.org/sweatbox/mentee/${id}`), {id});
  assert.equal(parseSessionEntry("EGPH-3F9A1C2B"), null);
  assert.equal(parseSessionEntry("nonsense"), null);
});

test("code lookup previews a live session and hides unassigned sessions from mentees without access", async () => {
  const store = new MemoryStore(), service = new SessionService(store);
  const session = await service.create(trainer, "Circuits");
  const code = sessionCode(session.id, session.airport);
  let actor: Actor = {accountId: "tester", staff: false, discordId: "100000000000000009"};
  const api = createSessionApi(store, async request => {
    if (!request.headers.has("cookie")) throw new SessionError("unauthorized", "Sign in", 401);
    return actor;
  }, undefined, undefined, async () => true);
  const lookup = (value: string) => api.sessionCollection(new Request(`https://atcmh.test/api/simulator/sessions?code=${value}`, {headers: {cookie: "signed-in"}}));
  assert.equal((await api.sessionCollection(new Request(`https://atcmh.test/api/simulator/sessions?code=${code}`))).status, 401);
  const found = await (await lookup(code)).json();
  assert.equal(found.session.id, session.id); assert.equal(found.session.assignedToYou, false);
  assert.equal((await lookup("EGPH-000000000000")).status, 404);
  assert.equal((await lookup("bad")).status, 400);
  actor = assignedOnly("200000000000000002");
  assert.equal((await lookup(code)).status, 404, "unassigned session is indistinguishable from none");
  await service.assign(trainer, session.id, {discordId: "200000000000000002", name: "Alex"});
  const mine = await (await lookup(code)).json();
  assert.equal(mine.session.assignedToYou, true);
});

test("assignment reserves the mentee seat, lists the session for the mentee and releases another holder", async () => {
  const store = new MemoryStore(), service = new SessionService(store);
  const session = await service.create(trainer, "Assigned session");
  const tester: Actor = {accountId: "tester", staff: false, discordId: "100000000000000009"};
  await service.join(tester, session.id, "mentee", randomUUID());
  const result = await service.assign(trainer, session.id, {discordId: "200000000000000002", name: "Alex"});
  assert.equal(result.changed, true);
  assert.equal(result.session.assignedMenteeName, "Alex");
  assert.equal(store.records.get(session.id)?.mentee, null, "previous holder is released");
  await assert.rejects(service.join(tester, session.id, "mentee", randomUUID()), (e: unknown) => e instanceof SessionError && e.code === "not-assigned");
  const alex = assignedOnly("200000000000000002");
  await service.join(alex, session.id, "mentee", randomUUID());
  const listed = await service.assigned(alex);
  assert.equal(listed.length, 1); assert.equal(listed[0].youConnected, true);
  assert.deepEqual(await service.assigned(assignedOnly("300000000000000003")), []);
  await service.assign(trainer, session.id, null);
  await assert.rejects(service.frame(alex, session.id, "mentee", store.records.get(session.id)!.mentee?.token ?? randomUUID()), SessionError);
});

test("only trainers with explicit access or administrators can assign, and a change notifies once", async () => {
  const store = new MemoryStore(), service = new SessionService(store), notices: string[] = [];
  const session = await service.create(trainer, "Notify");
  await assert.rejects(service.assign({...trainer, canAssign: false}, session.id, {discordId: "200000000000000002"}), (e: unknown) => e instanceof SessionError && e.status === 403);
  const api = createSessionApi(store, async () => trainer, undefined, undefined, async notice => {notices.push(notice.discordId); return true;});
  const post = (mentee: unknown) => api.sessionOperation(new Request(`https://atcmh.test/api/simulator/sessions/${session.id}/assign`, {method: "POST", body: JSON.stringify({mentee})}), session.id, "assign");
  assert.equal((await post({discordId: "200000000000000002", name: "Alex"})).status, 200);
  assert.equal((await post({discordId: "200000000000000002", name: "Alex"})).status, 200);
  assert.equal((await post({discordId: "not-a-discord-id"})).status, 400);
  assert.deepEqual(notices, ["200000000000000002"]);
  assert.equal((await post(null)).status, 200);
  assert.equal(store.records.get(session.id)?.assignment, null);
});

test("direct mentee links still work for Sweatbox users and login can return to Your sweatbox", async () => {
  const store = new MemoryStore(), service = new SessionService(store);
  const session = await service.create(trainer, "Direct link session");
  const api = createSessionApi(store, async () => ({accountId: "learner", staff: false}));
  const response = await api.sessionOperation(new Request(`https://atcmh.test/api/simulator/sessions/${session.id}/join`, {method: "POST", body: JSON.stringify({role: "mentee", token: randomUUID()})}), session.id, "join");
  assert.equal(response.status, 200);
  assert.equal(store.records.get(session.id)?.mentee?.accountId, "learner");
  const path = `/sweatbox/mentee/${session.id}`;
  assert.equal(safeLoginReturnTo("dashboard", path), path);
  assert.equal(safeLoginReturnTo("dashboard", "/sweatbox/mentee"), "/sweatbox/mentee");
  assert.equal(safeLoginReturnTo("dashboard", "/sweatbox/join?code=EGPH-3F9A1C2B44DE"), "/sweatbox/join?code=EGPH-3F9A1C2B44DE");
});
