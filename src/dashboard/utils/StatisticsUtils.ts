import type {StatisticsWindow} from "../types/ProgrammeStatistics";

export type StatisticsRange = "30" | "90" | "all" | "custom";
const DAY = 86_400_000;

export function statisticsQuery(range: StatisticsRange, now: Date, start = "", end = "") {
    if (range === "all") return new URLSearchParams({range: "all", to: now.toISOString()});
    let from = new Date(now.getTime() - Number(range) * DAY);
    let to = now;
    if (range === "custom") {
        const valid = (value: string) => {
            const date = new Date(`${value}T00:00:00Z`);
            return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
        };
        if (!valid(start) || !valid(end)) throw new Error("Choose valid start and end dates.");
        from = new Date(`${start}T00:00:00Z`);
        to = new Date(Math.min(new Date(`${end}T00:00:00Z`).getTime() + DAY, now.getTime()));
        if (from.getTime() < 0 || from >= to || end < start) throw new Error("Choose a range in the past with the end on or after the start.");
    }
    return new URLSearchParams({from: from.toISOString(), to: to.toISOString()});
}

export function comparisonText(value: number | null, previous: number | null | undefined, rate = false, unit = "") {
    if (value == null || previous == null) return "Comparison unavailable";
    const difference = value - previous;
    if (Math.abs(difference) < 0.05) return "No change vs previous period";
    return `${difference > 0 ? "+" : "−"}${Math.abs(difference).toLocaleString(undefined, {maximumFractionDigits: rate || unit ? 1 : 0})}${rate ? " pp" : unit} vs previous period`;
}

export function windowDescription(window: StatisticsWindow) {
    const format = (value: string) => new Intl.DateTimeFormat("en-GB", {timeZone: "UTC", dateStyle: "medium", timeStyle: "short"}).format(new Date(value));
    return `${window.from ? format(window.from) : "All recorded history"} → ${format(window.to)} UTC`;
}

export async function fetchStatistics<T>(url: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, {credentials: "include", cache: "no-store", signal});
    if (!response.ok) {
        if (response.status === 401) throw new Error("Sign in to view this reporting section.");
        if (response.status === 403) throw new Error("You do not have access to this reporting section.");
        throw new Error("This reporting section is temporarily unavailable. Try again.");
    }
    return response.json() as Promise<T>;
}
