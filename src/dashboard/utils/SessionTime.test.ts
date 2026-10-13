import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {sessionCalendar, sessionTimePreview} from "./SessionTime.ts";
import type {Session} from "../types/Session.ts";

const session: Session = {id: 42, mentor: "100", mentee: "200", airport: "EGPH", time: "2026-10-13T14:30:00Z", pilots: 5, cancelled: false, attendees: []};
test("calendar preserves the exact instant without inventing a session duration", () => {
    const calendar = sessionCalendar(session, {mentor: "Alex", mentee: "Jamie"}, new Date("2026-10-12T12:00:00Z"));
    assert.match(calendar, /DTSTART:20261013T143000Z\r\n/);
    assert.match(calendar, /UID:session-42@atcmh.org/);
    assert.match(calendar, /DTSTAMP:20261012T120000Z/);
    assert.match(calendar, /STATUS:CONFIRMED/);
    assert.equal(sessionCalendar({...session, time: new Date(session.time).getTime()}, {mentor: "Alex", mentee: "Jamie"}, new Date("2026-10-12T12:00:00Z")), calendar);
    assert.doesNotMatch(calendar, /DTEND|DURATION/);
    assert.ok(calendar.endsWith("END:VCALENDAR\r\n"));
    assert.match(sessionCalendar({...session, cancelled: true}, {mentor: "Alex", mentee: "Jamie"}), /STATUS:CANCELLED/);
});
test("calendar escapes user text and folds Unicode lines at the iCalendar byte limit", () => {
    const calendar = sessionCalendar(session, {mentor: "É".repeat(100) + ",;\\\nBEGIN:VEVENT", mentee: "Jamie"});
    for (const line of calendar.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
    const unfolded = calendar.replace(/\r\n /g, "");
    assert.match(unfolded, /\\,\\;\\\\\\nBEGIN:VEVENT/);
    assert.equal(unfolded.split("\r\nBEGIN:VEVENT").length, 2);
    assert.doesNotMatch(calendar, /�/);
});
test("session previews handle incomplete or invalid input", () => {
    assert.match(sessionTimePreview(""), /Choose a local time/);
    assert.match(sessionTimePreview("2026-02-30T12:00"), /valid local time/);
});
test("local input, suggestions and UTC previews handle multiple timezones and daylight saving", () => {
    const dateUtils = fileURLToPath(new URL("./AdminDateUtils.ts", import.meta.url));
    const sessionTime = fileURLToPath(new URL("./SessionTime.ts", import.meta.url));
    const run = (tz: string, input: string) => JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--eval", `
        const {parseUtcDateTimeInput} = require(${JSON.stringify(dateUtils)});
        const {generateHalfHourLocalSuggestions, sessionTimePreview} = require(${JSON.stringify(sessionTime)});
        let utc; try {utc = parseUtcDateTimeInput(${JSON.stringify(input)})} catch {utc = "invalid"}
        console.log(JSON.stringify({utc, preview: sessionTimePreview(${JSON.stringify(input)}), suggestions: generateHalfHourLocalSuggestions(new Date("2026-06-19T18:07:00Z"), 2)}));
    `], {env: {...process.env, TZ: tz}, encoding: "utf8"}));
    assert.equal(run("Europe/London", "2026-06-19T18:30").utc, "2026-06-19T17:30:00.000Z");
    assert.equal(run("Europe/London", "2026-01-19T18:30").utc, "2026-01-19T18:30:00.000Z");
    assert.equal(run("America/New_York", "2026-06-19T18:30").utc, "2026-06-19T22:30:00.000Z");
    const nepal = run("Asia/Kathmandu", "2026-06-19T18:30");
    assert.equal(nepal.utc, "2026-06-19T12:45:00.000Z");
    assert.deepEqual(nepal.suggestions, ["2026-06-20T00:00", "2026-06-20T00:30"]);
    assert.equal(run("Europe/London", "2026-03-29T01:30").utc, "invalid");
});
