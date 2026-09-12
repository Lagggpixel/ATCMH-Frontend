import assert from "node:assert/strict";
import test from "node:test";

import {
    CourseDocumentValidationError,
    courseDocumentFromMarkdown,
    courseDocumentReferences,
    courseDocumentToMarkdown,
    insertCourseBlock,
    moveCourseBlock,
    parseCourseDocument,
    splitTextBlock,
    validateCourseDocument,
} from "./course-document";

const mediaId = "223e4567-e89b-42d3-a456-426614174000";
const quizId = "123e4567-e89b-42d3-a456-426614174000";
const activityId = "323e4567-e89b-42d3-a456-426614174000";

test("course documents round-trip through JSON without losing block metadata", () => {
    const document = validateCourseDocument({
        version: 1,
        blocks: [
            {id: "intro", type: "text", markdown: "# Ground fundamentals"},
            {id: "media", type: "media", mediaId, kind: "image", alt: "A runway diagram", caption: "Runway 27", width: "wide", align: "right"},
            {id: "note", type: "callout", tone: "warning", title: "Watch the hold short line", markdown: "Read back the runway."},
            {id: "diagram", type: "diagram", diagramId: "runway-selection", props: {compact: true}},
            {id: "quiz", type: "quiz", quizId, required: true, passPercent: 80},
            {id: "activity", type: "activity", activityId, required: true, passPercent: 80},
        ],
    });

    assert.deepEqual(parseCourseDocument(JSON.stringify(document)), document);
    assert.deepEqual(courseDocumentReferences(document), [
        {type: "image", id: mediaId, kind: "image"},
        {type: "diagram", id: "runway-selection"},
        {type: "quiz", id: quizId, required: true, passPercent: 80},
        {type: "activity", id: activityId, required: true, passPercent: 80},
    ]);
    assert.match(courseDocumentToMarkdown(document), /\{\{image:223e4567-e89b-42d3-a456-426614174000\}\}/);
});

test("legacy Markdown converts to first-class blocks and keeps directives in order", () => {
    const document = courseDocumentFromMarkdown(`# Taxi\n\nRead the sign.\n\n{{image:${mediaId}}}\n\n{{quiz:${quizId} required pass:80}}\n\n{{activity:${activityId} required pass:80}}`);
    assert.deepEqual(document.blocks.map(block => block.type), ["text", "media", "quiz", "activity"]);
    assert.equal(document.blocks[1].type, "media");
    if (document.blocks[1].type === "media") assert.equal(document.blocks[1].alt, "Course attachment");
});

test("caret insertion splits a text block and movement supports cross-zone composition", () => {
    const first = courseDocumentFromMarkdown("Before and after");
    const inserted = {id: "media", type: "media" as const, mediaId, kind: "image" as const, alt: "Chart", width: "content" as const, align: "center" as const};
    const split = splitTextBlock(first, 0, 7, inserted);
    assert.deepEqual(split.blocks.map(block => block.type), ["text", "media", "text"]);
    assert.equal(split.blocks[0].type === "text" ? split.blocks[0].markdown : "", "Before");
    assert.equal(split.blocks[2].type === "text" ? split.blocks[2].markdown : "", "and after");

    const withText = insertCourseBlock(split, 0, {id: "heading", type: "text", markdown: "Intro"});
    const moved = moveCourseBlock(withText, 0, withText.blocks.length - 1);
    assert.equal(moved.blocks.at(-1)?.id, "heading");
});

test("unsafe or incomplete block documents are rejected before upload/save", () => {
    assert.throws(() => validateCourseDocument({version: 2, blocks: []}), CourseDocumentValidationError);
    assert.throws(() => validateCourseDocument({version: 1, blocks: [{id: "x", type: "text", markdown: "<script>alert(1)</script>"}]}), /Raw HTML/);
    assert.throws(() => validateCourseDocument({version: 1, blocks: [{id: "x", type: "quiz", quizId, required: false, passPercent: 80}]}), /only be set on a required quiz/);
    assert.throws(() => validateCourseDocument({version: 1, blocks: [{id: "x", type: "text", markdown: "{{image:" + mediaId + "}}"}]}), /separate course blocks/);
    assert.doesNotThrow(() => validateCourseDocument({version: 1, blocks: [{id: "x", type: "media", mediaId, kind: "video", width: "content", align: "center"}]}));
    assert.equal(parseCourseDocument("not JSON"), null);
});

test("ungraded checks validate strictly without creating assessment references", () => {
    const check = {id: "practice", type: "check", prompt: "Who moves first?", options: ["Arrival", "Departure"], correctOption: 0, explanation: "Clear the runway exit."};
    const document = validateCourseDocument({version: 1, blocks: [check]});
    assert.deepEqual(courseDocumentReferences(document), []);
    assert.deepEqual(parseCourseDocument(JSON.stringify(document)), document);
    assert.match(courseDocumentToMarkdown(document), /Answer: Arrival/);
    for (const update of [{correctOption: -1}, {correctOption: 2}, {correctOption: .5}, {correctOption: "0"}, {options: ["Only one"]}, {options: ["", "Second"]}, {prompt: "<script>x</script>"}, {explanation: "{{quiz:bad}}"}, {required: true}]) {
        assert.throws(() => validateCourseDocument({version: 1, blocks: [{...check, ...update}]}), CourseDocumentValidationError);
    }
});

test("checks support optional incorrect reasoning without changing legacy checks", () => {
    const check = {id: "practice", type: "check", prompt: "Who moves first?", options: ["Arrival", "Departure"], correctOption: 0, explanation: "Protect traffic leaving the runway.", incorrectExplanation: "Keep the exit clear before sequencing departures."};
    const document = validateCourseDocument({version: 1, blocks: [check]});
    assert.deepEqual(parseCourseDocument(JSON.stringify(document)), document);
    assert.deepEqual(courseDocumentReferences(document), []);
    for (const incorrectExplanation of [null, 4, "", "<b>Unsafe</b>", "{{quiz:bad}}", "x".repeat(4001)]) {
        assert.throws(() => validateCourseDocument({version: 1, blocks: [{...check, incorrectExplanation}]}), CourseDocumentValidationError);
    }
    const legacy = validateCourseDocument({version: 1, blocks: [{...check, incorrectExplanation: undefined}]}).blocks[0];
    assert.equal("incorrectExplanation" in legacy, false);
});
