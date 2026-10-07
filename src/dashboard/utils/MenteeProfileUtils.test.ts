import test from "node:test";
import assert from "node:assert/strict";
import {getMenteeAvailabilityRows, getMenteeLifecycle} from "./MenteeProfileUtils.ts";
import type {AdminMentee} from "../types/AdminMentee.ts";

test("availability represents midnight, overnight and full-day windows without losing the original day", () => {
    const rows = getMenteeAvailabilityRows("Monday: 0700-1100\nTuesday: 0900-0000\nSunday: 2200-0200\nWednesday: 0900-0900");
    assert.deepEqual(rows[0], {day: "Monday", label: "07:00 – 11:00", segments: [{start: 420, end: 660}]});
    assert.deepEqual(rows[1], {day: "Tuesday", label: "09:00 – 00:00 (to midnight)", segments: [{start: 540, end: 1440}]});
    assert.deepEqual(rows[2], {day: "Sunday", label: "22:00 – 02:00 (next day)", segments: [{start: 1320, end: 1440}, {start: 0, end: 120}]});
    assert.match(rows[3].label, /24 hours/);
    assert.equal(rows[3].segments.reduce((total, segment) => total + segment.end - segment.start, 0), 1440);
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
test("lifecycle retains epoch timestamps and distinguishes missing dates from stages not yet reached", () => {
    const waitlisted = getMenteeLifecycle(record);
    assert.equal(waitlisted[0].time, 0);
    assert.equal(waitlisted[0].current, true);
    assert.equal(waitlisted[1].reached, false);
    const passed = getMenteeLifecycle({...record, state: "passed"});
    assert.equal(passed[1].reached, true);
    assert.equal(passed[1].time, undefined);
    assert.equal(passed[2].current, true);
    assert.equal(passed[3].reached, false);
    const terminated = getMenteeLifecycle({...record, state: "terminated", pickupTime: 100, terminatedTime: 200});
    assert.equal(terminated[1].reached, true);
    assert.equal(terminated[2].reached, false);
    assert.equal(terminated[3].current, true);
    assert.equal(terminated[3].time, 200);
});
