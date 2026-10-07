import test from "node:test";
import assert from "node:assert/strict";
import type {ManagedCourseSection, ManagedCourseSectionGroup} from "@/src/dashboard/types/Course";
import {canOpenSubsection, resumeSubsection, subsectionHref} from "./course-navigation";

const groups: ManagedCourseSectionGroup[] = [
  {id: "a", courseId: "course", title: "First", sortOrder: 1},
  {id: "b", courseId: "course", title: "Second", sortOrder: 2},
];
const sections = [
  {id: "one", groupId: "a", sortOrder: 1},
  {id: "two", groupId: "a", sortOrder: 2},
  {id: "three", groupId: "b", sortOrder: 3},
].map(section => ({...section, courseId: "course", title: section.id, markdown: ""})) as ManagedCourseSection[];

test("navigation modes unlock the intended leaves", () => {
  const none = new Set<string>();
  assert.equal(canOpenSubsection(sections[1], sections, groups, "sequential", none), false);
  assert.equal(canOpenSubsection(sections[1], sections, groups, "section_by_section", none), true);
  assert.equal(canOpenSubsection(sections[2], sections, groups, "section_by_section", none), false);
  assert.equal(canOpenSubsection(sections[2], sections, groups, "free", none), true);
  const firstDone = new Set(["one"]);
  assert.equal(canOpenSubsection(sections[1], sections, groups, "sequential", firstDone), true);
  assert.equal(canOpenSubsection(sections[2], sections, groups, "section_by_section", firstDone), false);
  assert.equal(canOpenSubsection(sections[2], sections, groups, "section_by_section", new Set(["one", "two"])), true);
});

test("resume chooses the first accessible incomplete leaf and links target one leaf", () => {
  assert.equal(resumeSubsection(sections, groups, "sequential", new Set(["one"]))?.id, "two");
  assert.equal(subsectionHref("course", "two"), "/exams/courses/course?subsection=two");
});
