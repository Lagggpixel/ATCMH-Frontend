import type {StatisticsWindow} from "../dashboard/types/ProgrammeStatistics";
import {ManagementValidationError} from "./management-route";

export function parseStatisticsWindow(params: URLSearchParams, now = new Date()): StatisticsWindow {
    const utc = (value: string) => {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) throw new ManagementValidationError("Dates must be ISO timestamps in UTC (ending in Z)");
        const date = new Date(value);
        if (!Number.isFinite(date.getTime()) || date.getTime() < 0 || date.toISOString().slice(0, 19) !== value.slice(0, 19)) throw new ManagementValidationError("Invalid reporting date");
        return date;
    };
    const range = params.get("range");
    if (range !== null && range !== "all") throw new ManagementValidationError("Invalid range");
    const to = params.has("to") ? utc(params.get("to")!) : now;
    if (to > now) throw new ManagementValidationError("to must not be in the future");
    if (range === "all") {
        if (params.has("from")) throw new ManagementValidationError("All time cannot have a from boundary");
        return {from: null, to: to.toISOString(), previousFrom: null, asOf: now.toISOString()};
    }
    const from = params.has("from") ? utc(params.get("from")!) : new Date(to.getTime() - 30 * 86_400_000);
    if (from >= to) throw new ManagementValidationError("from must be before to");
    const previous = new Date(from.getTime() - (to.getTime() - from.getTime()));
    if (!Number.isFinite(previous.getTime())) throw new ManagementValidationError("Reporting range is too large");
    return {from: from.toISOString(), to: to.toISOString(), previousFrom: previous.toISOString(), asOf: now.toISOString()};
}
