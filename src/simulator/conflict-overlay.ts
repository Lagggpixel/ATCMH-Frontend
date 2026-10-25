import type {ConflictKind, TrainingConflict} from "./training-conflicts";
import type {Aircraft} from "./model";

export const CONFLICT_TITLES: Record<ConflictKind, {badge: string; title: string; join: string}> = {
  ga: {badge: "GA", title: "Go-around", join: "then"},
  uwc: {badge: "UWC", title: "Upwind change", join: "with"},
  "cancel-takeoff": {badge: "CTO", title: "Cancel takeoff", join: "vs"},
};
const STEPS: Record<ConflictKind, TrainingConflict["phase"][]> = {ga: ["setup", "active"], uwc: ["setup", "upwind", "requested"], "cancel-takeoff": ["setup", "requested"]};
/** How long a finished conflict stays on the scope, in exercise seconds. */
export const FINISHED_VISIBLE_SECONDS = 20;

const finished = (c: TrainingConflict) => c.phase === "complete" || c.phase === "cancelled";
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export const clock = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;

export interface ConflictCard {
  id: string; kind: ConflictKind; finished: boolean; cancelled: boolean; first: string; second: string; runway: string; age: string; outcome: string;
  steps: {label: string; reached: boolean; current: boolean}[];
}
/**
 * Live conflicts first, then conflicts that finished while this page watched,
 * for FINISHED_VISIBLE_SECONDS. finishedAt is the caller's record of when each
 * finish was first seen; conflicts already finished when the page opened are
 * recorded as -Infinity so they never reappear.
 */
export function conflictCards(conflicts: readonly TrainingConflict[] = [], aircraft: readonly Aircraft[], elapsed: number, finishedAt: Map<string, number>, dismissed: ReadonlySet<string>): ConflictCard[] {
  const callsign = (id: string) => aircraft.find(a => a.id === id)?.callsign ?? "—";
  const cards = conflicts.filter(c => !dismissed.has(c.id) && (!finished(c) || elapsed - (finishedAt.get(c.id) ?? elapsed) < FINISHED_VISIBLE_SECONDS)).map(c => {
    const steps = STEPS[c.kind], index = steps.indexOf(c.phase);
    return {
      id: c.id, kind: c.kind, finished: finished(c), cancelled: c.phase === "cancelled", first: callsign(c.first), second: callsign(c.second),
      runway: c.kind === "uwc" && c.otherRunway && c.otherRunway !== c.runway ? `${c.runway} → ${c.otherRunway}` : `RWY ${c.runway}`,
      age: clock(elapsed - c.started), outcome: c.outcome ?? capitalise(c.phase),
      steps: steps.map((phase, i) => ({label: capitalise(phase), reached: i <= index, current: i === index})),
    };
  });
  return [...cards.filter(c => !c.finished), ...cards.filter(c => c.finished)];
}
export function trackFinished(conflicts: readonly TrainingConflict[] = [], elapsed: number, finishedAt: Map<string, number>, initial: boolean) {
  for (const c of conflicts) if (finished(c) && !finishedAt.has(c.id)) finishedAt.set(c.id, initial ? -Infinity : elapsed);
}
