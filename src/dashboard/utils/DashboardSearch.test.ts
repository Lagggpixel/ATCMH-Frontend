import assert from "node:assert/strict";
import test from "node:test";
import {searchDashboard} from "./DashboardSearch.ts";
import type {AdminMentee} from "../types/AdminMentee.ts";
import type {Session} from "../types/Session.ts";

const sections = [{label: "Mentees", path: "/dashboard/mentees"}, {label: "Sessions", path: "/dashboard/sessions"}];
const mentees: AdminMentee[] = [{id: 12, mentee: "200", channel: "channel", state: "picked_up", waitlistTime: 0, ifcName: "Jamie Forum", ifcId: "forum-42", sessions: []}];
const sessions: Session[] = [{id: 42, mentor: "100", mentee: "200", airport: "EGPH", time: "2026-10-13T14:30:00Z", pilots: 5, cancelled: false, attendees: []}];
const users = [{id: "100", username: "Alex", allTimeAttendance: 0, recentAttendance: 0}, {id: "200", username: "Jamie", allTimeAttendance: 0, recentAttendance: 0}];
test("search finds permitted sections, names, IDs, forum names and session context", () => {
    assert.equal(searchDashboard("", sections, mentees, sessions, users).length, 2);
    assert.equal(searchDashboard("forum-42", sections, mentees, sessions, users)[0].href, "/dashboard/mentees/12");
    assert.equal(searchDashboard("Jamie Forum", sections, mentees, sessions, users)[0].kind, "Mentee");
    assert.equal(searchDashboard("EGPH Alex", sections, mentees, sessions, users)[0].href, "/dashboard/sessions?session=42");
    assert.equal(searchDashboard("200", sections, mentees, sessions, users).length, 2);
    assert.equal(searchDashboard("unknown", sections, mentees, sessions, users).length, 0);
});
test("search never exposes records outside its permitted navigation and caps result counts", () => {
    assert.deepEqual(searchDashboard("Jamie", [{label: "Statistics", path: "/dashboard/stats"}], mentees, sessions, users), []);
    const many = Array.from({length: 100}, (_, index) => ({...mentees[0], id: index + 1}));
    assert.equal(searchDashboard("Jamie", sections, many, [], users).length, 30);
});
