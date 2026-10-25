import type {Exercise} from "./model";
import {trainingMode} from "./airports";
import {replayEvents, replaySnapshots} from "./replay-events";
import type {ReplayFrame} from "./replays";

export type MomentKind = "start" | "end" | "bookmark" | "separation" | "terrain" | "collision";
export interface ReplayMoment {id: string; kind: MomentKind; at: number; end?: number; label: string; detail: string; aircraftIds: string[]}

/**
 * Key moments for the replay viewer: bookmarks, collisions and, in radar modes, separation incidents.
 * Times are seconds from the start of the recording, matching the playback timeline.
 */
export function replayMoments(initial: Exercise, frames: ReplayFrame[], final: Exercise, duration: number): ReplayMoment[] {
  const start = initial.elapsed, within = (at: number) => at >= 0 && at <= duration;
  const callsign = (id: string) => final.aircraft.find(a => a.id === id)?.callsign ?? initial.aircraft.find(a => a.id === id)?.callsign;
  const moments: ReplayMoment[] = [];
  if (trainingMode(initial) === "local") {
    for (const mark of final.bookmarks ?? []) if (within(mark.elapsed - start))
      moments.push({id: `bookmark:${mark.id}`, kind: "bookmark", at: mark.elapsed - start, label: mark.label, detail: callsign(mark.aircraftId) ?? "Mentor bookmark", aircraftIds: [mark.aircraftId]});
  } else {
    for (const event of replayEvents(replaySnapshots(initial, frames), duration))
      moments.push({...event, kind: event.kind, label: event.kind === "separation" ? "Separation incident" : event.label, detail: event.kind === "separation" ? `${event.label} · ${event.detail}` : event.detail});
  }
  for (const collision of final.collisions ?? []) if (within(collision.elapsed - start))
    moments.push({id: `collision:${collision.id}`, kind: collision.kind === "terrain" ? "terrain" : "collision", at: collision.elapsed - start,
      label: collision.kind === "terrain" ? "Terrain impact" : "Collision", detail: collision.aircraft.map(a => a.callsign).join(" / "), aircraftIds: collision.aircraft.map(a => a.id)});
  moments.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return [
    {id: "start", kind: "start", at: 0, label: "Recording started", detail: `${initial.aircraft.length} aircraft`, aircraftIds: []},
    ...moments,
    {id: "end", kind: "end", at: duration, label: "Session ended", detail: "Saved to Replays", aircraftIds: []},
  ];
}

/** The marked moment after (or before) a time, skipping the start and end markers. */
export function adjacentMoment(moments: readonly ReplayMoment[], time: number, direction: 1 | -1) {
  const marked = moments.filter(m => m.kind !== "start" && m.kind !== "end");
  return direction > 0 ? marked.find(m => m.at > time + .5) : [...marked].reverse().find(m => m.at < time - .5);
}
/** The latest moment at or before a time, for highlighting the list while playing. */
export const currentMoment = (moments: readonly ReplayMoment[], time: number) => [...moments].reverse().find(m => m.at <= time + .25);
export const momentCounts = (moments: readonly ReplayMoment[]) => ({
  bookmarks: moments.filter(m => m.kind === "bookmark").length,
  incidents: moments.filter(m => m.kind === "separation" || m.kind === "terrain" || m.kind === "collision").length,
});
