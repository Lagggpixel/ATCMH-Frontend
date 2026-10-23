import type {Aircraft, Exercise} from "./model";
import {getAirport} from "./airports";
import {radarApproachExempt, radarSeparationAlerts, separationLabel, terrainClearance} from "./radar-safety";
import {applyReplayDelta, type ReplayFrame} from "./replays";
import {rawTerrainElevation, terrainCoordinates} from "./terrain";

export type ReplayEventKind = "separation" | "terrain" | "bookmark";
export interface ReplayEvent {
  id: string; kind: ReplayEventKind; at: number; end?: number;
  label: string; detail: string; aircraftIds: string[];
}
export interface ReplaySnapshot {at: number; state: Exercise}
export const replayEventLabel = {separation: "Separation incident", terrain: "Terrain incident", bookmark: "Replay bookmark"};

/** Same-time commands form one visible state, just as they do when seeking. */
export function replaySnapshots(initial: Exercise, frames: ReplayFrame[]): ReplaySnapshot[] {
  const result: ReplaySnapshot[] = [];
  let state = initial, at = 0;
  for (const frame of frames) {
    if (frame.at !== at) {result.push({at, state}); at = frame.at;}
    state = applyReplayDelta(state, frame.delta);
  }
  result.push({at, state});
  return result;
}

function incidentEvents(snapshots: ReplaySnapshot[], incidents: (snapshot: ReplaySnapshot, index: number) => Map<string, Omit<ReplayEvent, "id" | "at" | "end">>): ReplayEvent[] {
  const events: ReplayEvent[] = [], active = new Map<string, ReplayEvent>();
  snapshots.forEach((snapshot, index) => {
    const current = incidents(snapshot, index);
    for (const [key, event] of active) if (!current.has(key)) {event.end = snapshot.at; active.delete(key);}
    for (const [key, incident] of current) {
      if (active.has(key)) continue;
      const event = {...incident, id: `${incident.kind}:${key}:${snapshot.at}`, at: snapshot.at};
      events.push(event); active.set(key, event);
    }
  });
  for (const event of active.values()) event.end = snapshots.at(-1)!.at;
  return events;
}

export function replayEvents(snapshots: ReplaySnapshot[], duration: number): ReplayEvent[] {
  if (!snapshots.length) return [];
  const events = incidentEvents(snapshots, ({state}) => {
    const current = new Map<string, Omit<ReplayEvent, "id" | "at" | "end">>();
    const aircraft = new Map(state.aircraft.map(a => [a.id, a]));
    for (const [id, alerts] of radarSeparationAlerts(state.aircraft, state.radarEnvironment)) for (const alert of alerts) {
      const ids = [id, alert.otherId].sort(), key = JSON.stringify(ids);
      if (!current.has(key)) current.set(key, {kind: "separation", label: ids.map(value => aircraft.get(value)!.callsign).join(" / "), detail: separationLabel(alert), aircraftIds: ids});
    }
    return current;
  });
  const bookmarks = new Map<string, ReplayEvent>();
  const start = snapshots[0].state.elapsed;
  for (const {state} of snapshots) for (const mark of state.bookmarks ?? []) {
    const at = mark.elapsed - start;
    if (at < 0 || at > duration || bookmarks.has(mark.id)) continue;
    bookmarks.set(mark.id, {id: `bookmark:${mark.id}`, kind: "bookmark", at, label: mark.label,
      detail: state.aircraft.find(a => a.id === mark.aircraftId)?.callsign ?? "Instructor bookmark", aircraftIds: [mark.aircraftId]});
  }
  return [...events, ...bookmarks.values()].filter(e => e.at <= duration).sort(compareReplayEvents);
}
export const compareReplayEvents = (a: ReplayEvent, b: ReplayEvent) => a.at - b.at || a.id.localeCompare(b.id);

export function groupReplayEvents(events: ReplayEvent[], duration: number, width: number): ReplayEvent[][] {
  const groups: ReplayEvent[][] = [];
  for (const event of events) {
    const previous = groups.at(-1);
    if (previous && (event.at - previous[0].at) / Math.max(1, duration) * width < 28) previous.push(event);
    else groups.push([event]);
  }
  return groups;
}

export interface TerrainReplayResult {events: ReplayEvent[]; failed: number; total: number}
type ElevationLookup = typeof rawTerrainElevation;
/** Reconstruct historical warnings from recorded positions; never treat failed lookups as sea level.
 * Reuse the live radar's 0.25nm / 15s sample envelope, with at most four requests in flight.
 */
export async function replayTerrainEvents(snapshots: ReplaySnapshot[], signal: AbortSignal,
  onProgress: (completed: number, total: number) => void, lookup: ElevationLookup = rawTerrainElevation): Promise<TerrainReplayResult> {
  const samples: {latitude: number; longitude: number; elevation?: number}[] = [];
  const cache = new Map<string, {index: number; at: number; aircraft: Aircraft; airport: string}>();
  const candidates = snapshots.map(({at, state}) => {
    const airport = getAirport(state);
    return state.aircraft.flatMap(aircraft => {
      if (!aircraft.active || !aircraft.radar || aircraft.radar.departure || aircraft.radar.arrival || radarApproachExempt(aircraft, state.radarEnvironment)) return [];
      let sample = cache.get(aircraft.id);
      if (!sample || sample.airport !== airport.icao || at - sample.at > 15 || Math.hypot(aircraft.position.x - sample.aircraft.position.x, aircraft.position.y - sample.aircraft.position.y) > .25) {
        sample = {index: samples.length, at, aircraft, airport: airport.icao};
        samples.push(terrainCoordinates(airport, aircraft.position)); cache.set(aircraft.id, sample);
      }
      return [{aircraft, sample: sample.index}];
    });
  });
  let next = 0, completed = 0, failed = 0, consecutiveFailures = 0, unavailable = false;
  onProgress(0, samples.length);
  const worker = async () => {
    while (next < samples.length && !unavailable) {
      signal.throwIfAborted();
      const sample = samples[next++];
      try {sample.elevation = await lookup(sample.latitude, sample.longitude, AbortSignal.any([signal, AbortSignal.timeout(5000)])); consecutiveFailures = 0;}
      catch {signal.throwIfAborted(); failed++; if (++consecutiveFailures >= 4) unavailable = true;}
      completed++;
      if (completed % 16 === 0 || completed === samples.length) onProgress(completed, samples.length);
    }
  };
  await Promise.all(Array.from({length: Math.min(4, samples.length)}, worker));
  signal.throwIfAborted();
  failed += samples.length - completed;
  const events = incidentEvents(snapshots, ({state}, index) => {
    const current = new Map<string, Omit<ReplayEvent, "id" | "at" | "end">>();
    for (const {aircraft, sample} of candidates[index]) {
      const agl = terrainClearance(aircraft, samples[sample].elevation, state.radarEnvironment);
      if (agl !== undefined) current.set(aircraft.id, {kind: "terrain", label: aircraft.callsign, detail: `${Math.floor(agl)}ft AGL`, aircraftIds: [aircraft.id]});
    }
    return current;
  });
  return {events, failed, total: samples.length};
}
