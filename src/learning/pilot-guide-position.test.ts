import assert from "node:assert/strict";
import test from "node:test";
import {resolvePilotGuideChapter, pilotGuideChapterHash} from "./pilot-guide-position.ts";

test("chapter links override remembered position while explicit preview chapters override storage", () => {
    const ids = ["intro", "ground", "tower"];
    assert.equal(resolvePilotGuideChapter(ids, "#chapter=tower", "ground", "intro"), "tower");
    assert.equal(resolvePilotGuideChapter(ids, "", "ground"), "ground");
    assert.equal(resolvePilotGuideChapter(ids, "", "ground", "tower"), "tower");
    assert.equal(resolvePilotGuideChapter(ids, "#chapter=deleted", "ground"), "ground");
    assert.equal(resolvePilotGuideChapter(ids, "", "deleted"), "intro");
    assert.equal(resolvePilotGuideChapter([], "", {}), "");
});
test("chapter links safely encode chapter identifiers", () => {
    const id = "air & ground/é";
    assert.equal(resolvePilotGuideChapter([id], pilotGuideChapterHash(id), null), id);
});
