import assert from "node:assert/strict";
import test from "node:test";

import {CourseLockedError, courseLockedErrorFromPayload} from "./course-api-client";

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
