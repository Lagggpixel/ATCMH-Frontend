import assert from "node:assert/strict";
import test from "node:test";
import {
    applicationRegions,
    commonTimezoneOffsets,
    formatUtcOffset,
    inferTimezoneFromCurrentTime,
    normalizeRegionAnswer,
    normalizeTimezoneAnswer,
    parseCurrentClockTime,
} from "./location-input";

test("broad regions normalize older abbreviations without guessing a location", () => {
    assert.deepEqual(applicationRegions, ["Africa", "Asia", "Europe", "Middle East", "North America", "South America", "Oceania", "Other"]);
    for (const [answer, expected] of [
        [" EU ", "Europe"], ["EUR", "Europe"], ["NA", "North America"], ["Australia", "Oceania"],
        ["middle-east", "Middle East"], ["north_america", "North America"], ["N America", "North America"],
        ["S America", "South America"], ["New Zealand", "Oceania"], ["Other / prefer not to say", "Other"],
        ["prefer not to say", "Other"],
    ]) {
        assert.equal(normalizeRegionAnswer(answer), expected);
    }
    assert.equal(normalizeRegionAnswer("Somewhere near my airport"), null);
    assert.equal(normalizeRegionAnswer("constructor"), null);
});

test("timezone drafts become canonical UTC offsets and retain quarter-hour precision", () => {
    for (const [answer, expected] of [
        [" UTC+1 ", "UTC+01:00"], ["GMT - 04:30", "UTC-04:30"], ["UTC+0545", "UTC+05:45"],
        ["utc−03:30", "UTC-03:30"], ["UTC", "UTC+00:00"], ["UTC-0", "UTC+00:00"], ["+14", "UTC+14:00"],
    ]) assert.equal(normalizeTimezoneAnswer(answer), expected);
    for (const invalid of ["UTC+15", "UTC-12:15", "UTC+14:15", "UTC+02:10", "UTC+00:75", "IST", "17:30", ""]) {
        assert.equal(normalizeTimezoneAnswer(invalid), null, invalid);
    }
});

test("timezone dropdown includes both endpoint offsets and common fractional offsets", () => {
    assert.equal(commonTimezoneOffsets[0], "UTC-12:00");
    assert.equal(commonTimezoneOffsets.at(-1), "UTC+14:00");
    for (const value of ["UTC-09:30", "UTC-03:30", "UTC+03:30", "UTC+05:45", "UTC+08:45", "UTC+12:45", "UTC+13:45"]) {
        assert.ok(commonTimezoneOffsets.includes(value), value);
    }
    assert.equal(new Set(commonTimezoneOffsets).size, commonTimezoneOffsets.length);
    assert.equal(formatUtcOffset(-0), "UTC+00:00");
    assert.equal(formatUtcOffset(30.5), null);
    assert.equal(formatUtcOffset(Number.NaN), null);
});

test("local clock input understands AM/PM, 24-hour time, noon, and midnight", () => {
    for (const [answer, expected] of [
        ["5:30pm", 1050], ["17:30", 1050], [" 5:30 PM ", 1050], ["5pm", 1020],
        ["12:00am", 0], ["00:00", 0], ["12:00pm", 720], ["23:59", 1439],
    ] as const) assert.equal(parseCurrentClockTime(answer), expected);
    for (const invalid of ["24:00", "13:30pm", "0:30am", "17:60", "5:3pm", "5", "noon", "5:30pm tomorrow", ""]) {
        assert.equal(parseCurrentClockTime(invalid), null, invalid);
    }
    assert.equal(parseCurrentClockTime("5:30"), 330);
});

test("current clock inference uses the supplied present UTC time and quarter-hour offsets", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    assert.deepEqual(inferTimezoneFromCurrentTime("5:30pm", now), [{value: "UTC+05:30", offsetMinutes: 330}]);
    assert.deepEqual(inferTimezoneFromCurrentTime("17:45", now), [{value: "UTC+05:45", offsetMinutes: 345}]);
    assert.deepEqual(inferTimezoneFromCurrentTime("17:44", now), [{value: "UTC+05:45", offsetMinutes: 345}]);
    assert.deepEqual(inferTimezoneFromCurrentTime("invalid", now), []);
    assert.deepEqual(inferTimezoneFromCurrentTime("17:30", new Date("invalid")), []);
    assert.notDeepEqual(inferTimezoneFromCurrentTime("17:30", now), inferTimezoneFromCurrentTime("17:30", new Date("2026-10-02T13:00:00Z")));
});

test("midnight wraps remain valid and date ambiguity is never silently resolved", () => {
    assert.deepEqual(inferTimezoneFromCurrentTime("00:30", new Date("2026-10-02T23:00:00Z")), [{value: "UTC+01:30", offsetMinutes: 90}]);
    const now = new Date("2026-10-02T15:30:00Z");
    assert.deepEqual(inferTimezoneFromCurrentTime("03:30", now), [
        {value: "UTC-12:00", offsetMinutes: -720}, {value: "UTC+12:00", offsetMinutes: 720},
    ]);
    assert.deepEqual(inferTimezoneFromCurrentTime("03:30", now, 720), [
        {value: "UTC+12:00", offsetMinutes: 720}, {value: "UTC-12:00", offsetMinutes: -720},
    ]);
    assert.equal(inferTimezoneFromCurrentTime("03:30", now, 720).length, 2);
});
