import {airportRunways, trainingMode} from "./airports";
import type {Aircraft, Airport, Exercise, Instruction, Point} from "./model";

export type ConflictKind = "uwc" | "ga" | "cancel-takeoff";
export const CONFLICT_LABELS: Record<ConflictKind, string> = {uwc: "UWC", ga: "GA", "cancel-takeoff": "Cancel Takeoff"};
export interface TrainingConflict {
  id: string; kind: ConflictKind; first: string; second: string; runway: string; otherRunway: string;
  phase: "setup" | "upwind" | "requested" | "active" | "complete" | "cancelled";
  started: number; circuit: number; linedUp?: boolean; takeoffCleared?: boolean; cancelledTakeoff?: boolean;
  goAround?: boolean; selfGoAround?: boolean; rollAt?: number; outcome?: string;
}
export interface ConflictMotion {upwind?: boolean; extendDownwind?: boolean; slowExit?: boolean; holdDeparture?: boolean; speedLimit?: number}
type Geometry = {threshold: Point; departure: Point; heading: number; vector: Point; clearance?: number};
export interface ConflictEngine {
  geometry(runway: string): Geometry;
  distance(a: Aircraft): number;
  instruct(a: Aircraft, command: Instruction): void;
  lineupError(a: Aircraft): string | undefined | null;
}
const live = (c: TrainingConflict) => c.phase !== "complete" && c.phase !== "cancelled";
export const conflictLabels = (conflicts: readonly TrainingConflict[] = [], id: string) =>
  [...new Set(conflicts.filter(c => live(c) && [c.first, c.second].includes(id)).map(c => CONFLICT_LABELS[c.kind]))].join(" + ");
const airborne = (a: Aircraft, airport: Airport) => a.altitude > airport.elevation + 1 && ["pattern", "heading", "takeoff", "go-around"].includes(a.mode);
const approachTraffic = (a: Aircraft, airport: Airport) => airborne(a, airport) && !a.radar && !a.leavingCircuit && ["pattern", "heading"].includes(a.mode);
export function startConflict(state: Exercise, airport: Airport, engine: ConflictEngine, id: string, kind: ConflictKind, first: string, second: string): string | undefined {
  if (trainingMode(state) !== "local") return "Paired conflicts require a Ground & Tower session.";
  const a = state.aircraft.find(a => a.id === first), b = state.aircraft.find(a => a.id === second);
  if (!a?.active || !b?.active || a === b) return "Select two different active aircraft.";
  if (!a.runway || !b.runway) return "Both aircraft need an assigned runway.";
  if (a.frequency !== "tower" || kind !== "cancel-takeoff" && b.frequency !== "tower") return "Both flying aircraft must be on Tower.";
  if (!approachTraffic(a, airport)) return "Select an airborne arrival in the circuit first.";
  if (kind === "uwc") {
    if (a.landing !== "touch-and-go" || b.landing !== "touch-and-go") return "UWC requires touch-and-go intentions for both aircraft.";
    if (!approachTraffic(b, airport)) return "UWC requires two airborne circuit aircraft.";
    const pairA = airportRunways(airport).find(p => p.ends.some(e => e.id === a.runway));
    const pairB = airportRunways(airport).find(p => p.ends.some(e => e.id === b.runway));
    const ga = engine.geometry(a.runway), gb = engine.geometry(b.runway);
    const angle = Math.abs((ga.heading - gb.heading + 540) % 360 - 180);
    if (a.runway === b.runway || pairA === pairB || angle > 5) return "UWC requires different parallel runways used in the same direction.";
  } else {
    if (a.runway !== b.runway) return "Both aircraft must use the same runway.";
    if (kind === "ga") {
      if (a.landing !== "full-stop") return "GA requires full-stop intentions for the first aircraft.";
      if (!approachTraffic(b, airport) || engine.distance(a) >= engine.distance(b)) return "Select the leading arrival first and the following arrival second.";
    } else {
      if (airborne(b, airport) || !["parked", "taxi"].includes(b.mode) || b.altitude > airport.elevation + 1) return "Select a ground aircraft waiting to depart as the second aircraft.";
      if (state.messages.some(m => m.aircraftId === b.id && m.request?.id === "departure" && (m.requestCircuit === undefined || m.requestCircuit === (b.circuit ?? 0)))) return "The ground aircraft has already requested departure.";
      const error = engine.lineupError(b); if (error) return `The ground aircraft cannot line up: ${error}`;
      if (a.leg === "final" && engine.distance(a) < 5) return "The arrival is already inside 5 NM. Choose an earlier arrival.";
    }
  }
  if ((state.conflicts ?? []).some(c => live(c) && c.kind === kind && [c.first, c.second].includes(first) && [c.first, c.second].includes(second))) return "This pair already has that conflict.";
  // Cross-kind exercises can overlap; one aircraft cannot have two competing
  // runway-change targets or departure triggers of the same kind.
  if ((state.conflicts ?? []).some(c => live(c) && [c.first, c.second].some(id => [first, second].includes(id)) && (c.kind === kind && (kind === "uwc" || kind === "cancel-takeoff")))) return "This aircraft already has an incompatible active conflict. Complete or cancel it first.";
  // Pair creation is a staff staging action. Align the partner once here;
  // ordinary ticks use continuous motion and never teleport traffic.
  if (kind === "uwc") {
    const ga = engine.geometry(a.runway), gb = engine.geometry(b.runway);
    const dx = a.position.x - ga.threshold.x, dy = a.position.y - ga.threshold.y;
    const along = dx * ga.vector.x + dy * ga.vector.y, lateral = dx * -ga.vector.y + dy * ga.vector.x;
    b.position = {x: gb.threshold.x + gb.vector.x * along - gb.vector.y * lateral, y: gb.threshold.y + gb.vector.y * along + gb.vector.x * lateral};
    b.heading = b.targetHeading = (a.heading - ga.heading + gb.heading + 360) % 360;
    b.altitude = a.altitude; b.speed = a.speed; b.targetSpeed = a.targetSpeed;
    b.leg = a.leg; b.hand = a.hand; b.patternFinalDistance = a.patternFinalDistance;
    engine.instruct(b, {type: "pattern", leg: a.leg, hand: a.hand});
  } else if (kind === "ga" && ["base", "final"].includes(b.leg)) {
    // A follower already on base/final cannot gain missing miles by extending
    // downwind. Stage it on final three track miles behind the leading arrival.
    const g = engine.geometry(a.runway), nm = engine.distance(a) + 3;
    b.position = {x: g.threshold.x - g.vector.x * nm, y: g.threshold.y - g.vector.y * nm};
    b.heading = b.targetHeading = g.heading; b.leg = "final";
    engine.instruct(b, {type: "pattern", leg: "final"});
  }
  state.conflicts = [...(state.conflicts ?? []).filter(c => live(c)).slice(-98), {id, kind, first, second, runway: a.runway, otherRunway: b.runway, phase: "setup", started: state.elapsed, circuit: a.circuit ?? 0}];
  if (kind === "cancel-takeoff") {delete b.automaticRequest; delete b.contactTowerAtHold;}
}
function finish(c: TrainingConflict, outcome: string, cancelled = false) {c.phase = cancelled ? "cancelled" : "complete"; c.outcome = outcome;}
/** Deleting traffic also cancels its pair while paused; no motion tick is needed. */
export function removeConflictAircraft(state: Exercise, id: string) {
  for (const c of state.conflicts ?? []) if (live(c) && [c.first, c.second].includes(id)) {
    finish(c, "Aircraft removed", true);
    for (const a of state.aircraft.filter(a => [c.first, c.second].includes(a.id))) {delete a.conflictMotion; delete a.conflictRequest;}
  }
}

