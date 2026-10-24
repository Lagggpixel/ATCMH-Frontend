import assert from "node:assert/strict";
import test from "node:test";
import {newAircraft} from "./engine";
import {flightStrips} from "./flight-strip-order";
import type {Frequency, Message} from "./model";

const aircraft = ["first", "second", "third"].map(id => ({...newAircraft(id, true), frequency: "tower" as const}));
const ids = (messages: Message[], frequency: Frequency = "tower") => flightStrips({aircraft, messages}, frequency).map(a => a.id);
const message = (aircraftId: string, sender: Message["sender"], extra: Partial<Message> = {}): Message => ({id: `${sender}:${aircraftId}`, aircraftId, sender, frequency: "tower", time: 1000, text: "Transmission", ...extra});

test("each controller transmission, pilot request and pilot readback moves its strip to the top", () => {
  const messages: Message[] = [];
  assert.deepEqual(ids(messages), ["first", "second", "third"]);
  messages.push(message("third", "pilot", {read: false}));
  assert.deepEqual(ids(messages), ["third", "first", "second"]);
  messages.push(message("second", "controller"));
  assert.deepEqual(ids(messages), ["second", "third", "first"]);
  messages.push(message("third", "pilot", {commandId: "previous-command", read: true}));
  assert.deepEqual(ids(messages), ["third", "second", "first"]);
  assert.deepEqual(ids(structuredClone(messages)), ids(messages), "restored snapshots retain the same order");
});

test("other frequencies and removed aircraft do not disturb the selected frequency's strips", () => {
  const messages = [message("third", "controller"), message("first", "pilot", {frequency: "ground"}), message("removed", "pilot")];
  assert.deepEqual(ids(messages), ["third", "first", "second"]);
  assert.deepEqual(ids(messages, "ground"), []);
  assert.deepEqual(flightStrips({aircraft: [{...aircraft[0], frequency: "ground"}, aircraft[1]], messages}, "tower").map(a => a.id), ["second"]);
});

test("reading messages and updating aircraft never reorders or mutates the shared aircraft array", () => {
  const messages = [message("third", "pilot", {read: false}), message("second", "controller")];
  const before = structuredClone(aircraft);
  const ordered = ids(messages);
  messages[0].read = true;
  assert.deepEqual(ids(messages), ordered);
  assert.deepEqual(aircraft, before);
  assert.deepEqual(flightStrips({aircraft: aircraft.map(a => ({...a, altitude: a.altitude + 100})), messages}, "tower").map(a => a.id), ordered);
});
