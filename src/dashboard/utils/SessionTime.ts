import type {Session} from "../types/Session.ts";
import {formatAdminUtcDate, parseUtcDateTimeInput} from "./AdminDateUtils.ts";

export function formatSessionLocalTime(value: Session["time"]): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Invalid session time" : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium", timeStyle: "short",
    }).format(date) + " (local)";
}
export function sessionTimePreview(value: string): string {
    if (!value) return "Choose a local time to see its UTC equivalent.";
    try {const utc = parseUtcDateTimeInput(value); return `${formatSessionLocalTime(utc)} · ${formatAdminUtcDate(utc)}`;}
    catch { return "Enter a valid local time."; }
}
export function generateHalfHourLocalSuggestions(start: Date = new Date(), count = 96): string[] {
    const rounded = new Date(start);
    rounded.setSeconds(0, 0);
    rounded.setMinutes(Math.ceil(start.getMinutes() / 30 + (start.getSeconds() || start.getMilliseconds() ? .001 : 0)) * 30);
    const first = rounded.getTime();
    return Array.from({length: count}, (_, index) => {
        const date = new Date(first + index * 1_800_000);
        const pad = (value: number) => String(value).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    });
}
const escapeCalendarText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
const calendarDate = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function sessionCalendar(session: Session, names: {mentor: string; mentee: string}, now = new Date()): string {
    const start = new Date(session.time);
    // DTEND is deliberately omitted: the application does not record session duration.
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ATCMH//Training Sessions//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
        `UID:session-${session.id}@atcmh.org`, `DTSTAMP:${calendarDate(now)}`, `DTSTART:${calendarDate(start)}`,
        `SUMMARY:${escapeCalendarText(`ATCMH session #${session.id} · ${session.airport}`)}`,
        `LOCATION:${escapeCalendarText(session.airport)}`,
        `DESCRIPTION:${escapeCalendarText(`Mentor: ${names.mentor}\nMentee: ${names.mentee}\nRequested pilots: ${session.pilots}\n${formatAdminUtcDate(session.time)}`)}`,
        `STATUS:${session.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT", "END:VCALENDAR"];
    // iCalendar folds physical lines at 75 UTF-8 octets, including the continuation space.
    return lines.map(line => {
        const folded: string[] = []; let part = "", bytes = 0;
        for (const character of line) {
            const size = new TextEncoder().encode(character).length;
            if (bytes + size > 75) {folded.push(part); part = " "; bytes = 1;}
            part += character; bytes += size;
        }
        return [...folded, part].join("\r\n");
    }).join("\r\n") + "\r\n";
}
export function downloadSessionCalendar(session: Session, names: {mentor: string; mentee: string}) {
    const url = URL.createObjectURL(new Blob([sessionCalendar(session, names)], {type: "text/calendar;charset=utf-8"}));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `atcmh-session-${session.id}.ics`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
