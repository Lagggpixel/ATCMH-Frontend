import type {Aircraft, Exercise} from "./model";

export interface ReplayParticipant {accountId: string; name?: string; role: "staff" | "mentee"}
export interface ReplaySummary {
  airport?: string; airportDataVersion?: string; trainingStation?: string;
  id: string; sessionId: string; title: string; ownerId: string; ownerName?: string;
  startedAt: number; endedAt: number; duration: number; status: string;
  participants: ReplayParticipant[]; kind: "recording" | "snapshot" | "unavailable"; partial: boolean; feedback?: string;
}
export const canPlayReplay = (replay: ReplaySummary) => replay.kind === "recording" && replay.duration > 0;
export const recordingLabel = (replay: ReplaySummary) => replay.kind === "recording"
  ? replay.duration <= 0 ? "No elapsed time" : replay.partial ? "Partial recording" : "Recorded session"
  : replay.kind === "snapshot" ? "Final snapshot" : "Summary only";

export interface ReplayDelta {
  state: Partial<Omit<Exercise, "aircraft">>;
  aircraft: {id: string; value?: Partial<Aircraft>; unset?: (keyof Aircraft)[]; remove?: true}[];
}
export interface ReplayFrame {sequence: number; at: number; delta: ReplayDelta; interpolate: boolean}
export interface ReplayDetail {replay: ReplaySummary; initial: Exercise | null; frames: ReplayFrame[]; next: number | null}

/** Drop transport deduplication IDs and redundant trails, never radio messages or aircraft state. */
export function replayState(exercise: Exercise): Exercise {
  return {...exercise, processed: [], aircraft: exercise.aircraft.map(a => ({...a, trail: []}))};
}
export function replayDelta(before: Exercise, after: Exercise): ReplayDelta {
  const state: ReplayDelta["state"] = {};
  for (const key of Object.keys(after) as (keyof Exercise)[]) {
    if (key !== "aircraft" && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      Object.assign(state, {[key]: after[key]});
  }
  const previous = new Map(before.aircraft.map(a => [a.id, a]));
  const aircraft: ReplayDelta["aircraft"] = after.aircraft.flatMap(a => {
    const old = previous.get(a.id); previous.delete(a.id);
    if (!old) return [{id: a.id, value: a}];
    const value: Partial<Aircraft> = {};
    for (const key of Object.keys(a) as (keyof Aircraft)[]) {
      if (JSON.stringify(old[key]) !== JSON.stringify(a[key])) Object.assign(value, {[key]: a[key]});
    }
    // An optional field disappearing must also be removed when applying the delta.
    const unset = (Object.keys(old) as (keyof Aircraft)[]).filter(key => !(key in a));
    return Object.keys(value).length || unset.length ? [{id: a.id, value, ...(unset.length ? {unset} : {})}] : [];
  });
  for (const id of previous.keys()) aircraft.push({id, remove: true});
  return {state, aircraft};
}
export function applyReplayDelta(before: Exercise, delta: ReplayDelta): Exercise {
  const aircraft = new Map(before.aircraft.map(a => [a.id, a]));
  for (const change of delta.aircraft) {
    if (change.remove) aircraft.delete(change.id);
    else {
      const value = {...aircraft.get(change.id), ...change.value} as Aircraft;
      for (const key of change.unset ?? []) delete value[key];
      aircraft.set(change.id, value);
    }
  }
  return {...before, ...delta.state, aircraft: [...aircraft.values()]};
}
/** Checkpoints bound seek work without copying every complete frame into memory. */
export class ReplayTimeline {
  private checkpoints = new Map<number, Exercise>();
  constructor(readonly initial: Exercise, readonly frames: ReplayFrame[]) {
    let state = initial; this.checkpoints.set(-1, state);
    frames.forEach((frame, i) => {state = applyReplayDelta(state, frame.delta); if (i % 60 === 59) this.checkpoints.set(i, state);});
  }
  at(time: number): Exercise {
    let low = 0, high = this.frames.length;
    while (low < high) {const mid = (low + high) >>> 1; if (this.frames[mid].at <= time) low = mid + 1; else high = mid;}
    const index = low - 1, checkpoint = Math.floor((index + 1) / 60) * 60 - 1;
    let state = this.checkpoints.get(checkpoint)!;
    for (let i = checkpoint + 1; i <= index; i++) state = applyReplayDelta(state, this.frames[i].delta);
    const next = this.frames[index + 1], start = this.frames[index]?.at ?? 0;
    if (!next?.interpolate || next.at <= start || next.at - start > 2) return state;
    const target = applyReplayDelta(state, next.delta), fraction = Math.max(0, Math.min(1, (time - start) / (next.at - start)));
    const targets = new Map(target.aircraft.map(a => [a.id, a]));
    return {...state, aircraft: state.aircraft.map(a => {
      const b = targets.get(a.id); if (!b) return a;
      return {...a, position: {x: a.position.x + (b.position.x - a.position.x) * fraction, y: a.position.y + (b.position.y - a.position.y) * fraction},
        heading: (a.heading + ((b.heading - a.heading + 540) % 360 - 180) * fraction + 360) % 360,
        ...(a.bankAngle !== undefined || b.bankAngle !== undefined ? {bankAngle: (a.bankAngle ?? 0) + ((b.bankAngle ?? 0) - (a.bankAngle ?? 0)) * fraction} : {}),
        altitude: a.altitude + (b.altitude - a.altitude) * fraction, speed: a.speed + (b.speed - a.speed) * fraction};
    })};
  }
}
