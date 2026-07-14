import test from "node:test";
import assert from "node:assert/strict";
import {dialogKeyResult} from "./DialogKeyboard.ts";

test("Escape closes the dialog", () => assert.deepEqual(dialogKeyResult("Escape", false, 1, 3), {close: true}));
test("Tab and Shift+Tab remain trapped inside dialog controls", () => {
    assert.deepEqual(dialogKeyResult("Tab", false, 2, 3), {close: false, focusIndex: 0});
    assert.deepEqual(dialogKeyResult("Tab", true, 0, 3), {close: false, focusIndex: 2});
    assert.deepEqual(dialogKeyResult("Tab", false, 0, 3), {close: false, focusIndex: 1});
});
