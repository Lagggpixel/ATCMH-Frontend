import assert from "node:assert/strict";
import test from "node:test";
import {createPocketProxy} from "./pocket-proxy";
import {SessionError} from "../sessions";

const url = "https://example.test/api/simulator/pocket-speech";
const authorize = async () => ({accountId: "private-account"});
const failure = (error: unknown) => new Response(null, {status: error instanceof SessionError ? error.status : 400});
const request = (body: unknown) => new Request(url, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)});

test("proxy authorizes, pseudonymizes and forwards a stream without waiting for completion", async () => {
  const oldUrl = process.env.SPEECH_SERVICE_URL, oldToken = process.env.SPEECH_SERVICE_TOKEN;
  process.env.SPEECH_SERVICE_URL = "http://voice.internal/"; process.env.SPEECH_SERVICE_TOKEN = "x".repeat(32);
  try {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let called = 0;
    const fetcher = (async (target, init) => {
      called++;
      assert.equal(String(target), "http://voice.internal/speech");
      const payload = JSON.parse(String(init?.body));
      assert.match(payload.accountId, /^[a-f0-9]{64}$/);
      assert.notEqual(payload.accountId, "private-account");
      return new Response(new ReadableStream<Uint8Array>({start(c) {controller = c;}}), {headers: {"content-type": "application/vnd.atcmh.pcm-stream"}});
    }) as typeof fetch;
    const api = createPocketProxy(authorize, failure, () => "test", fetcher);
    assert.equal((await api(request({text: "test", voice: "bad"}))).status, 400);
    assert.equal(called, 0);
    const response = await api(request({text: "test", voice: "alba"}));
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    controller.enqueue(Uint8Array.of(1, 2, 3));
    assert.deepEqual((await reader.read()).value, Uint8Array.of(1, 2, 3));
    controller.close();
    assert.equal((await reader.read()).done, true);
    const denied = createPocketProxy(async () => {throw new SessionError("unauthorized", "Sign in", 401);}, failure, () => "test", fetcher);
    assert.equal((await denied(request({text: "test", voice: "alba"}))).status, 401);
    assert.equal(called, 1);
  } finally {
    if (oldUrl === undefined) delete process.env.SPEECH_SERVICE_URL; else process.env.SPEECH_SERVICE_URL = oldUrl;
    if (oldToken === undefined) delete process.env.SPEECH_SERVICE_TOKEN; else process.env.SPEECH_SERVICE_TOKEN = oldToken;
  }
});
