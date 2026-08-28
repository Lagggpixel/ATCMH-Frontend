import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const editorSource = readFileSync(new URL("../dashboard/components/admin/CourseEditor.tsx", import.meta.url), "utf8");

test("course block choices are contextual to each insertion button", () => {
    assert.match(editorSource, /function InsertBlockMenu\(/);
    assert.match(editorSource, /<details className=\{styles\.insertMenu\}>/);
    assert.match(editorSource, /INSERTABLE_BLOCK_TYPES/);
    assert.match(editorSource, /InsertBlockMenu label="＋ Insert here"/);
    assert.match(editorSource, /InsertBlockMenu label="＋ Add at end"/);
    assert.doesNotMatch(editorSource, /New block<select/);
    assert.doesNotMatch(editorSource, /quizSelection/);
});
