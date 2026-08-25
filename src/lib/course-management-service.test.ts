import assert from "node:assert/strict";
import test from "node:test";

import {uploadCourseMedia, saveManagedCourse} from "./course-management-service";
import type {ManagementActor} from "./permissions";

const mentor: ManagementActor = {discordId: "123456789012345", capabilities: ["manage-courses"], canManageAll: false};
const course = {
  slug: "tower-basics",
  title: "Tower basics",
  description: "A private course",
  isPublished: false,
  sections: [{title: "First steps", markdown: "# First steps", sortOrder: 1}],
};

test("course publishing is reserved for an actor with publish permission", async () => {
  const previous = process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
  process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = "true";
  try {
    await assert.rejects(() => saveManagedCourse({...course, isPublished: true}, mentor), /administrator access is required/);
  } finally {
    if (previous === undefined) delete process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
    else process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = previous;
  }
});

test("course media rejects unsupported types before opening storage", async () => {
  const previous = process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
  process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = "true";
  try {
    await assert.rejects(() => uploadCourseMedia("123e4567-e89b-42d3-a456-426614174000", {
      name: "payload.html", type: "text/html", size: 10, arrayBuffer: async () => new ArrayBuffer(10),
    }, mentor), /Only JPEG/);
  } finally {
    if (previous === undefined) delete process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
    else process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = previous;
  }
});

test("course media rejects content whose bytes do not match its declared type", async () => {
  const previous = process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
  process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = "true";
  try {
    await assert.rejects(() => uploadCourseMedia("123e4567-e89b-42d3-a456-426614174000", {
      name: "payload.png", type: "image/png", size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    }, mentor), /does not match its declared type/);
  } finally {
    if (previous === undefined) delete process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
    else process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = previous;
  }
});