export function conflictCommand(state: Exercise, aircraftId: string, command: Instruction, engine: ConflictEngine, applied: boolean) {
  for (const c of state.conflicts ?? []) {
    if (!live(c)) continue;
    const a = state.aircraft.find(a => a.id === c.first), b = state.aircraft.find(a => a.id === c.second);
    if (!a || !b) continue;
    if (c.kind === "uwc" && aircraftId === a.id && c.phase === "requested") {
      if (command.type === "radio" && command.message === "unable") {
        for (const plane of [a, b]) {plane.extended = false; delete plane.conflictMotion; engine.instruct(plane, {type: "pattern", leg: "crosswind"});}
        finish(c, "Runway change declined", true);
      } else if (applied && (command.type === "extend" && command.leg === "upwind" || command.type === "pattern")) {
        delete a.conflictMotion; delete b.conflictMotion;
        engine.instruct(b, {type: "pattern", leg: "crosswind"}); finish(c, "Runway change instruction received");
      }
    }
    if (c.kind === "cancel-takeoff" && aircraftId === b.id && applied) {
      if (command.type === "lineup" || command.type === "takeoff") c.linedUp = true;
      if (command.type === "takeoff") {c.takeoffCleared = true; c.rollAt ??= state.elapsed;}
      if (command.type === "atc" && command.action === "cancel-takeoff") {c.cancelledTakeoff = true; delete b.conflictMotion;}
    }
    if (aircraftId === a.id && command.type === "go-around") c.goAround = true;
  }
}

