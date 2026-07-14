import test from "node:test";
import assert from "node:assert/strict";
import {
    formatAdminUtcDate,
    generateHalfHourUtcDateTimeSuggestions,
    formatIfcDisplay,
    parseUtcDateTimeInput,
} from "./AdminDateUtils.ts";

test("formats IFC by name without appending the IFC id", () => {
    assert.equal(formatIfcDisplay({ifcName: "Boston ARTCC", ifcId: "ZBW"}), "Boston ARTCC");
    assert.equal(formatIfcDisplay({ifcId: "ZBW"}), "ZBW");
    assert.equal(formatIfcDisplay({}), "No IFC linked");
});

test("parses datetime-local input as local time and converts to UTC", () => {
    // datetime-local inputs always show local wall-clock time.
    // "2026-06-19T18:30" from the input means 18:30 local time, which becomes UTC.
    const result = parseUtcDateTimeInput("2026-06-19T18:30");
    const date = new Date(result);
    assert.equal(date.getUTCFullYear(), 2026);
    assert.equal(date.getUTCMonth(), 5);
    assert.equal(date.getUTCDate(), 19);
    // Hour depends on timezone — verify the local hour matches input
    assert.equal(date.getHours(), 18);
    assert.equal(date.getMinutes(), 30);
});

test("formats admin dates in UTC", () => {
    assert.equal(formatAdminUtcDate("2026-06-19T18:30:00.000Z"), "2026-06-19 18:30 UTC");
    assert.equal(formatAdminUtcDate("2026-06-19T18:30:00.000Z", {showUtcSuffix: false}), "2026-06-19 18:30");
    assert.equal(formatAdminUtcDate(undefined), "Not set");
});

test("generates half-hour UTC datetime-local suggestions", () => {
    assert.deepEqual(generateHalfHourUtcDateTimeSuggestions(new Date("2026-06-19T18:07:00.000Z"), 4), [
        "2026-06-19T18:30",
        "2026-06-19T19:00",
        "2026-06-19T19:30",
        "2026-06-19T20:00",
    ]);
});
