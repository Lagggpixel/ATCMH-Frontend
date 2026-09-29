import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const editorSource = readFileSync(new URL("../dashboard/components/admin/CourseEditor.tsx", import.meta.url), "utf8");
const mediaSource = readFileSync(new URL("../dashboard/utils/CourseMedia.ts", import.meta.url), "utf8");

test("course media authoring accepts MOV and HEIC files and normalizes their browser MIME types", () => {
    assert.match(mediaSource, /video\/quicktime/);
    assert.match(mediaSource, /mov:\s*"video\/quicktime"/);
    assert.match(mediaSource, /video\/quicktime,\.heic/);
    assert.match(mediaSource, /or MOV file no larger than 50 MB/);
    assert.match(mediaSource, /image\/heic/);
    assert.match(mediaSource, /heic:\s*"image\/heic"/);
    assert.match(editorSource, /isHeicMediaFile/);
    assert.match(editorSource, /prepareMediaFile\(file\)/);
});
