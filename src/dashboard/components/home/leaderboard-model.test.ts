import assert from "node:assert/strict";
import test from "node:test";
import {paginateLeaderboard, rankLeaderboard, searchLeaderboard} from "./leaderboard-model";

const users = [
  {id: "11", username: "Alpha", allTimeAttendance: 100, recentAttendance: 1},
  {id: "22", username: "Bravo", allTimeAttendance: 80, recentAttendance: 20},
  {id: "33", username: "Charlie", allTimeAttendance: 60, recentAttendance: 20},
];

test("search preserves the selected attendance ranking, including Discord ID lookup", () => {
  const ranked = rankLeaderboard(users, "allTime");
  assert.equal(searchLeaderboard(ranked, "CHARLIE")[0].rank, 3);
  assert.equal(searchLeaderboard(ranked, "22")[0].rank, 2);
  assert.equal(searchLeaderboard(rankLeaderboard(users, "recent"), "bravo")[0].rank, 1);
  assert.deepEqual(users.map(user => user.username), ["Alpha", "Bravo", "Charlie"]);
});

test("recent ordering handles equal totals consistently and does not mutate attendance records", () => {
  const ranked = rankLeaderboard(users, "recent");
  assert.deepEqual(ranked.map(user => user.id), ["22", "33", "11"]);
  assert.deepEqual(ranked.map(user => user.rank), [1, 2, 3]);
  assert.equal("rank" in users[0], false);
});

test("pagination includes the last partial page and clamps pages after the result set shrinks", () => {
  const ranked = rankLeaderboard(Array.from({length: 23}, (_, index) => ({id: String(index), username: `Member ${index}`, allTimeAttendance: 23 - index, recentAttendance: 0})), "allTime");
  const last = paginateLeaderboard(ranked, 2);
  assert.equal(last.users.length, 3);
  assert.equal(last.start, 21);
  assert.equal(last.end, 23);
  assert.equal(last.users[0].rank, 21);
  assert.equal(paginateLeaderboard(ranked.slice(0, 1), 2).currentPage, 0);
  const empty = paginateLeaderboard([], 2);
  assert.equal(empty.start, 0);
  assert.equal(empty.end, 0);
  assert.equal(empty.currentPage, 0);
});
