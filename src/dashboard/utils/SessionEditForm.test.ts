import test from "node:test";
import assert from "node:assert/strict";
import {createSessionEditForm, toSessionUpdatePayload} from "./SessionEditForm.ts";
import type {Session} from "../types/Session.ts";

const session: Session = {
    id: 12,
    mentor: "100",
    mentee: "200",
    time: "2026-06-21T12:34:00Z",
    airport: "klax",
    pilots: 3,
    messageId: "123",
    cancelled: false,
    attendees: ["300"],
};

test("creates datetime-local session edit form values in local time", () => {
    const form = createSessionEditForm(session);
    // Session time is 2026-06-21T12:34:00Z. The form should express this
    // as local wall-clock time in YYYY-MM-DDTHH:mm format.
    const date = new Date(session.time);
    const expectedLocal = [
        date.getFullYear(),
        "-",
        String(date.getMonth() + 1).padStart(2, "0"),
        "-",
        String(date.getDate()).padStart(2, "0"),
        "T",
        String(date.getHours()).padStart(2, "0"),
        ":",
        String(date.getMinutes()).padStart(2, "0"),
    ].join("");
    assert.equal(form.airport, "KLAX");
    assert.equal(form.pilots, "3");
    assert.equal(form.time, expectedLocal);
});

test("converts session edit form values to API payload", () => {
    // "2026-06-21T13:00" is local wall-clock time from datetime-local input.
    // parseUtcDateTimeInput interprets it as local and converts to UTC ISO.
    const payload = toSessionUpdatePayload({
        airport: " kjfk ",
        pilots: "5",
        time: "2026-06-21T13:00",
    });
    assert.equal(payload.airport, "KJFK");
    assert.equal(payload.pilots, 5);
    // The resulting ISO string should represent 13:00 in local time.
    const date = new Date(payload.time);
    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 5);
    assert.equal(date.getDate(), 21);
    assert.equal(date.getHours(), 13);
    assert.equal(date.getMinutes(), 0);
});
