import test from "node:test";
import assert from "node:assert/strict";
import {getMenteeAvailabilityRows, getMenteeTimeline, getWeeklyAvailabilityHours} from "./MenteeProfileUtils.ts";
import type {AdminMentee} from "../types/AdminMentee.ts";

test("availability represents midnight, overnight and full-day windows without losing the original day", () => {
    const rows = getMenteeAvailabilityRows("Monday: 0700-1100\nTuesday: 0900-0000\nSunday: 2200-0200\nWednesday: 0900-0900");
    assert.deepEqual(rows[0], {day: "Monday", label: "07:00 – 11:00", segments: [{start: 420, end: 660}]});
    assert.deepEqual(rows[1], {day: "Tuesday", label: "09:00 – 00:00 (to midnight)", segments: [{start: 540, end: 1440}]});
    assert.deepEqual(rows[2], {day: "Sunday", label: "22:00 – 02:00 (next day)", segments: [{start: 1320, end: 1440}, {start: 0, end: 120}]});
    assert.match(rows[3].label, /24 hours/);
    assert.equal(rows[3].segments.reduce((total, segment) => total + segment.end - segment.start, 0), 1440);
});

test("a day with several comma-separated windows draws each one and totals the week", () => {
    const rows = getMenteeAvailabilityRows("Saturday: 1000-1300, 1900-0000\nSunday: 1200-1400, oops");
    assert.deepEqual(rows[0], {day: "Saturday", label: "10:00 – 13:00, 19:00 – 00:00 (to midnight)", segments: [{start: 600, end: 780}, {start: 1140, end: 1440}]});
    assert.deepEqual(rows[1], {day: "Sunday", label: "1200-1400, oops", segments: []});
    assert.equal(getWeeklyAvailabilityHours(rows), 8);
});

test("legacy and malformed availability stays readable rather than becoming a fabricated chart", () => {
    assert.deepEqual(getMenteeAvailabilityRows(undefined), []);
    assert.deepEqual(getMenteeAvailabilityRows(" \r\n "), []);
    const rows = getMenteeAvailabilityRows("Monday: Not available Tuesday: evenings only Wednesday: 2500-2600");
    assert.deepEqual(rows.map(row => row.label), ["Not available", "evenings only", "2500-2600"]);
    assert.ok(rows.every(row => row.segments.length === 0));
    assert.equal(getMenteeAvailabilityRows("Please contact me")[0].label, "Please contact me");
    assert.equal(getMenteeAvailabilityRows("Thursday: 17:00–22:00")[0].label, "17:00 – 22:00");
});

const record: AdminMentee = {id: 266, mentee: "ray", channel: "channel", state: "waitlisted", waitlistTime: 0, sessions: []};
test("timeline keeps epoch timestamps and always ends on Passed unless the mentee was terminated", () => {
    const waitlisted = getMenteeTimeline(record);
    assert.deepEqual(waitlisted.map(step => step.key), ["waitlisted", "picked_up", "passed"]);
    assert.equal(waitlisted[0].time, 0);
    assert.deepEqual(waitlisted.map(step => step.state), ["current", "upcoming", "upcoming"]);

    const pickedUp = getMenteeTimeline({...record, state: "picked_up", pickupTime: 100});
    assert.deepEqual(pickedUp.map(step => step.state), ["complete", "current", "upcoming"]);

    const passed = getMenteeTimeline({...record, state: "passed"});
    assert.deepEqual(passed.map(step => step.state), ["complete", "complete", "passed"]);
    assert.equal(passed[1].time, undefined);

    const terminated = getMenteeTimeline({...record, state: "terminated", pickupTime: 100, terminatedTime: 200});
    assert.deepEqual(terminated.map(step => step.key), ["waitlisted", "picked_up", "terminated"]);
    assert.deepEqual(terminated.map(step => step.state), ["complete", "complete", "terminated"]);
    assert.equal(terminated[2].time, 200);
});

test("a mentee terminated from the waitlist shows pickup as skipped", () => {
    const terminated = getMenteeTimeline({...record, state: "terminated", terminatedTime: 200});
    assert.deepEqual(terminated.map(step => step.state), ["complete", "skipped", "terminated"]);
});
