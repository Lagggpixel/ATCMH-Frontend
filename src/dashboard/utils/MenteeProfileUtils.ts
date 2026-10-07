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
            const range = answer.match(/^([01]\d|2[0-3]):?([0-5]\d)\s*[-–]\s*([01]\d|2[0-3]):?([0-5]\d)$/);
            if (!range) return {day, label: answer || "Not provided", segments: []};
            const start = Number(range[1]) * 60 + Number(range[2]);
            const end = Number(range[3]) * 60 + Number(range[4]);
            const overnight = end <= start;
            return {
                day,
                label: `${range[1]}:${range[2]} – ${range[3]}:${range[4]}${start === end ? " (24 hours)" : end === 0 ? " (to midnight)" : overnight ? " (next day)" : ""}`,
                segments: overnight
                    ? [{start, end: 1440}, ...(end > 0 ? [{start: 0, end}] : [])]
                    : [{start, end}],
            };
        });
}

export function getMenteeLifecycle(mentee: AdminMentee) {
    const stages: {state: AdminMentee["state"]; label: string; time?: ApiTimestamp; reached: boolean}[] = [
        {state: "waitlisted", label: "Waitlisted", time: mentee.waitlistTime, reached: true},
        {state: "picked_up", label: "Picked up", time: mentee.pickupTime, reached: mentee.pickupTime != null || mentee.state === "picked_up" || mentee.state === "passed"},
        {state: "passed", label: "Passed", time: mentee.passedTime, reached: mentee.passedTime != null || mentee.state === "passed"},
        {state: "terminated", label: "Terminated", time: mentee.terminatedTime, reached: mentee.terminatedTime != null || mentee.state === "terminated"},
    ];
    return stages.map(stage => ({...stage, current: stage.state === mentee.state}));
}
