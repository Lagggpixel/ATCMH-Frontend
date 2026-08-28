import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const editorSource = readFileSync(new URL("../dashboard/components/admin/CourseEditor.tsx", import.meta.url), "utf8");

test("course media authoring accepts MOV files and normalizes their browser MIME type", () => {
    assert.match(editorSource, /video\/quicktime/);
    assert.match(editorSource, /mov:\s*"video\/quicktime"/);
    assert.match(editorSource, /video\/quicktime,\.mov/);
    assert.match(editorSource, /or MOV file no larger than 50 MB/);
});
