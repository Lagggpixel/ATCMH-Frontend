export const applicationRegions = [
    "Africa", "Asia", "Europe", "Middle East", "North America", "South America", "Oceania", "Other",
] as const;

const regionAliases: Record<string, (typeof applicationRegions)[number]> = {
    africa: "Africa", af: "Africa",
    asia: "Asia", as: "Asia",
    europe: "Europe", eu: "Europe", eur: "Europe",
    "middle east": "Middle East", me: "Middle East",
    "north america": "North America", "n america": "North America", na: "North America",
    "south america": "South America", "s america": "South America", sa: "South America",
    oceania: "Oceania", australia: "Oceania", australasia: "Oceania", "new zealand": "Oceania", oc: "Oceania",
    other: "Other", "other / prefer not to say": "Other", "prefer not to say": "Other",
};

export function normalizeRegionAnswer(value: string): string | null {
    const key = value.trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
    return Object.hasOwn(regionAliases, key) ? regionAliases[key] : null;
}

export function formatUtcOffset(offsetMinutes: number): string | null {
    if (!Number.isInteger(offsetMinutes) || offsetMinutes < -720 || offsetMinutes > 840 || offsetMinutes % 15 !== 0) return null;
    const absolute = Math.abs(offsetMinutes);
    return `UTC${offsetMinutes < 0 ? "-" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function normalizeTimezoneAnswer(value: string): string | null {
    const text = value.trim().toUpperCase().replace(/\u2212/g, "-").replace(/\s+/g, "");
    if (["UTC", "GMT", "Z"].includes(text)) return "UTC+00:00";
    const match = /^(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(text);
    if (!match) return null;
    const hours = Number(match[2]);
    const minutes = Number(match[3] ?? "0");
    if (minutes > 59) return null;
    return formatUtcOffset((hours * 60 + minutes) * (match[1] === "-" ? -1 : 1));
}

const fractionalOffsets = [-570, -270, -210, -150, 210, 270, 330, 345, 390, 525, 570, 630, 690, 765, 825];

export const commonTimezoneOffsets = [...new Set([
    ...Array.from({length: 27}, (_, index) => (index - 12) * 60),
    ...fractionalOffsets,
])].sort((a, b) => a - b).map(offset => formatUtcOffset(offset)!);

export function parseCurrentClockTime(value: string): number | null {
    const text = value.trim().toLowerCase();
    const twelveHour = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(text);
    if (twelveHour) {
        const hours = Number(twelveHour[1]);
        const minutes = Number(twelveHour[2] ?? "0");
        if (hours < 1 || hours > 12 || minutes > 59) return null;
        return (hours % 12 + (twelveHour[3] === "pm" ? 12 : 0)) * 60 + minutes;
    }
    const twentyFourHour = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (!twentyFourHour) return null;
    const hours = Number(twentyFourHour[1]);
    const minutes = Number(twentyFourHour[2]);
    return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export interface InferredTimezone {
    value: string;
    offsetMinutes: number;
}

export function inferTimezoneFromCurrentTime(
    currentTime: string,
    now: Date,
    browserOffsetMinutes?: number | null,
): InferredTimezone[] {
    const localMinutes = parseCurrentClockTime(currentTime);
    if (localMinutes === null || Number.isNaN(now.getTime())) return [];
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
    const candidates = new Map<string, InferredTimezone>();
    for (const dayOffset of [-1440, 0, 1440]) {
        const difference = localMinutes - utcMinutes + dayOffset;
        const offsetMinutes = Math.round(difference / 15) * 15;
        const value = formatUtcOffset(offsetMinutes);
        if (value && Math.abs(difference - offsetMinutes) <= 8) candidates.set(value, {value, offsetMinutes});
    }
    return [...candidates.values()].sort((a, b) => {
        if (browserOffsetMinutes != null) {
            const preference = Math.abs(a.offsetMinutes - browserOffsetMinutes) - Math.abs(b.offsetMinutes - browserOffsetMinutes);
            if (preference) return preference;
        }
        return a.offsetMinutes - b.offsetMinutes;
    });
}
