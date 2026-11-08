import type {SeparationAlert} from "./radar-safety";

export type IncidentKind = "los" | "terr";
/** One separation pair or one aircraft below terrain clearance, as the scope sees it right now. */
export interface IncidentNow {key: string; kind: IncidentKind; ids: string[]; callsigns: string[]; lateral?: number; vertical?: number; agl?: number}
/** The same incident over time: when it started, the closest values reached, and when it cleared. */
export interface IncidentRecord extends IncidentNow {start: number; end?: number; minLateral?: number; minVertical?: number; minAgl?: number}
export interface IncidentLog {at: number; signature: string; records: ReadonlyMap<string, IncidentRecord>}

/** Seconds of exercise time a cleared incident stays in the panel. */
export const CLEARED_VISIBLE_SECONDS = 10;

export function currentIncidents(separation: ReadonlyMap<string, readonly SeparationAlert[]>, terrain: ReadonlyMap<string, number>, callsign: (id: string) => string): IncidentNow[] {
  const incidents: IncidentNow[] = [];
  const pairs = new Set<string>();
  for (const [id, alerts] of separation) for (const alert of alerts) {
    const ids = [id, alert.otherId].sort(), key = `los:${ids.join("/")}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    incidents.push({key, kind: "los", ids, callsigns: ids.map(callsign), lateral: alert.lateral, vertical: alert.vertical});
  }
  for (const [id, agl] of terrain) incidents.push({key: `terr:${id}`, kind: "terr", ids: [id], callsigns: [callsign(id)], agl});
  return incidents;
}

export const incidentSignature = (incidents: readonly IncidentNow[]) =>
  JSON.stringify(incidents.map(i => [i.key, i.callsigns, i.lateral, i.vertical, i.agl]));

const lower = (a: number | undefined, b: number | undefined) => a === undefined ? b : b === undefined ? a : Math.min(a, b);

/** Folds the current incidents into the log. Exercise time going backwards (reset, replay seek) starts afresh. */
export function trackIncidents(log: IncidentLog | undefined, current: readonly IncidentNow[], elapsed: number): IncidentLog {
  const previous = log && elapsed >= log.at ? log.records : new Map<string, IncidentRecord>();
  const records = new Map<string, IncidentRecord>();
  for (const incident of current) {
    const before = previous.get(incident.key);
    const open = before && before.end === undefined ? before : undefined;
    records.set(incident.key, {...incident, start: open?.start ?? elapsed,
      minLateral: lower(open?.minLateral, incident.lateral), minVertical: lower(open?.minVertical, incident.vertical), minAgl: lower(open?.minAgl, incident.agl)});
  }
  for (const [key, record] of previous) {
    if (records.has(key)) continue;
    const end = record.end ?? elapsed;
    if (elapsed - end < CLEARED_VISIBLE_SECONDS) records.set(key, {...record, end});
  }
  return {at: elapsed, signature: incidentSignature(current), records};
}

/** Live incidents first (oldest first), then cleared ones (most recent first). */
export const orderedIncidents = (log: IncidentLog) => [...log.records.values()].sort((a, b) =>
  (a.end === undefined ? 0 : 1) - (b.end === undefined ? 0 : 1) || (a.end === undefined ? a.start - b.start : (b.end ?? 0) - (a.end ?? 0)) || a.key.localeCompare(b.key));

export const incidentClock = (seconds: number) => {const whole = Math.max(0, Math.floor(seconds)); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;};
export const nm = (value: number) => `${Number(value.toFixed(1))}`;
export const feet = (value: number) => `${Math.round(value)}`;
/** Text for the alert line above a callsign tag, e.g. "DAL45 2.4NM 600FT". */
export const tagLineText = (other: string, alert: Pick<SeparationAlert, "lateral" | "vertical">) => `${other} ${nm(alert.lateral)}NM ${feet(alert.vertical)}FT`;
