import test from "node:test";
import assert from "node:assert/strict";
import type {AtcmhUser} from "../types/AtcmhUser.ts";
import type {ExamQuizUnlock} from "../types/Exam.ts";
import {applyConfirmedUnlockUpdate, filterUnlockCandidates, isAlreadyUnlocked, isCurrentUnlockListRequest, isDiscordId} from "./ExamUnlockUtils.ts";

const users: AtcmhUser[] = [
    {id: "123456789012345", username: "TowerPilot", allTimeAttendance: 10, recentAttendance: 2},
    {id: "223456789012345", username: "GroundCrew", allTimeAttendance: 8, recentAttendance: 1},
    {id: "323456789012345", username: "ApproachPilot", allTimeAttendance: 6, recentAttendance: 3},
];

const unlock = (discordId: string, userName: string | null): ExamQuizUnlock => ({
    discordId,
    userName,
    unlockedBy: "mentor",
    unlockedAt: "2026-07-11T00:00:00Z",
});

test("accepts only Discord snowflake-shaped IDs", () => {
    assert.equal(isDiscordId("123456789012345"), true);
    assert.equal(isDiscordId(" 12345678901234567890 "), true);
    assert.equal(isDiscordId("123"), false);
    assert.equal(isDiscordId("123456789012345678901"), false);
    assert.equal(isDiscordId("12345678901234x"), false);
});

test("matches unlock candidates by username without case sensitivity", () => {
    assert.deepEqual(filterUnlockCandidates(users, [], "PILOT").map(user => user.id), [
        "123456789012345",
        "323456789012345",
    ]);
});

test("matches unlock candidates by partial Discord ID", () => {
    assert.deepEqual(filterUnlockCandidates(users, [], "223456").map(user => user.username), ["GroundCrew"]);
});

test("omits users whose Discord IDs are already unlocked", () => {
    const unlocks = [unlock("123456789012345", "TowerPilot")];
    assert.deepEqual(filterUnlockCandidates(users, unlocks, "pilot").map(user => user.id), ["323456789012345"]);
});

test("detects a manually entered Discord ID that is already unlocked", () => {
    const existing = [unlock("223456789012345", "GroundCrew")];
    assert.equal(isAlreadyUnlocked(existing, " 223456789012345 "), true);
    assert.equal(isAlreadyUnlocked(existing, "123456789012345"), false);
});

test("returns no candidates for an empty query", () => {
    assert.deepEqual(filterUnlockCandidates(users, [], "   "), []);
});

test("applies a confirmed unlock and sorts the resulting state", () => {
    const existing = [unlock("223456789012345", "Zulu")];
    const confirmed = unlock("123456789012345", "Alpha");
    assert.deepEqual(applyConfirmedUnlockUpdate(existing, confirmed, true), [confirmed, existing[0]]);
});

test("replaces an existing entry when a confirmed unlock has the same Discord ID", () => {
    const existing = unlock("123456789012345", "Old name");
    const confirmed = unlock("123456789012345", "New name");
    assert.deepEqual(applyConfirmedUnlockUpdate([existing], confirmed, true), [confirmed]);
});

test("removes only the matching entry after a confirmed lock", () => {
    const removed = unlock("123456789012345", "TowerPilot");
    const retained = unlock("223456789012345", "GroundCrew");
    assert.deepEqual(applyConfirmedUnlockUpdate([removed, retained], removed, false), [retained]);
});

test("rejects an older same-quiz list response after a newer refresh starts", () => {
    const selectedQuizId = "private-quiz";
    const initialRequestVersion = 1;
    const refreshRequestVersion = 2;

    assert.equal(isCurrentUnlockListRequest(initialRequestVersion, refreshRequestVersion, selectedQuizId, selectedQuizId), false);
    assert.equal(isCurrentUnlockListRequest(refreshRequestVersion, refreshRequestVersion, selectedQuizId, selectedQuizId), true);
    assert.equal(isCurrentUnlockListRequest(refreshRequestVersion, refreshRequestVersion, selectedQuizId, "another-quiz"), false);
});
