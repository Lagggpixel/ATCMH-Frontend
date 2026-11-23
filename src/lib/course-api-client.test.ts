import assert from "node:assert/strict";
import test from "node:test";

import {
    CourseLockedError,
    courseLockedErrorFromPayload,
    GroundSchoolGateError,
    groundSchoolGateErrorFromPayload,
} from "./course-api-client";

const courseId = "223e4567-e89b-42d3-a456-426614174000";

const lockedPayload = {
    error: "Complete the required courses before opening this course.",
    locked: true,
    prerequisites: [{courseId, title: "Runway safety", slug: "runway-safety", completed: false}],
    hasUnavailablePrerequisites: true,
};

test("typed locked 403 payload becomes a prerequisite-aware course lock", () => {
    const error = courseLockedErrorFromPayload(403, lockedPayload);
    assert.ok(error instanceof CourseLockedError);
    assert.deepEqual(error.prerequisites, lockedPayload.prerequisites);
    assert.equal(error.hasUnavailablePrerequisites, true);
});

test("unrelated 403 responses are not treated as course locks", () => {
    assert.equal(courseLockedErrorFromPayload(403, {error: "Forbidden"}), null);
    assert.equal(courseLockedErrorFromPayload(403, {...lockedPayload, locked: false}), null);
    assert.equal(courseLockedErrorFromPayload(403, {...lockedPayload, prerequisites: [{...lockedPayload.prerequisites[0], courseId: "not-a-course"}]}), null);
    assert.equal(courseLockedErrorFromPayload(401, lockedPayload), null);
});

test("typed Ground School gate payloads parse Discord server and enrollment gates", () => {
    const discordGate = groundSchoolGateErrorFromPayload(403, {
        code: "DISCORD_SERVER_REQUIRED",
        error: "You must join our discord server to participate in the Ground School.",
    });
    assert.ok(discordGate instanceof GroundSchoolGateError);
    assert.equal(discordGate.code, "DISCORD_SERVER_REQUIRED");

    const enrollGate = groundSchoolGateErrorFromPayload(403, {
        code: "ENROLLMENT_REQUIRED",
        error: "Enroll in this Ground School course before opening it.",
        course: {id: courseId, slug: "ground-control", title: "Ground Control", description: "Intro"},
    });
    assert.ok(enrollGate instanceof GroundSchoolGateError);
    assert.equal(enrollGate.code, "ENROLLMENT_REQUIRED");
    assert.equal(enrollGate.course?.title, "Ground Control");

    assert.equal(groundSchoolGateErrorFromPayload(403, {code: "UNKNOWN", error: "Nope"}), null);
});
