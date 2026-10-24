import assert from "node:assert/strict";
import test from "node:test";
import {createPeopleApi, searchPeople} from "./server/people-api";
import {SessionError} from "./sessions";

const people = [{id: "100000000000000001", name: "Alex Rivera"}, {id: "100000000000000002", name: "Sam Alexander"}, {id: "100000000000000003", name: "Priya"}];

test("member search ranks name prefixes first and supports exact Discord IDs", () => {
  assert.deepEqual(searchPeople(people, "alex").map(p => p.name), ["Alex Rivera", "Sam Alexander"]);
  assert.deepEqual(searchPeople(people, "100000000000000003").map(p => p.name), ["Priya"]);
  assert.deepEqual(searchPeople(people, "  "), []);
});

test("only assigning trainers can search, and the directory is fetched with the site origin", async () => {
  const requests: RequestInit[] = [];
  let canAssign = false;
  const api = createPeopleApi(async (_request, staff) => {
    if (!staff) throw new SessionError("forbidden", "staff", 403);
    return {accountId: "1", staff: true, ...(canAssign ? {canAssign: true} : {})};
  }, async (_url, init) => {requests.push(init); return Response.json([{id: "100000000000000001", username: "Alex Rivera", allTimeAttendance: 3}]);},
  {DASHBOARD_API_URL: "https://api.test", FRONTEND_PUBLIC_ORIGIN: "https://atcmh.test"});
  const search = () => api(new Request("https://atcmh.test/api/simulator/people?q=ale"));
  assert.equal((await search()).status, 403);
  canAssign = true;
  const body = await (await search()).json();
  assert.deepEqual(body.people, [{id: "100000000000000001", name: "Alex Rivera"}]);
  await search();
  assert.equal(requests.length, 1, "directory is cached");
  assert.equal(new Headers(requests[0].headers).get("origin"), "https://atcmh.test");
});
