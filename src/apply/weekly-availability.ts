export const weeklyAvailabilityDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
] as const;

// A day may list a few separate windows, for example "Saturday: 1000-1300, 1900-0000".
export const maxRangesPerDay = 3;

export interface WeeklyAvailabilityRange {
    start: string;
    end: string;
}

export interface WeeklyAvailabilityEntry {
    day: typeof weeklyAvailabilityDays[number];
    available: boolean;
    ranges: WeeklyAvailabilityRange[];
}

const defaultStart = "09:00";
const defaultEnd = "17:00";
const canonicalTime = /^([01]\d|2[0-3])[0-5]\d$/;
const rangePattern = /^(\d{4})\s*[-–]\s*(\d{4})$/;

const defaultRanges = (): WeeklyAvailabilityRange[] => [{start: defaultStart, end: defaultEnd}];

export function defaultWeeklyAvailability(): WeeklyAvailabilityEntry[] {
    return weeklyAvailabilityDays.map(day => ({
        day,
        available: false,
        ranges: defaultRanges(),
    }));
}

const toCanonicalTime = (value: string) => value.replace(":", "");
const fromCanonicalTime = (value: string) => `${value.slice(0, 2)}:${value.slice(2)}`;

export function serializeWeeklyAvailability(entries: WeeklyAvailabilityEntry[]): string {
    return entries.map(entry => entry.available && entry.ranges.length > 0
        ? `${entry.day}: ${entry.ranges.map(range => `${toCanonicalTime(range.start)}-${toCanonicalTime(range.end)}`).join(", ")}`
        : `${entry.day}: Not available`).join("\n");
}

// Undefined for anything other than one to three comma-separated HHMM-HHMM ranges.
function parseRanges(value: string): WeeklyAvailabilityRange[] | undefined {
    const parts = value.split(",").map(part => part.trim());
    if (parts.length > maxRangesPerDay) return undefined;
    const ranges: WeeklyAvailabilityRange[] = [];
    for (const part of parts) {
        const range = part.match(rangePattern);
        if (!range || !canonicalTime.test(range[1]) || !canonicalTime.test(range[2])) return undefined;
        ranges.push({start: fromCanonicalTime(range[1]), end: fromCanonicalTime(range[2])});
    }
    return ranges;
}

export function parseWeeklyAvailability(value: string): WeeklyAvailabilityEntry[] {
    if (!value.trim()) return defaultWeeklyAvailability();

    const lines = value.replace(/\r\n?/g, "\n").trim().split("\n");
    if (lines.length !== weeklyAvailabilityDays.length) return defaultWeeklyAvailability();

    const parsed: WeeklyAvailabilityEntry[] = [];
    for (const [index, day] of weeklyAvailabilityDays.entries()) {
        const prefix = `${day}: `;
        const line = lines[index].trim();
        if (!line.startsWith(prefix)) return defaultWeeklyAvailability();

        const availability = line.slice(prefix.length).trim();
        if (availability.toLowerCase() === "not available") {
            parsed.push({day, available: false, ranges: defaultRanges()});
            continue;
        }

        const ranges = parseRanges(availability);
        if (!ranges) return defaultWeeklyAvailability();
        parsed.push({day, available: true, ranges});
    }
    return parsed;
}

const formatMinutes = (total: number) => {
    const wrapped = ((total % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
};

// Suggests a two-hour window starting an hour after the day's last one.
export function nextAvailabilityRange(ranges: WeeklyAvailabilityRange[]): WeeklyAvailabilityRange {
    const last = ranges[ranges.length - 1];
    if (!last) return defaultRanges()[0];
    const [hours, minutes] = last.end.split(":").map(Number);
    const start = hours * 60 + minutes + 60;
    return {start: formatMinutes(start), end: formatMinutes(start + 120)};
}

export function defaultWeeklyAvailabilityAnswer(): string {
    return serializeWeeklyAvailability(defaultWeeklyAvailability());
}

export function isCanonicalWeeklyAvailability(value: string): boolean {
    const lines = value.replace(/\r\n?/g, "\n").trim().split("\n");
    if (lines.length !== weeklyAvailabilityDays.length) return false;

    return weeklyAvailabilityDays.every((day, index) => {
        const match = lines[index].trim().match(new RegExp(`^${day}: (.+)$`));
        if (!match) return false;
        if (match[1].toLowerCase() === "not available") return true;
        return parseRanges(match[1]) !== undefined;
    });
}
