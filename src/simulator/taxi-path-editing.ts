import {MAX_TAXI_POINTS} from "./model";
import type {Aircraft, Point, TaxiPoint} from "./model";

export type TaxiPathEdit = {kind: "insert" | "move"; index: number; point: Point};
export const taxiPathState = (a: Aircraft) => ({path: a.runwayExit ?? a.taxiPath, index: a.runwayExit ? 1 : a.taxiIndex});
export const taxiPathEditable = (a: Aircraft) => ["parked", "pushback", "taxi", "lineup"].includes(a.mode) || a.mode === "rollout" && !!a.runwayExit;
export function remainingTaxiPath(a: Aircraft): Point[] {
  const {path, index} = taxiPathState(a);
  return taxiPathEditable(a) && index < path.length ? [a.position, ...path.slice(index)] : [];
}
const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const reachedHold = (a: Aircraft, index: number) => !a.runwayExit && (a.holding || a.releasedHold === index) && index === a.taxiIndex && !!a.taxiPath[index]?.hold && gap(a.position, a.taxiPath[index]) < 1e-7;

/** Prefer existing waypoints over nearby segments, in screen-scaled hit tolerance. */
export function hitTaxiPath(a: Aircraft, point: Point, tolerance: number): TaxiPathEdit | undefined {
  if (!taxiPathEditable(a)) return;
  const {path, index} = taxiPathState(a);
  let nearest: TaxiPathEdit | undefined, best = tolerance;
  for (let i = index; i < path.length; i++) {
    const distance = gap(point, path[i]);
    if (distance <= best && !reachedHold(a, i)) {nearest = {kind: "move", index: i, point: {...path[i]}}; best = distance;}
  }
  if (nearest) return nearest;
  for (let i = index; i < path.length; i++) {
    const from = i === index ? a.position : path[i - 1], to = path[i], dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
    if (length < 1e-12 || reachedHold(a, i)) continue;
    const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length));
    const onSegment = {x: from.x + dx * t, y: from.y + dy * t}, distance = gap(point, onSegment);
    if (distance <= best) {nearest = {kind: "insert", index: i, point: onSegment}; best = distance;}
  }
  return nearest;
}

export function editedTaxiPath(path: TaxiPoint[], edit: TaxiPathEdit): TaxiPoint[] {
  const result = [...path];
  if (edit.kind === "insert") result.splice(edit.index, 0, {...edit.point});
  else result[edit.index] = {...result[edit.index], ...edit.point};
  return result;
}

/** Apply against the current route, without replacing progress from an old motion frame. */
export function applyTaxiPathEdit(a: Aircraft, expectedPath: TaxiPoint[], edit: TaxiPathEdit): string | undefined {
  const {path, index} = taxiPathState(a);
  if (!taxiPathEditable(a)) return "This aircraft is not following a taxi route.";
  if (path.length !== expectedPath.length || path.some((p, i) => p.x !== expectedPath[i].x || p.y !== expectedPath[i].y || !!p.hold !== !!expectedPath[i].hold || p.runway !== expectedPath[i].runway)) return "The taxi route changed while you were dragging. Try again on the current route.";
  if (!Number.isInteger(edit.index) || edit.index < index || edit.index >= path.length || reachedHold(a, edit.index)) return "This waypoint has already been reached. Edit the remaining taxi route.";
  if (![edit.point.x, edit.point.y].every(n => Number.isFinite(n) && Math.abs(n) <= 2000)) return "Place the waypoint within the exercise area.";
  if (edit.kind === "insert" && path.length >= MAX_TAXI_POINTS) return `A taxi route supports up to ${MAX_TAXI_POINTS} waypoints.`;
  const updated = editedTaxiPath(path, edit);
  if (a.runwayExit) a.runwayExit = updated;
  else {
    a.taxiPath = updated;
    if (edit.kind === "insert" && a.releasedHold !== null && a.releasedHold >= edit.index) a.releasedHold++;
  }
  return;
}
