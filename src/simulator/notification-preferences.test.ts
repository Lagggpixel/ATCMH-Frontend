import assert from "node:assert/strict";
import test from "node:test";
import type {Pool} from "mysql2/promise";
import {setPoolForTests} from "../lib/db";
import {notifyAssignment, notifyFeedback} from "./server/assignment-notifications";

test("Discord notifications resolve active recipients, honor preferences and skip changed identities", async () => {
  let enabled = true, canonical = "100"; const calls: string[] = []; const payloads: Record<string, unknown>[] = [];
  setPoolForTests({execute: async () => [[{feedback_enabled: enabled ? 1 : 0, assignment_enabled: enabled ? 1 : 0}], []]} as unknown as Pool);
  const env = {DASHBOARD_API_URL: "https://api.example", EXAMS_AUTH_KEY: "test", FRONTEND_PUBLIC_ORIGIN: "https://www.atcmh.org"};
  const send = async (url: URL, init: RequestInit) => {calls.push(url.pathname); if (!url.pathname.endsWith("resolve-recipient")) payloads.push(JSON.parse(String(init.body))); return url.pathname.endsWith("resolve-recipient") ? Response.json({accountId: canonical, discordId: "123456789012345678"}) : Response.json({queued: true}, {status: 202});};
  try {
    assert.equal(await notifyAssignment({discordId: "123456789012345678", title: "Practice", airport: "EGPH", trainer: "Mentor"}, env, send), true);
    assert.equal(await notifyFeedback({accountId: "100", title: "Practice", airport: "EGPH", trainer: "Mentor", replayId: "00000000-0000-4000-8000-000000000000"}, env, send), true);
    assert.equal(payloads[1].link, "https://www.atcmh.org/sweatbox/replays/00000000-0000-4000-8000-000000000000");
    enabled = false; assert.equal(await notifyFeedback({accountId: "100", title: "Practice", airport: "EGPH", trainer: "Mentor"}, env, send), false);
    enabled = true; canonical = "101"; assert.equal(await notifyFeedback({accountId: "100", title: "Practice", airport: "EGPH", trainer: "Mentor"}, env, send), false);
    assert.equal(calls.filter(path => path.endsWith("assignment-notifications")).length, 1);
    assert.equal(calls.filter(path => path.endsWith("feedback-notifications")).length, 1);
  } finally {setPoolForTests(undefined);}
});
