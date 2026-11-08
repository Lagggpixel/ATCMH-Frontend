import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createSessionApi} from "./server/session-api";
import {DemoHub} from "./server/demo-hub";
import {BODY_BINARY_TYPE, encodeBody} from "./stream-codec";
import {MemoryStore} from "./session-test-store";
import {SessionError} from "./sessions";
import {SessionService} from "./server/session-service";

const state = (selectedId: string | null) => ({
  frequency: "approach", selectedId, messageId: selectedId, menuPath: ["Altitude"], dismissedStrips: {},
  quickHidden: false, utility: null, vectorDraft: null, ground: null, camera: null,
});

test("mentee controller state reaches only the staff stream that asked for it, and the mentee's own frames are unchanged", async () => {
  const store = new MemoryStore(), shadow = new DemoHub();
  const api = createSessionApi(store, async (r, staff) => {
    if (!r.headers.get("cookie")) throw new SessionError("unauthorized", "Sign in", 401);
    return {accountId: r.headers.get("cookie")!, staff};
  }, undefined, undefined, undefined, new DemoHub(), shadow);
  const request = (method: string, body?: unknown, headers: Record<string, string> = {}, url = "https://atcmh.test/api/simulator/sessions") =>
    new Request(url, {method, headers: {cookie: "101", "content-type": "application/json", ...headers}, ...(body ? {body: JSON.stringify(body)} : {})});
  const session = await new SessionService(store).create({accountId: "101", staff: true}, "Shadow exercise"), staffSeat = randomUUID(), trainee = randomUUID();
  assert.equal((await api.sessionOperation(request("POST", {role: "staff", token: staffSeat}), session.id, "join")).status, 200);
  assert.equal((await api.sessionOperation(request("POST", {role: "mentee", token: trainee}, {cookie: "103"}), session.id, "join")).status, 200);
  const batch = {seq: 1, sentAt: 0, elapsed: 0, state: state("a1"), pointer: [], events: []};
  // Before the trainee's stream vouches for the seat, nothing is accepted.
  const early = await api.sessionOperation(request("POST", {role: "mentee", token: trainee, batch}, {cookie: "103"}), session.id, "shadow");
  assert.equal(early.status, 409); assert.equal((await early.json()).code, "shadow-closed");
  const traineeStream = await api.sessionOperation(request("GET", undefined, {cookie: "103", "x-simulator-role": "mentee", "x-simulator-seat": trainee}), session.id, "stream");
  const traineeReader = traineeStream.body!.getReader();
  const staffStream = await api.sessionOperation(request("GET", undefined, {"x-simulator-role": "staff", "x-simulator-seat": staffSeat}, `https://atcmh.test/api/simulator/sessions/${session.id}/stream?shadow=main`), session.id, "stream");
  const staffReader = staffStream.body!.getReader();
  const decoder = new TextDecoder();
  const packets = async (reader: ReadableStreamDefaultReader<Uint8Array>) => decoder.decode((await reader.read()).value).split("\n\n").filter(Boolean).map(line => JSON.parse(line.slice(6)));
  try {
    assert.equal((await packets(traineeReader))[0].type, "snapshot");
    assert.equal((await packets(staffReader))[0].type, "snapshot");
    // A staff page cannot post as the trainee.
    assert.equal((await api.sessionOperation(request("POST", {role: "staff", token: staffSeat, batch}), session.id, "shadow")).status, 409);
    const posted = await api.sessionOperation(request("POST", {role: "mentee", token: trainee, batch}, {cookie: "103"}), session.id, "shadow");
    assert.equal(posted.status, 200); assert.equal((await posted.json()).watched, true, "the staff stream is reading this position");
    let frame = (await packets(staffReader)).find(packet => packet.type === "shadow");
    while (!frame) frame = (await packets(staffReader)).find(packet => packet.type === "shadow");
    assert.equal(frame.positionId, "main"); assert.equal(frame.state.selectedId, "a1");
    // Pages on the compact stream post the same body in binary.
    const binary = await api.sessionOperation(new Request(`https://atcmh.test/api/simulator/sessions/${session.id}/shadow`, {method: "POST", headers: {cookie: "103", "content-type": BODY_BINARY_TYPE}, body: encodeBody({role: "mentee", token: trainee, batch}) as Uint8Array<ArrayBuffer>}), session.id, "shadow");
    assert.equal(binary.status, 200); assert.equal((await binary.json()).watched, true);
    const oversized = await api.sessionOperation(request("POST", {role: "mentee", token: trainee, batch, pad: "x".repeat(70_000)}, {cookie: "103"}), session.id, "shadow");
    assert.equal(oversized.status, 413);
    assert.deepEqual(shadow.drainTrace(`${session.id}:main`).map(entry => entry.accountId), ["103", "103"], "replays record which mentee produced each update");
  } finally {await traineeReader.cancel(); await staffReader.cancel();}
  await new Promise(resolve => setTimeout(resolve, 20));
  const unwatched = await api.sessionOperation(request("POST", {role: "mentee", token: trainee, batch}, {cookie: "103"}), session.id, "shadow");
  assert.equal((await unwatched.json()).watched, false, "nobody reads once the staff stream closes");
});
