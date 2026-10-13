import assert from "node:assert/strict";
import test from "node:test";
import {defaultSessionPreferences, parseSessionPreferences} from "./SessionPreferences.ts";

test("session preferences restore filters, ordering and page size", () => {
    const preferences = {filter: {mentor: "Alex", mentee: "100", attendee: "Jamie", cancelled: "active", period: "upcoming", mine: true, from: "2026-10-01", to: "2026-10-31"}, sort: {column: "airport", direction: "asc"}, pageSize: 50};
    assert.deepEqual(parseSessionPreferences(JSON.parse(JSON.stringify(preferences))), preferences);
});
test("corrupt, outdated and unsupported saved preferences fall back safely", () => {
    for (const value of [null, false, "broken", [], {}, {filter: null, sort: null, pageSize: -1}]) {
        assert.deepEqual(parseSessionPreferences(value), defaultSessionPreferences);
    }
    const value = parseSessionPreferences({filter: {mine: "false", mentor: "x".repeat(300), from: "2026-02-30", to: "garbage", period: "bad"}, sort: {column: "__proto__", direction: "bad"}, pageSize: 1_000_000});
    assert.equal(value.filter.mentor.length, 128);
    assert.equal(value.filter.mine, false);
    assert.equal(value.filter.from, ""); assert.equal(value.filter.to, "");
    assert.deepEqual(value.sort, defaultSessionPreferences.sort);
    assert.equal(value.pageSize, 25);
});
