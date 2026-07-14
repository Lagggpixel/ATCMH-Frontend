import assert from "node:assert/strict";
import test from "node:test";

import { buildAttemptWebhookPayload, sendAttemptWebhook, type AttemptWebhookInput } from "./attempt-webhook";

const input: AttemptWebhookInput = {
  quizTitle: "Tower Basics", discordId: "123456789012345678", score: 8, total: 10, percentage: 80,
  submissionReason: "manual", attemptCode: "ATCMH-ATTEMPT-1", attemptId: "attempt-1",
  submittedAt: new Date("2026-07-11T08:30:00.000Z"),
  attemptUrl: new URL("https://exams.atcmh.org/attempts/attempt-1"),
};

async function withWebhookUrl(url: string | undefined, run: () => Promise<void>): Promise<void> {
  const previousUrl = process.env.DISCORD_WEBHOOK_URL;
  if (url === undefined) delete process.env.DISCORD_WEBHOOK_URL;
  else process.env.DISCORD_WEBHOOK_URL = url;
  try { await run(); } finally {
    if (previousUrl === undefined) delete process.env.DISCORD_WEBHOOK_URL;
    else process.env.DISCORD_WEBHOOK_URL = previousUrl;
  }
}

test("skips delivery without configuration and posts JSON when configured", async () => {
  let calls = 0;
  const requestOptions: RequestInit[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1; requestOptions.push(init ?? {}); return new Response(null, { status: 204 });
  };
  await withWebhookUrl(undefined, async () => sendAttemptWebhook(input, { fetch }));
  assert.equal(calls, 0);
  await withWebhookUrl("https://discord.example/webhook/secret", async () => sendAttemptWebhook(input, { fetch }));
  assert.equal(calls, 1);
  assert.equal(requestOptions[0].method, "POST");
  assert.deepEqual(requestOptions[0].headers, { "content-type": "application/json" });
  assert.ok(requestOptions[0].signal instanceof AbortSignal);
  assert.equal(requestOptions[0].signal?.aborted, false);
  assert.deepEqual(JSON.parse(String(requestOptions[0].body)), buildAttemptWebhookPayload(input));
});

test("isolates fetch failures and logs only the sanitized error class", async () => {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    await withWebhookUrl("https://discord.example/webhook/secret", async () => {
      await assert.doesNotReject(() => sendAttemptWebhook(input, { fetch: async () => { throw new TypeError("secret payload and URL"); } }));
    });
    assert.deepEqual(warnings, [["Discord attempt webhook delivery failed", "TypeError"]]);
  } finally { console.warn = originalWarn; }
});

test("isolates non-success responses and logs only the status", async () => {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    await withWebhookUrl("https://discord.example/webhook/secret", async () => {
      await assert.doesNotReject(() => sendAttemptWebhook(input, { fetch: async () => new Response(null, { status: 500 }) }));
    });
    assert.deepEqual(warnings, [["Discord attempt webhook delivery failed", 500]]);
  } finally { console.warn = originalWarn; }
});
