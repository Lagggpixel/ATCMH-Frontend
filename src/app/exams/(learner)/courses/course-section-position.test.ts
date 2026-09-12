import assert from "node:assert/strict";
import test from "node:test";
import {currentSectionIndex} from "./course-section-position.ts";

test("keeps the current heading selected through long gaps", () => {
    assert.equal(currentSectionIndex([-500, 250, 1200], -600, 2000, 800, false), 0);
    assert.equal(currentSectionIndex([-750, 0, 950], -850, 1750, 800, false), 1);
});

test("selects the final visible revision at page bottom", () => {
    assert.equal(currentSectionIndex([-900, -100, 450], -1000, 750, 800, true), 2);
});

test("does not select headings in an offscreen section", () => {
    assert.equal(currentSectionIndex([950], 900, 2000, 800, false), null);
    assert.equal(currentSectionIndex([-900], -1000, 0, 800, true), null);
    assert.equal(currentSectionIndex([], 0, 500, 800, false), null);
});