/** Called only by the authoritative fixed-step engine. Overrides expire with their pair. */
export function prepareConflicts(state: Exercise, airport: Airport, engine: ConflictEngine) {
  for (const a of state.aircraft) delete a.conflictMotion;
  for (const c of state.conflicts ?? []) {
    if (!live(c)) continue;
    const a = state.aircraft.find(a => a.id === c.first), b = state.aircraft.find(a => a.id === c.second);
    if (!a?.active || !b?.active || a.runway !== c.runway || b.runway !== c.otherRunway) {
      const crash = state.collisions?.some(event => event.elapsed >= c.started && event.aircraft.some(p => [c.first, c.second].includes(p.id)));
      finish(c, crash ? "Aircraft crash" : "Aircraft removed or runway changed", !crash); continue;
    }
    const motion = (p: Aircraft, patch: ConflictMotion) => {p.conflictMotion = {...p.conflictMotion, ...patch};};
    if (c.kind === "uwc") {
      if (c.phase === "setup") {
        // Delay the nearer aircraft on downwind, or moderate final speed, until abeam.
        const delta = engine.distance(a) - engine.distance(b);
        const nearer = delta < 0 ? a : b;
        if (Math.abs(delta) > .25) {
          if (nearer.leg === "downwind") motion(nearer, {extendDownwind: true});
          else if (["base", "final"].includes(nearer.leg)) motion(nearer, {speedLimit: Math.max(100, Math.min(a.speed, b.speed) - 25)});
        }
        if (a.mode === "takeoff") c.phase = "upwind";
      }
      if ((a.mode === "takeoff" || a.leg === "upwind") && c.phase !== "setup") motion(a, {upwind: true});
      if ((b.mode === "takeoff" || b.leg === "upwind") && c.phase !== "setup") motion(b, {upwind: true});
      if (c.phase === "upwind" && airborne(a, airport)) {
        c.phase = "requested";
        a.conflictRequest = {id: "runway-change", runway: c.otherRunway};
      }
    } else if (c.kind === "ga") {
      const gap = engine.distance(b) - engine.distance(a);
      if (b.leg === "downwind" && gap < 3) motion(b, {extendDownwind: true});
      else if (["base", "final"].includes(b.leg) && gap < 2.9 && airborne(a, airport)) motion(b, {speedLimit: Math.max(100, a.speed - 20)});
      if (a.mode === "rollout" || a.arrivalExit) {c.phase = "active"; motion(a, {slowExit: true});}
      const g = engine.geometry(c.runway), dx = a.position.x - g.threshold.x, dy = a.position.y - g.threshold.y;
      const offRunway = Math.abs(dx * g.vector.y - dy * g.vector.x) > (g.clearance ?? .06);
      if (c.phase === "active" && (offRunway || b.mode === "go-around" || b.leg === "upwind")) finish(c, b.mode === "go-around" ? "Following aircraft went around" : "Runway conflict ended");
    } else {
      delete b.automaticRequest; delete b.contactTowerAtHold;
      if (c.phase === "setup" && a.leg === "final" && engine.distance(a) <= 5.5) {
        c.phase = "requested"; b.frequency = "tower"; b.conflictRequest = {id: "departure", runway: c.runway, remainingInPattern: b.intentions?.flight === "pattern"};
      }
      if (!c.linedUp && (a.mode === "rollout" || a.mode === "takeoff" && a.altitude <= airport.elevation + 1 && (a.circuit ?? 0) > c.circuit)) {finish(c, "Arrival touched down without lineup permission", true); continue;}
      if (c.takeoffCleared && !c.cancelledTakeoff && state.elapsed < (c.rollAt ?? state.elapsed) + 75) motion(b, {holdDeparture: true});
      if (c.linedUp && a.leg === "final" && airborne(a, airport) && engine.distance(a) < .65 && !c.goAround) {
        engine.instruct(a, {type: "go-around"}); a.selfGoAroundPending = true; c.selfGoAround = true;
      }
      if ((c.goAround || c.selfGoAround) && c.cancelledTakeoff) finish(c, c.goAround ? "Go around and takeoff cancellation received" : "Self go-around; takeoff cancelled");
      else if ((c.goAround || c.selfGoAround) && a.altitude > airport.elevation + 700 && Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) > 1) finish(c, c.cancelledTakeoff ? "Conflict resolved" : c.takeoffCleared ? "Separation recovered; takeoff cancellation missed" : "Go-around; departure remained held");
    }
  }
}

/** Physical contact, including airborne traffic; safety alerts alone are not crashes. */
export function aircraftCollisionGroups(traffic: Aircraft[], elevation: number): Aircraft[][] {
  const groups: Aircraft[][] = [], active = traffic.filter(a => a.active);
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const a = active[i], b = active[j];
    const ground = Math.max(a.altitude, b.altitude) <= elevation + 50;
    if (a.speed + b.speed <= .01 || Math.abs(a.altitude - b.altitude) > (ground ? 50 : 40) || Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) > (ground ? .018 : .025)) continue;
    const touching = groups.filter(group => group.includes(a) || group.includes(b));
    const merged = [...new Set([a, b, ...touching.flat()])].sort((a, b) => a.id.localeCompare(b.id));
    for (const group of touching) groups.splice(groups.indexOf(group), 1);
    groups.push(merged);
  }
  return groups.sort((a, b) => a[0].id.localeCompare(b[0].id));
}
