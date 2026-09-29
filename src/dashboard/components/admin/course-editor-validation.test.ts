import assert from "node:assert/strict";
import test from "node:test";
import {createCourseBlock, moveCourseBlock} from "../../../lib/course-document";
import type {ManagedCourseDraft} from "../../types/Course";
import {validateCourseDraftForSave} from "./course-editor-validation";

const groupId = "a1000000-0000-4000-8000-000000000001";
const draft = (): ManagedCourseDraft => ({
    slug: "ground-control",
    title: "Ground Control",
    description: "",
    isPublished: false,
    navigationMode: "sequential",
    sectionGroups: [{id: groupId, title: "Ground Control", sortOrder: 1}],
    sections: [1, 2].map(index => ({
        id: `a1000000-0000-4000-8000-00000000000${index + 1}`,
        groupId,
        title: `Lesson ${index}`,
        sortOrder: index,
        markdown: "",
        document: {version: 1 as const, blocks: [createCourseBlock("text")]},
    })),
});

test("validation checks an inactive subsection and points to it", () => {
    const value = draft();
    value.sections[1].title = "";
    assert.deepEqual(validateCourseDraftForSave(value, new Set()), {
        field: "section", sectionId: value.sections[1].id, message: "Subsection 2 needs a title (255 characters maximum).",
    });
});

test("an unattached media block is reported instead of silently discarded", () => {
    const value = draft();
    const media = createCourseBlock("media");
    value.sections[1].document = {version: 1, blocks: [media]};
    const issue = validateCourseDraftForSave(value, new Set());
    assert.equal(issue?.sectionId, value.sections[1].id);
    assert.equal(issue?.blockId, media.id);
    assert.match(issue?.message ?? "", /attach a file/);
});

test("staged media is valid when it has accessible alt text", () => {
    const value = draft();
    const media = {...createCourseBlock("media"), alt: "Airport diagram"};
    value.sections[0].document = {version: 1, blocks: [media]};
    assert.equal(validateCourseDraftForSave(value, new Set([media.id])), null);
});

test("invalid quiz in another subsection identifies the block", () => {
    const value = draft();
    const quiz = createCourseBlock("quiz");
    value.sections[1].document = {version: 1, blocks: [quiz]};
    const issue = validateCourseDraftForSave(value, new Set());
    assert.equal(issue?.sectionId, value.sections[1].id);
    assert.equal(issue?.blockId, quiz.id);
});

test("the editor's Move down action places the block after its neighbor", () => {
    const first = createCourseBlock("text");
    const second = createCourseBlock("callout");
    const moved = moveCourseBlock({version: 1, blocks: [first, second]}, 0, 1);
    assert.deepEqual(moved.blocks.map(block => block.id), [second.id, first.id]);
});
