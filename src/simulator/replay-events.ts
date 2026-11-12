import type {Aircraft, Exercise} from "./model";
import {trainingMode,getAirport} from "./airports";
import {radarApproachExempt, radarSeparationAlerts, separationLabel, terrainClearance} from "./radar-safety";
import {applyReplayDelta, type ReplayFrame} from "./replays";
import {rawTerrainElevation, terrainCoordinates} from "./terrain";

export type ReplayEventKind = "separation" | "terrain" | "bookmark" | "demonstration" | "trainee" | "rewind" | "ai";
export interface ReplayEvent {
  id: string; kind: ReplayEventKind; at: number; end?: number;
  label: string; detail: string; aircraftIds: string[];
  /** A rewind: the exercise clock it jumped from and to, and where on the replay the stretch it undid began. */
  rewind?: {from: number; to: number; start: number};
}
export interface ReplaySnapshot {at: number; state: Exercise}
export const replayEventLabel = {separation: "Separation incident", terrain: "Terrain incident", bookmark: "Replay bookmark", demonstration: "Mentor demonstration", trainee: "Mentee command", rewind: "Mentor rewind", ai: "AI trainee"};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const length = (seconds: number) => {const whole = Math.max(0, Math.round(seconds)), minutes = Math.floor(whole / 60), rest = whole % 60; return minutes ? `${minutes} min${rest ? ` ${rest} s` : ""}` : `${rest} s`;};

/** Each trainer rewind, at the moment it happened, with the stretch of recording it went back over. */
export function rewindEvents(snapshots: ReplaySnapshot[]): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  let last = snapshots[0]?.state.rewind?.id;
  snapshots.forEach(({at, state}, index) => {
    const rewind = state.rewind;
    if (!rewind || rewind.id === last) return;
    last = rewind.id;
    // The undone stretch starts where the recording last stood at the exercise time the trainer went back to.
    let start = at;
    for (let i = index - 1; i >= 0 && snapshots[i].state.elapsed > rewind.to - 1e-6; i--) start = snapshots[i].at;
    events.push({id: `rewind:${rewind.id}`, kind: "rewind", at, label: `${clock(rewind.from)} ↺ ${clock(rewind.to)}`,
      detail: `Mentor rewound ${length(rewind.from - rewind.to)}, to ${clock(rewind.to)}`, aircraftIds: [], rewind: {from: rewind.from, to: rewind.to, start}});
  });
  return events;
}

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
    const mode = trainingMode(state);
    for (const [id, alerts] of (mode === "local" ? new Map<string, import("./radar-safety").SeparationAlert[]>() : radarSeparationAlerts(state.aircraft, state.radarEnvironment, "all", getAirport(state), mode))) for (const alert of alerts) {
      const ids = [id, alert.otherId].sort(), key = JSON.stringify(ids);
      if (!current.has(key)) current.set(key, {kind: "separation", label: ids.map(value => aircraft.get(value)!.callsign).join(" / "), detail: separationLabel(alert), aircraftIds: ids});
    }
    return current;
  });
  // A trainer demonstration spans from taking control until handing back.
  const demonstrations = incidentEvents(snapshots, ({state}) => new Map(state.demonstration
    ? [[String(state.demonstration.startedAt), {kind: "demonstration" as const, label: state.demonstration.by ?? "Staff", detail: "Controls taken", aircraftIds: []}]] : []));
  const bookmarks = new Map<string, ReplayEvent>();
  const start = snapshots[0].state.elapsed;
  for (const {state} of snapshots) for (const mark of state.bookmarks ?? []) {
    const at = mark.elapsed - start;
    if (at < 0 || at > duration || bookmarks.has(mark.id)) continue;
    bookmarks.set(mark.id, {id: `bookmark:${mark.id}`, kind: "bookmark", at, label: mark.label,
      detail: state.aircraft.find(a => a.id === mark.aircraftId)?.callsign ?? "Instructor bookmark", aircraftIds: [mark.aircraftId]});
  }
  return [...events, ...demonstrations, ...bookmarks.values(), ...rewindEvents(snapshots)].filter(e => e.at <= duration).sort(compareReplayEvents);
}
/** The trainee's sent commands as timeline events, from one position's recorded controls. */
export function traineeReplayEvents(marks: readonly {at: number; positionId: string; sent?: {callsign: string; text: string}}[], positionId: string, duration: number): ReplayEvent[] {
  return marks.filter(mark => mark.positionId === positionId && mark.sent && mark.at <= duration)
    .map((mark, i) => ({id: `trainee:${positionId}:${mark.at}:${i}`, kind: "trainee" as const, at: mark.at, label: mark.sent!.callsign, detail: mark.sent!.text, aircraftIds: []}));
}
/** Recorded events only: seeking never reruns a controller. */
export function aiReplayEvents(frames: readonly ReplayFrame[], duration: number): ReplayEvent[] {
  return frames.flatMap(frame => (frame.delta.ai ?? []).map((event, index) => ({
    id: `ai:${frame.sequence}:${index}`, kind: "ai" as const, at: frame.at,
    label: `AI ${event.kind}`, detail: event.reason?.detail ?? event.summary?.reason.detail ?? event.outcome ?? event.kind,
    aircraftIds: event.reason?.aircraftIds ?? event.summary?.reason.aircraftIds ?? [],
  }))).filter(event => event.at <= duration);
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
