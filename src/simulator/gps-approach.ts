import {bankTurnLead} from "./banked-turns";
import type {Aircraft, Point, RadarApproach} from "./model";

type Final = {threshold: Point; vector: Point; heading: number};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const course = (a: Point, b: Point) => (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
const difference = (a: number, b: number) => Math.abs((a - b + 540) % 360 - 180);
const along = (p: Point, g: Final) => (p.x - g.threshold.x) * g.vector.x + (p.y - g.threshold.y) * g.vector.y;
const lateral = (p: Point, g: Final) => Math.abs((p.x - g.threshold.x) * -g.vector.y + (p.y - g.threshold.y) * g.vector.x);

/** The provider has no FAF flags. Explicit trainer markings take precedence;
 * otherwise use the last fix of a straight schematic final ending at this runway.
 * This fallback does not claim to identify a published procedure's actual FAF. */
export function gpsFinalApproachFix(a: Aircraft, p: RadarApproach, g: Final): number | undefined {
  const marked = a.flightPlan.flatMap((point, i) => point.finalApproachFix ? [i] : []);
  if (marked.length > 1) return;
  const runway = a.flightPlan.findIndex(point => distance(point, g.threshold) < .25);
  let index = marked[0];
  if (index === undefined) {
    if (runway < 1) return;
    index = runway - 1;
  }
  const fix = a.flightPlan[index];
  if (!fix || fix.hold || lateral(fix, g) > p.captureWidth || along(fix, g) > -1 || along(fix, g) < -p.finalDistance) return;
  if (index > 0 && difference(course(a.flightPlan[index - 1], fix), g.heading) > 10) return;
  // Reject a different runway, a reversal, or an unfinished non-final route.
  const end = runway >= index ? runway : a.flightPlan.length - 1;
  if (runway < index && index !== a.flightPlan.length - 1) return;
  for (let i = index + 1; i <= end; i++) {
    if (a.flightPlan[i].hold || lateral(a.flightPlan[i], g) > p.captureWidth || along(a.flightPlan[i], g) <= along(a.flightPlan[i - 1], g)) return;
  }
  return index;
}

export type GpsJoin = {fafIndex: number; joined: boolean; point: Point; index: number; vectorHeading?: number};

/** A gentle, forward rejoin with bank-turn room remaining before the FAF.
 * A drag/vector clearance must actually intercept the unflown route; a standalone
 * or altitude clearance may make a small automatic turn back onto it. */
export function gpsApproachJoin(a: Aircraft, p: RadarApproach, g: Final, vectorHeading?: number): {join?: GpsJoin; error?: string} {
  const fafIndex = gpsFinalApproachFix(a, p, g), r = a.radar!;
  if (fafIndex === undefined) return {error: "GPS approach requires a flight plan with a final approach fix and a final aligned with the assigned runway."};
  const faf = a.flightPlan[fafIndex];
  const pastFinalFix = along(a.position, g) >= along(faf, g) - 1e-8 && lateral(a.position, g) <= p.captureWidth && difference(a.heading, g.heading) <= 45;
  if (r.routeIndex > fafIndex || pastFinalFix) return {error: "GPS approach must be cleared before the final approach fix."};
  const lead = Math.max(.75, bankTurnLead(a.speed));
  // Preserve an already accepted heading-to-route intercept. The radar engine
  // completes that intercept before GPS starts following the filed legs.
  const filed = vectorHeading === undefined && r.navigation === "route" ? r.filedJoin : undefined;
  if (filed && filed.index >= 1 && filed.index <= fafIndex) {
    const from = a.flightPlan[filed.index - 1], to = a.flightPlan[filed.index];
    if (from && to && !to.hold) {
      const length = distance(from, to), courseHeading = course(from, to), angle = courseHeading * Math.PI / 180;
      const unit = {x: Math.sin(angle), y: Math.cos(angle)};
      const progress = (filed.point.x - from.x) * unit.x + (filed.point.y - from.y) * unit.y;
      if (length > .001 && progress >= 0 && progress < length - (filed.index === fafIndex ? lead : .15))
        return {join: {fafIndex, joined: false, index: filed.index, point: {...filed.point}}};
    }
    return {error: "Unable to complete the flight-plan intercept before the final approach fix."};
  }
  // A route already being flown to an earlier fix remains valid even when the
  // aircraft is outside the lateral tolerance used for a new vector rejoin.
  const active = a.flightPlan[r.routeIndex], previous = a.flightPlan[r.routeIndex - 1];
  if (vectorHeading === undefined && r.navigation === "route" && active && !active.hold && r.routeIndex < fafIndex
    && distance(a.position, active) > lead && difference(a.heading, course(a.position, active)) <= 30
    && (!previous || difference(course(a.position, active), course(previous, active)) <= 45))
    return {join: {fafIndex, joined: true, index: r.routeIndex, point: {...active}}};
  for (let index = r.routeIndex; index <= fafIndex; index++) {
    const to = a.flightPlan[index], next = a.flightPlan[index + 1] ?? g.threshold;
    const heading = index ? course(a.flightPlan[index - 1], to) : course(to, next);
    const radians = heading * Math.PI / 180, unit = {x: Math.sin(radians), y: Math.cos(radians)};
    const from = index ? a.flightPlan[index - 1] : {x: to.x - unit.x * 200, y: to.y - unit.y * 200};
    const length = distance(from, to);
    if (length < .001 || to.hold) continue;
    const progress = (a.position.x - from.x) * unit.x + (a.position.y - from.y) * unit.y;
    const cross = (a.position.x - from.x) * -unit.y + (a.position.y - from.y) * unit.x;
    const aligned = progress >= 0 && progress < length && Math.abs(cross) <= .15 && difference(a.heading, heading) <= 30
      && (vectorHeading === undefined || difference(vectorHeading, heading) <= 5);
    if (aligned) return {join: {fafIndex, joined: true, index, point: {...to}}};
    if (Math.abs(cross) > 2) continue;
    let target = Math.max(0, progress + Math.max(lead * 2, Math.abs(cross) * 1.5));
    if (vectorHeading !== undefined) {
      const angle = (vectorHeading - heading) * Math.PI / 180;
      if (difference(vectorHeading, heading) > 45 || Math.abs(Math.sin(angle)) < .001) continue;
      const travel = cross / Math.sin(angle);
      if (travel <= lead || travel > 15) continue;
      target = progress + travel * Math.cos(angle);
    }
    if (target < 0 || target > length - (index === fafIndex ? lead : .15)) continue;
    const point = {x: from.x + unit.x * target, y: from.y + unit.y * target};
    const bearing = course(a.position, point);
    if (difference(bearing, heading) > 45 || difference(a.heading, bearing) > 60 || distance(a.position, point) < lead) continue;
    return {join: {fafIndex, joined: false, index, point, vectorHeading}};
  }
  return {error: "Unable to rejoin the flight plan gently before the final approach fix. Continue as filed or vector onto an earlier leg."};
}

/** Returns false until the route has been flown through the FAF. */
export function flyGpsRoute(a: Aircraft, p: RadarApproach, g: Final): boolean {
  const r = a.radar!, join = r.gpsApproach!;
  const faf = a.flightPlan[join.fafIndex];
  if (!faf) return false;
  if (!join.joined) {
    const to = a.flightPlan[join.index], from = a.flightPlan[join.index - 1] ?? join.point;
    if (!to) return false;
    const heading = course(from, to), radians = heading * Math.PI / 180;
    const cross = (a.position.x - join.point.x) * -Math.cos(radians) + (a.position.y - join.point.y) * Math.sin(radians);
    if (Math.abs(cross) <= .15 && difference(a.heading, heading) <= 35) join.joined = true;
    else a.targetHeading = join.vectorHeading ?? course(a.position, join.point);
    if (!join.joined) return false;
  }
  let point = a.flightPlan[r.routeIndex];
  if (r.routeIndex < join.fafIndex && point && distance(a.position, point) <= Math.max(.15, bankTurnLead(a.speed) * .7)) point = a.flightPlan[++r.routeIndex];
  if (r.routeIndex === join.fafIndex && along(a.position, g) >= along(faf, g)
    && lateral(a.position, g) <= p.captureWidth && difference(a.heading, g.heading) <= 30) return true;
  if (point) a.targetHeading = course(a.position, point);
  return false;
}
