import assert from "node:assert/strict";
import test from "node:test";
import type {PilotGuide} from "@/src/learning/pilot-guide";
import {parsePilotGuideResponse, pilotGuideContentSnapshot, pilotGuideRevisionHeader, pilotGuideWriteRequest} from "./pilot-guide-contract";

const guide: PilotGuide = {
    title: "Pilot Guide", introduction: "Read this before a training session.", lastUpdated: "2026-02-02",
    revision: 4, updatedAt: "2026-10-02T12:00:00Z",
    chapters: [{id: "getting-started", title: "Getting started", html: "<p>Original guide content.</p>"}],
};

test("published guide envelopes preserve content and server revision metadata", () => {
    assert.deepEqual(parsePilotGuideResponse({guide}), {guide});
    assert.deepEqual(parsePilotGuideResponse({guide: {...guide, revision: 0, updatedAt: null}}).guide.updatedAt, null);
});

test("malformed, duplicate, and impossible-date guide responses fail closed", () => {
    for (const value of [
        null, guide, {guide: {...guide, revision: "4"}}, {guide: {...guide, revision: -1}},
        {guide: {...guide, updatedAt: "yesterday"}}, {guide: {...guide, chapters: []}},
        {guide: {...guide, chapters: [guide.chapters[0], {...guide.chapters[0], title: "Duplicate ID"}]}},
        {guide: {...guide, lastUpdated: "2026-02-30"}}, {guide: {...guide, chapters: [{id: "a", title: "A"}]}},
    ]) assert.throws(() => parsePilotGuideResponse(value), /invalid guide data/);
});

test("writes include content fields while revision remains exclusively in If-Match", () => {
    assert.deepEqual(pilotGuideWriteRequest(guide), {
        title: guide.title, introduction: guide.introduction, lastUpdated: guide.lastUpdated, chapters: guide.chapters,
    });
    assert.equal(pilotGuideRevisionHeader(guide.revision), '"4"');
    assert.equal(pilotGuideRevisionHeader(0), '"0"');
    for (const revision of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => pilotGuideRevisionHeader(revision), /revision is invalid/);
    }
});

test("content snapshots accept incomplete drafts while writes still validate them", () => {
    const incomplete = {...guide, title: "", lastUpdated: "", chapters: [{...guide.chapters[0], title: ""}]};
    assert.doesNotThrow(() => pilotGuideContentSnapshot(incomplete));
    assert.notEqual(pilotGuideContentSnapshot(incomplete), pilotGuideContentSnapshot(guide));
    assert.throws(() => pilotGuideWriteRequest(incomplete));
    assert.equal(pilotGuideContentSnapshot({...guide, revision: 5, updatedAt: "2026-10-02T12:15:00Z"}), pilotGuideContentSnapshot(guide));
    assert.notEqual(pilotGuideContentSnapshot({...guide, chapters: [{...guide.chapters[0], html: "<p>Edited</p>"}]}), pilotGuideContentSnapshot(guide));
});
