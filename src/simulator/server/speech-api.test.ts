import assert from "node:assert/strict";
import test from "node:test";
import {createSpeechApi} from "./speech-api";
import {SessionError} from "../sessions";
import {recordingWav} from "../recorded-output";
import type {authorizeSessionRequest} from "./session-auth";

const authorize = (async () => ({accountId: "account-123", staff: false})) as typeof authorizeSessionRequest;
const url = "https://example.test/api/simulator/speech";
const request = (value: unknown) => new Request(url, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(value)});

test("speech proxy enforces access and sends a pseudonymous identity to its private service", async () => {
  const oldUrl = process.env.SPEECH_SERVICE_URL, oldToken = process.env.SPEECH_SERVICE_TOKEN;
  process.env.SPEECH_SERVICE_URL = "http://speech.internal:3001/"; process.env.SPEECH_SERVICE_TOKEN = "x".repeat(32);
  try {
    let calls = 0;
    const upstream = (async (target, init) => {
      calls++;
      assert.equal(String(target), "http://speech.internal:3001/speech");
      const body = JSON.parse(String(init?.body));
      assert.match(body.accountId, /^[a-f0-9]{64}$/);
      assert.notEqual(body.accountId, "account-123");
      return new Response(recordingWav(new Float32Array([0.1, -0.1]), 24000), {headers: {"content-type": "audio/wav"}});
    }) as typeof fetch;
    const api = createSpeechApi(authorize, upstream);
    assert.equal((await api(request({text: "Radio ready", voice: "af_heart"}))).status, 200);
    assert.equal((await api(request({text: "Radio ready", voice: "invalid"}))).status, 400);
    assert.equal(calls, 1);
    const denied = createSpeechApi((async () => {throw new SessionError("unauthorized", "Sign in", 401);}) as typeof authorizeSessionRequest, upstream);
    assert.equal((await denied(request({text: "Radio ready", voice: "af_heart"}))).status, 401);
    assert.equal(calls, 1);
    const corrupt = createSpeechApi(authorize, (async () => new Response(new Uint8Array([1, 2]), {headers: {"content-type": "audio/wav"}})) as typeof fetch);
    assert.equal((await corrupt(request({text: "Radio ready", voice: "af_heart"}))).status, 503);
    const busy = createSpeechApi(authorize, (async () => new Response(null, {status: 429})) as typeof fetch);
    assert.equal((await busy(request({text: "Radio ready", voice: "af_heart"}))).status, 429);
    const unready = createSpeechApi(authorize, (async () => Response.json({ready: false})) as typeof fetch);
    assert.deepEqual(await (await unready(new Request(url))).json(), {ready: false});
  } finally {
    if (oldUrl === undefined) delete process.env.SPEECH_SERVICE_URL; else process.env.SPEECH_SERVICE_URL = oldUrl;
    if (oldToken === undefined) delete process.env.SPEECH_SERVICE_TOKEN; else process.env.SPEECH_SERVICE_TOKEN = oldToken;
  }
});
