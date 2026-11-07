import assert from "node:assert/strict";
import test from "node:test";
import {seatPresenceNotice} from "./seat-presence";

const running = {running: true, autoReadback: true};
const both = {staffOccupied: true, menteeOccupied: true};
const seen = {trainee: true, trainer: true};

test("the trainer is warned when their trainee drops out of a running session, without pausing it", () => {
  assert.equal(seatPresenceNotice("staff", both, running, seen), null);
  assert.match(seatPresenceNotice("staff", {...both, menteeOccupied: false, menteeName: "Alex"}, running, seen) ?? "", /^Alex has disconnected/);
  // Nothing to report before a trainee ever joined, or while paused.
  assert.equal(seatPresenceNotice("staff", {...both, menteeOccupied: false}, running, {...seen, trainee: false}), null);
  assert.equal(seatPresenceNotice("staff", {...both, menteeOccupied: false}, {...running, running: false}, seen), null);
});

test("split-position sessions pause on their own and get no extra warning", () => {
  const positions = [{id: "a"}] as never;
  assert.equal(seatPresenceNotice("staff", {...both, menteeOccupied: false}, {...running, positions}, seen), null);
});

test("the trainee is told when the trainer leaves with automatic pilot actions off", () => {
  assert.equal(seatPresenceNotice("mentee", {...both, staffOccupied: false}, running, seen), null);
  assert.match(seatPresenceNotice("mentee", {...both, staffOccupied: false}, {...running, autoReadback: false}, seen) ?? "", /will not read back/);
});
