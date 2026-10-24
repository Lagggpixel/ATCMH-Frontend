import test from "node:test";
import assert from "node:assert/strict";
import type {AdminMentee} from "../types/AdminMentee.ts";
import type {Session} from "../types/Session.ts";
import {
    countHeldSessions,
    countMenteesByStatus,
    defaultMenteeSort,
    describeMenteeSince,
    formatDaysAgo,
    getLastSession,
    getNextSession,
    nextMenteeSort,
    normalizeMenteeStatusFilter,
    sortMentees,
} from "./MenteeListModel.ts";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 24, 12);
const session = (id: number, time: number, extra: Partial<Session> = {}): Session => ({
    id, mentor: "m", mentee: "x", time, airport: "EGLL", pilots: 4, cancelled: false, attendees: [], ...extra,
});
const mentee = (id: number, extra: Partial<AdminMentee>): AdminMentee => ({
    id, mentee: `user-${id}`, channel: "c", state: "waitlisted", waitlistTime: now - id * DAY, sessions: [], ...extra,
});

test("status filters accept only known states and count every record once", () => {
    assert.equal(normalizeMenteeStatusFilter("passed"), "passed");
    assert.equal(normalizeMenteeStatusFilter("nonsense"), undefined);
    assert.equal(normalizeMenteeStatusFilter(null), undefined);
    const counts = countMenteesByStatus([mentee(1, {}), mentee(2, {state: "passed"}), mentee(3, {state: "passed"})]);
    assert.deepEqual(counts, {all: 3, waitlisted: 1, picked_up: 0, passed: 2, terminated: 0});
});

test("next and last sessions ignore cancelled bookings and held counts skip sessions that did not run", () => {
    const record = mentee(1, {state: "picked_up", sessions: [
        session(1, now - 9 * DAY),
        session(2, now - 2 * DAY, {trainingOutcome: "NOT_HELD"}),
        session(3, now + DAY, {cancelled: true}),
        session(4, now + 2 * DAY),
    ]});
    assert.equal(getNextSession(record, now)?.id, 4);
    assert.equal(getLastSession(record, now)?.id, 2);
    assert.equal(countHeldSessions(record, now), 1);
});

test("since text describes how long a waitlisted mentee waited, otherwise when the state began", () => {
    assert.equal(describeMenteeSince(mentee(23, {}), now), "Waiting 23 days");
    assert.equal(describeMenteeSince(mentee(1, {waitlistTime: now}), now), "Waiting 0 days");
    assert.equal(describeMenteeSince(mentee(1, {state: "picked_up", pickupTime: Date.UTC(2026, 9, 2)}), now), "Since 2 Oct 2026");
    assert.equal(describeMenteeSince(mentee(1, {state: "terminated"}), now), "Date not recorded");
    assert.equal(formatDaysAgo(now - DAY, now), "Yesterday");
    assert.equal(formatDaysAgo(now - 9 * DAY, now), "9 days ago");
});

test("the waitlist sorts longest-waiting first by default and missing values always sort last", () => {
    const records = [mentee(3, {}), mentee(41, {}), mentee(6, {})];
    const context = {now, getName: (m: AdminMentee) => m.mentee, getMentorName: () => undefined};
    assert.deepEqual(sortMentees(records, defaultMenteeSort("waitlisted"), context).map(m => m.id), [41, 6, 3]);
    assert.equal(defaultMenteeSort("all"), undefined);
    assert.equal(sortMentees(records, undefined, context), records);

    const booked = [mentee(1, {}), mentee(2, {sessions: [session(9, now + 5 * DAY)]}), mentee(3, {sessions: [session(8, now + DAY)]})];
    assert.deepEqual(sortMentees(booked, {key: "next", direction: "asc"}, context).map(m => m.id), [3, 2, 1]);
    assert.deepEqual(sortMentees(booked, {key: "next", direction: "desc"}, context).map(m => m.id), [2, 3, 1]);
    assert.deepEqual(nextMenteeSort({key: "next", direction: "asc"}, "next"), {key: "next", direction: "desc"});
    assert.deepEqual(nextMenteeSort({key: "next", direction: "desc"}, "name"), {key: "name", direction: "asc"});
});
