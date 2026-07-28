export const weeklyAvailabilityDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
] as const;

export interface WeeklyAvailabilityEntry {
    day: typeof weeklyAvailabilityDays[number];
    available: boolean;
    start: string;
    end: string;
}

const defaultStart = "09:00";
const defaultEnd = "17:00";
const canonicalTime = /^([01]\d|2[0-3])[0-5]\d$/;

export function defaultWeeklyAvailability(): WeeklyAvailabilityEntry[] {
    return weeklyAvailabilityDays.map(day => ({
        day,
        available: false,
        start: defaultStart,
        end: defaultEnd,
    }));
}

export function serializeWeeklyAvailability(entries: WeeklyAvailabilityEntry[]): string {
    return entries.map(entry => entry.available
        ? `${entry.day}: ${entry.start.replace(":", "")}-${entry.end.replace(":", "")}`
        : `${entry.day}: Not available`).join("\n");
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
            parsed.push({day, available: false, start: defaultStart, end: defaultEnd});
            continue;
        }

        const range = availability.match(/^(\d{4})\s*[-–]\s*(\d{4})$/);
        if (!range || !canonicalTime.test(range[1]) || !canonicalTime.test(range[2])) {
            return defaultWeeklyAvailability();
        }
        parsed.push({
            day,
            available: true,
            start: `${range[1].slice(0, 2)}:${range[1].slice(2)}`,
            end: `${range[2].slice(0, 2)}:${range[2].slice(2)}`,
        });
    }
    return parsed;
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
        const range = match[1].match(/^(\d{4})\s*[-–]\s*(\d{4})$/);
        return Boolean(range && canonicalTime.test(range[1]) && canonicalTime.test(range[2]));
    });
}
