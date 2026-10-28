import type {AdminMentee, ApiTimestamp} from "../types/AdminMentee.ts";

export interface AvailabilityRow {
    day: string;
    label: string;
    segments: {start: number; end: number}[];
}

// Keep older free-text answers visible instead of silently treating them as unavailable.
export function getMenteeAvailabilityRows(value?: string | null): AvailabilityRow[] {
    if (!value?.trim()) return [];
    return value.replace(/\r\n?/g, "\n").trim()
        .split(/\n+|(?=\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday):)/)
        .map(entry => {
            const separator = entry.indexOf(":");
            const day = separator < 0 ? "Availability" : entry.slice(0, separator).trim();
            const answer = separator < 0 ? entry.trim() : entry.slice(separator + 1).trim();
            // A day may list several comma-separated windows; any unreadable part keeps the whole answer as text.
            const ranges = answer.split(",").map(part => part.trim().match(/^([01]\d|2[0-3]):?([0-5]\d)\s*[-–]\s*([01]\d|2[0-3]):?([0-5]\d)$/));
            if (!answer || ranges.some(range => !range)) return {day, label: answer || "Not provided", segments: []};
            const windows = ranges.map(range => describeAvailabilityRange(range!));
            return {
                day,
                label: windows.map(window => window.label).join(", "),
                segments: windows.flatMap(window => window.segments),
            };
        });
}

function describeAvailabilityRange(range: RegExpMatchArray) {
    const start = Number(range[1]) * 60 + Number(range[2]);
    const end = Number(range[3]) * 60 + Number(range[4]);
    const overnight = end <= start;
    return {
        label: `${range[1]}:${range[2]} – ${range[3]}:${range[4]}${start === end ? " (24 hours)" : end === 0 ? " (to midnight)" : overnight ? " (next day)" : ""}`,
        segments: overnight
            ? [{start, end: 1440}, ...(end > 0 ? [{start: 0, end}] : [])]
            : [{start, end}],
    };
}

// Total weekly hours across every readable window, for the availability heading.
export function getWeeklyAvailabilityHours(rows: AvailabilityRow[]): number {
    const minutes = rows.reduce((total, row) => total + row.segments.reduce((sum, segment) => sum + segment.end - segment.start, 0), 0);
    return Math.round(minutes / 6) / 10;
}

export type MenteeTimelineStepState = "complete" | "current" | "upcoming" | "skipped" | "passed" | "terminated";

export interface MenteeTimelineStep {
    key: "waitlisted" | "picked_up" | "passed" | "terminated";
    label: string;
    time?: ApiTimestamp;
    state: MenteeTimelineStepState;
}

// Passed is the only planned outcome; a termination replaces it and may happen before any pickup.
export function getMenteeTimeline(mentee: AdminMentee): MenteeTimelineStep[] {
    const terminated = mentee.state === "terminated";
    const pickedUp = mentee.pickupTime != null || mentee.state === "picked_up" || mentee.state === "passed";
    return [
        {key: "waitlisted", label: "Waitlisted", time: mentee.waitlistTime, state: mentee.state === "waitlisted" ? "current" : "complete"},
        {
            key: "picked_up",
            label: "Picked up",
            time: mentee.pickupTime,
            state: mentee.state === "picked_up" ? "current" : pickedUp ? "complete" : terminated ? "skipped" : "upcoming",
        },
        terminated
            ? {key: "terminated", label: "Terminated", time: mentee.terminatedTime, state: "terminated"}
            : {key: "passed", label: "Passed", time: mentee.passedTime, state: mentee.state === "passed" ? "passed" : "upcoming"},
    ];
}
