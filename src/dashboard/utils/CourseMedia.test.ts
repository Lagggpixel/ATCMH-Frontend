import test from "node:test";
import assert from "node:assert/strict";
import {isHeicMediaFile, mediaTypeForFile, prepareCourseImageFile, prepareMediaFile} from "./CourseMedia.ts";

test("accepts HEIC and HEIF files by MIME type and extension", () => {
    const heic = new File(["heic bytes"], "layout.HEIC", {type: "image/heic"});
    const heifWithoutMime = new File(["heif bytes"], "layout.heif", {type: ""});

    assert.equal(mediaTypeForFile(heic), "image/heic");
    assert.equal(mediaTypeForFile(heifWithoutMime), "image/heif");
    assert.equal(prepareMediaFile(heic), heic);
    assert.equal(prepareMediaFile(heifWithoutMime)?.type, "image/heif");
    assert.equal(isHeicMediaFile(heic), true);
    assert.equal(isHeicMediaFile(heifWithoutMime), true);
});

test("continues rejecting unsupported media extensions", () => {
    const file = new File(["not supported"], "layout.tiff", {type: ""});

    assert.equal(mediaTypeForFile(file), undefined);
    assert.equal(prepareMediaFile(file), undefined);
    assert.equal(isHeicMediaFile(file), false);
});

test("question image preparation accepts supported images and excludes video", () => {
    const png = new File(["png bytes"], "question.png", {type: "image/png"});
    const heic = new File(["heic bytes"], "question.HEIC", {type: "image/heic"});
    const video = new File(["video bytes"], "question.mp4", {type: "video/mp4"});

    assert.equal(prepareCourseImageFile(png), png);
    assert.equal(prepareCourseImageFile(heic), heic);
    assert.equal(prepareCourseImageFile(video), undefined);
});
