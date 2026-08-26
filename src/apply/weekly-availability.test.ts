import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
    defaultWeeklyAvailability,
    isCanonicalWeeklyAvailability,
    parseWeeklyAvailability,
    serializeWeeklyAvailability,
} from "./weekly-availability";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("structured availability serializes to the shared backend contract", () => {
    const entries = defaultWeeklyAvailability();
    entries[0] = {...entries[0], available: true, start: "09:30", end: "17:45"};
    entries[6] = {...entries[6], available: true, start: "00:00", end: "23:59"};

    const value = serializeWeeklyAvailability(entries);
    assert.equal(value, [
        "Monday: 0930-1745",
        "Tuesday: Not available",
        "Wednesday: Not available",
        "Thursday: Not available",
        "Friday: Not available",
        "Saturday: Not available",
        "Sunday: 0000-2359",
    ].join("\n"));
    assert.equal(isCanonicalWeeklyAvailability(value), true);
});

test("saved canonical drafts restore into editable controls", () => {
    const restored = parseWeeklyAvailability([
        "Monday: Not available",
        "Tuesday: 0830 – 1615",
        "Wednesday: Not available",
        "Thursday: Not available",
        "Friday: Not available",
        "Saturday: Not available",
        "Sunday: Not available",
    ].join("\r\n"));

    assert.deepEqual(restored[1], {day: "Tuesday", available: true, start: "08:30", end: "16:15"});
    assert.equal(restored[0].available, false);
    assert.equal(isCanonicalWeeklyAvailability(serializeWeeklyAvailability(restored)), true);
});

test("canonical validation rejects missing days and invalid UTC times", () => {
    assert.equal(isCanonicalWeeklyAvailability("Monday: Not available"), false);
    assert.equal(isCanonicalWeeklyAvailability([
        "Monday: 2400-2500",
        "Tuesday: Not available",
        "Wednesday: Not available",
        "Thursday: Not available",
        "Friday: Not available",
        "Saturday: Not available",
        "Sunday: Not available",
    ].join("\n")), false);
});

test("application and mentor matching share the same weekday availability editor", () => {
    const application = source("./ApplicationPage.tsx");
    const editor = source("./WeeklyAvailabilityEditor.tsx");

    assert.match(application, /import WeeklyAvailabilityEditor from "\.\/WeeklyAvailabilityEditor"/);
    assert.match(application, /<WeeklyAvailabilityEditor id=\{id} value=\{value} onChange=\{onChange}\/?>/);
    assert.match(editor, /entries\.map\(\(entry, index\) =>/);
    assert.match(editor, /type="checkbox" checked=\{entry\.available}/);
    assert.match(editor, /type="time" step=\{60}/);
    assert.match(editor, /onChange\(serializeWeeklyAvailability\(next\)\)/);
});
