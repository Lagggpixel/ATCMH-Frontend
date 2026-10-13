import type {TableSortState} from "../hooks/useTableSort.ts";

export const sessionSortColumns = ["time", "mentor", "mentee", "airport", "pilots", "cancelled"];
export interface SessionFilters {
    mentor: string;
    mentee: string;
    attendee: string;
    cancelled: "all" | "active" | "cancelled";
    period: "all" | "upcoming" | "past";
    mine: boolean;
    from: string;
    to: string;
}
export interface SessionPreferences {
    filter: SessionFilters;
    sort: TableSortState;
    pageSize: number;
}
export const defaultSessionFilters: SessionFilters = {
    mentor: "", mentee: "", attendee: "", cancelled: "all", period: "all", mine: false, from: "", to: "",
};
export const defaultSessionPreferences: SessionPreferences = {
    filter: defaultSessionFilters, sort: {column: "time", direction: "desc"}, pageSize: 25,
};
const dateOnly = (value: unknown): string => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? "" : value;
};
export function parseSessionPreferences(value: unknown): SessionPreferences {
    if (!value || typeof value !== "object") return defaultSessionPreferences;
    const {filter, sort, pageSize} = value as Partial<SessionPreferences>;
    return {
        filter: {
            mentor: typeof filter?.mentor === "string" ? filter.mentor.slice(0, 128) : "",
            mentee: typeof filter?.mentee === "string" ? filter.mentee.slice(0, 128) : "",
            attendee: typeof filter?.attendee === "string" ? filter.attendee.slice(0, 128) : "",
            cancelled: filter?.cancelled === "active" || filter?.cancelled === "cancelled" ? filter.cancelled : "all",
            period: filter?.period === "upcoming" || filter?.period === "past" ? filter.period : "all",
            mine: filter?.mine === true, from: dateOnly(filter?.from), to: dateOnly(filter?.to),
        },
        sort: {
            column: sort && sessionSortColumns.includes(sort.column) ? sort.column : "time",
            direction: sort?.direction === "asc" ? "asc" : "desc",
        },
        pageSize: [10, 25, 50, 100].includes(pageSize ?? 0) ? pageSize! : 25,
    };
}
