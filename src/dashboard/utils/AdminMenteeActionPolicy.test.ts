import test from "node:test";
import assert from "node:assert/strict";
import {getMenteeActionPolicy} from "./AdminMenteeActionPolicy.ts";

test("waitlisted mentees can be picked up and terminated but not scheduled", () => {
    assert.deepEqual(getMenteeActionPolicy({state: "waitlisted", hasMentor: false}), {
        canPickup: true,
        canTerminate: true,
        canPass: false,
        canSchedule: false,
    });
});

test("current mentees can be terminated, passed, and scheduled but not picked up", () => {
    assert.deepEqual(getMenteeActionPolicy({state: "picked_up", hasMentor: true}), {
        canPickup: false,
        canTerminate: true,
        canPass: true,
        canSchedule: true,
    });
});

test("passed and terminated mentees have no state or scheduling actions", () => {
    assert.deepEqual(getMenteeActionPolicy({state: "passed", hasMentor: true}), {
        canPickup: false,
        canTerminate: false,
        canPass: false,
        canSchedule: false,
    });
    assert.deepEqual(getMenteeActionPolicy({state: "terminated", hasMentor: false}), {
        canPickup: false,
        canTerminate: false,
        canPass: false,
        canSchedule: false,
    });
});
