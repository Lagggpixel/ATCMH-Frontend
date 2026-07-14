import test from "node:test";
import assert from "node:assert/strict";
import type {AdminMentee} from "../types/AdminMentee.ts";
import type {Session} from "../types/Session.ts";
import {
    markMenteeSessionHasAssignment,
    markSessionHasAssignment,
    removeAssignment,
    upsertAssignment,
    upsertMentee,
    upsertMenteeSession,
    upsertSession,
    upsertUserNote,
} from "./AdminStateUpdates.ts";

const session: Session = {
    id: 10,
    mentor: "100",
    mentee: "200",
    time: "2026-06-21T12:00:00Z",
    airport: "KLAX",
    pilots: 2,
    messageId: "0",
    cancelled: false,
    attendees: ["300"],
};

const mentee: AdminMentee = {
    id: 1,
    mentee: "200",
    channel: "900",
    state: "picked_up",
    waitlistTime: "2026-06-20T12:00:00Z",
    sessions: [session],
};

test("upserts records by id without dropping existing records", () => {
    assert.deepEqual(upsertUserNote([{id: 1, user: "10", staff: "20", note: "old", time: "x", active: true}], {
        id: 1,
        user: "10",
        staff: "20",
        note: "new",
        time: "x",
        active: true,
    }).map(note => note.note), ["new"]);

    assert.deepEqual(upsertAssignment([], {
        id: 2,
        ownerId: "10",
        airport: "KLAX",
        runways: "24R",
        patternAltitude: "1500",
        serverType: "Training",
        title: "Pattern",
        description: "",
        template: "{{groups}}",
        footer: "",
        active: true,
        groups: [],
    }).map(assignment => assignment.id), [2]);

    assert.deepEqual(upsertMentee([mentee], {...mentee, state: "passed"}).map(item => item.state), ["passed"]);
});

test("removes assignments by id", () => {
    assert.deepEqual(removeAssignment([
        {id: 1, ownerId: "10", airport: "A", runways: "", patternAltitude: "", serverType: "", title: "", description: "", template: "", footer: "", active: true, groups: []},
        {id: 2, ownerId: "10", airport: "B", runways: "", patternAltitude: "", serverType: "", title: "", description: "", template: "", footer: "", active: true, groups: []},
    ], 1).map(assignment => assignment.id), [2]);
});

test("upserts sessions in global and nested mentee state", () => {
    const updatedSession = {...session, attendees: ["300", "400"]};

    assert.deepEqual(upsertSession([session], updatedSession)[0].attendees, ["300", "400"]);
    assert.deepEqual(upsertMenteeSession([mentee], mentee.id, updatedSession)[0].sessions[0].attendees, ["300", "400"]);
});

test("marks assignment presence in global and nested sessions", () => {
    assert.equal(markSessionHasAssignment([session], session.id)[0].hasAssignment, true);
    assert.equal(markMenteeSessionHasAssignment([mentee], mentee.id, session.id)[0].sessions[0].hasAssignment, true);
});
