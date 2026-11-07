import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {SessionService} from "./server/session-service";
import {createSessionApi} from "./server/session-api";
import {MemoryStore} from "./session-test-store";
import {BODY_BINARY_TYPE, encodeBody, STREAM_BINARY_TYPE, STREAM_FORMAT, STREAM_HEADER, StreamDecoder} from "./stream-codec";

test("the session API negotiates the compact stream and accepts compact command bodies", async () => {
  const trainer = {accountId: "trainer", displayName: "Trainer", staff: true};
  const store = new MemoryStore(), service = new SessionService(store);
  const {id} = await service.create(trainer, "Compact radar"), token = randomUUID();
  await service.join(trainer, id, "staff", token);
  const api = createSessionApi(store, async () => trainer);
  const headers = {"x-simulator-role": "staff", "x-simulator-seat": token};
  const legacy = await api.sessionOperation(new Request("https://sweatbox.test/api", {headers}), id, "stream");
  assert.match(legacy.headers.get("content-type") ?? "", /text\/event-stream/);
  await legacy.body!.cancel();
  const stream = await api.sessionOperation(new Request("https://sweatbox.test/api", {headers: {...headers, [STREAM_HEADER]: STREAM_FORMAT}}), id, "stream");
  assert.equal(stream.headers.get("content-type"), STREAM_BINARY_TYPE);
  const reader = stream.body!.getReader(), decoder = new StreamDecoder();
  try {
    let messages: ReturnType<StreamDecoder["push"]> = [];
    while (!messages.length) messages = decoder.push((await reader.read()).value!);
    assert.equal(messages[0].type, "snapshot");
    assert.equal(messages[0].exercise!.id, id);
    const body = encodeBody({role: "staff", token, envelope: {id: randomUUID(), time: 0, action: {kind: "pause"}}});
    const response = await api.sessionOperation(new Request("https://sweatbox.test/api", {method: "POST", headers: {...headers, "content-type": BODY_BINARY_TYPE}, body}), id, "commands");
    assert.equal(response.status, 200);
    const malformed = await api.sessionOperation(new Request("https://sweatbox.test/api", {method: "POST", headers: {...headers, "content-type": BODY_BINARY_TYPE}, body: new Uint8Array([10, 99])}), id, "commands");
    assert.equal(malformed.status, 400);
  } finally {await reader.cancel();}
});
