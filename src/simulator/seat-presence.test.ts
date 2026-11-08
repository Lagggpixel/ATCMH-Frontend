import assert from "node:assert/strict";
import test from "node:test";
import {EMPTY_SEAT_MEMORY, mergeSeatNotices, seatNoticeUpdate, seatPresenceNotice, traineeSeats} from "./seat-presence";

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

test("staff notices cover a first join, a disconnect and a rejoin with the time away, running or paused", () => {
  const seat = (occupied: boolean) => [{key: "main", name: "Sam", occupied}];
  let state = seatNoticeUpdate(EMPTY_SEAT_MEMORY, seat(false), 0, true, true);
  assert.deepEqual(state.notices, [], "the first look only records who is there");
  state = seatNoticeUpdate(state.memory, seat(true), 1000, false, false);
  assert.equal(state.notices[0].kind, "joined");
  assert.match(state.notices[0].text, /^Sam joined\. The session is paused/);
  state = seatNoticeUpdate(state.memory, seat(false), 5000, false, false);
  assert.match(state.notices[0].text, /^Sam has disconnected\. The session stays paused until you resume\.$/);
  state = seatNoticeUpdate(state.memory, seat(true), 5000 + 130_000, true, false);
  assert.equal(state.notices[0].kind, "rejoined");
  assert.match(state.notices[0].text, /^Sam rejoined after 2 min 10 s away\./);
  assert.deepEqual(seatNoticeUpdate(state.memory, seat(true), 200_000, true, false).notices, [], "no change, no notice");
});

test("split sessions name the position, and a newer notice replaces the older one for the same seat", () => {
  const seats = traineeSeats({menteeOccupied: false, positions: [{id: "app", name: "Approach", occupied: true, traineeName: "Sam"}, {id: "dir", name: "Director", occupied: false, traineeName: "Alex"}]});
  assert.deepEqual(seats.map(s => s.key), ["app", "dir"]);
  const first = seatNoticeUpdate(EMPTY_SEAT_MEMORY, seats, 0, true, true);
  const left = seatNoticeUpdate(first.memory, [{...seats[0], occupied: false}, {...seats[1], occupied: true}], 10, true, false);
  assert.match(left.notices[0].text, /^Sam has disconnected from Approach/);
  assert.match(left.notices[1].text, /^Alex joined on Director\.$/);
  const shown = mergeSeatNotices([], left.notices);
  assert.deepEqual(shown.map(n => n.seat), ["dir", "app"], "newest first");
  const back = seatNoticeUpdate(left.memory, seats.map(s => ({...s, occupied: true})), 20, true, false);
  assert.deepEqual(mergeSeatNotices(shown, back.notices).map(n => `${n.seat}:${n.kind}`), ["app:rejoined", "dir:joined"]);
});
