import {climbRate, descentRate, flightVelocity} from "./aircraft-performance";
import {bankTurnLead} from "./banked-turns";
import type {Aircraft, Airport, ExerciseWeather, Point} from "./model";

export const courseTo = (from: Point, to: Point) => (Math.atan2(to.x - from.x, to.y - from.y) * 180 / Math.PI + 360) % 360;
export const courseDifference = (from: number, to: number) => (to - from + 540) % 360 - 180;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Find the first forward intersection with an unflown leg, with room to turn.
 * Forty-five degrees is the simulator's maximum gentle route intercept. */
export function filedRouteJoin(a: Aircraft, weather?: ExerciseWeather): {join?: NonNullable<NonNullable<Aircraft["radar"]>["filedJoin"]>; error?: string} {
  const r = a.radar;
  if (!r) return {};
  if (r.navigation === "route" && r.filedJoin) return {};
  if (Math.abs(a.bankAngle ?? 0) > 5) return {error: "Unable to capture the flight plan while turning; establish a suitable heading first."};
  const velocity = weather ? flightVelocity(a, weather) : undefined;
  const track = velocity ? courseTo({x: 0, y: 0}, velocity) : a.track ?? a.heading;
  const speed = velocity ? Math.hypot(velocity.x, velocity.y) : a.groundSpeed ?? a.speed;
  const direction = track * Math.PI / 180;
  const ray = {x: Math.sin(direction), y: Math.cos(direction)};
  const lead = bankTurnLead(speed);
  for (let index = Math.max(1, r.routeIndex); index < a.flightPlan.length; index++) {
    const from = a.flightPlan[index - 1], to = a.flightPlan[index];
    const length = distance(from, to); if (length < .001 || from.hold) continue;
    const leg = {x: (to.x - from.x) / length, y: (to.y - from.y) / length};
    const heading = courseTo(from, to), angle = Math.abs(courseDifference(track, heading));
    const delta = {x: from.x - a.position.x, y: from.y - a.position.y};
    const progress = -delta.x * leg.x - delta.y * leg.y;
    const cross = -delta.x * -leg.y - delta.y * leg.x;
    if (Math.abs(cross) <= .08 && progress >= 0 && progress < length - lead && angle <= 10) {
      if (r.navigation === "route") return {};
      return {join: {index, point: {...a.position}, heading: a.heading, turning: true}};
    }
    if (angle < 1 || angle > 45) continue;
    const determinant = ray.x * leg.y - ray.y * leg.x;
    if (Math.abs(determinant) < 1e-6) continue;
    const travel = (delta.x * leg.y - delta.y * leg.x) / determinant;
    const along = (delta.x * ray.y - delta.y * ray.x) / determinant;
    const turnDistance = Math.max(.15, lead * Math.tan(angle * Math.PI / 360) + speed / 3600 * 4);
    // Reserve distance after the intersection for rollout and convergence,
    // so the selected waypoint is not already behind the aircraft at capture.
    if (travel <= turnDistance || along < 0 || along + turnDistance + Math.max(1, lead * 2) >= length) continue;
    return {join: {index, point: {x: a.position.x + ray.x * travel, y: a.position.y + ray.y * travel}, heading: a.heading, turning: false}};
  }
  return {error: "Unable to capture an unflown flight-plan leg on the current heading; provide a suitable vector or direct-to clearance."};
}

export function startFiledRoute(a: Aircraft, weather?: ExerciseWeather) {
  if (!a.radar) {resumeRoute(a); return;}
  const result = filedRouteJoin(a, weather), previous = a.radar.filedJoin;
  if (result.error) return;
  resumeRoute(a);
  a.radar.filedJoin = result.join ?? previous;
  if (result.join) {a.radar.routeIndex = result.join.index; a.targetHeading = result.join.heading;}
}

/** Resume the unflown route; a completed route remains completed. */
export function resumeRoute(a: Aircraft) {
  delete a.atcManeuver;
  if (!a.flightPlan.length && a.destination) {a.flightPlan = [{...a.destination.point}]; if (a.radar) a.radar.routeIndex = 0;}
  if (a.radar) {
    delete a.radar.filedJoin;
    a.mode = "heading"; if ("departure" in a.radar) delete a.radar.departure; if ("patternJoin" in a.radar) delete a.radar.patternJoin;
    a.radar.navigation = a.flightPlan[a.radar.routeIndex] ? "route" : "heading";
    delete a.radar.cleared; a.radar.captured = false; a.radar.localizer = false;
    delete a.radar.gpsApproach;
    if ("glideslope" in a.radar) a.radar.glideslope = false;
  } else if (a.flightPlan.length) {a.mode = "heading"; a.routeNavigation ??= {index: 0};}
}

/** Route constraints are instructor data, never invented published procedures. */
export function updateRouteConstraints(a: Aircraft) {
  if ((!a.starDescent && !a.followRouteAltitudes) || !a.radar || a.radar.navigation !== "route") return;
  const point = a.flightPlan[a.radar.routeIndex];
  if (!point) {delete a.starDescent; return;}
  if (point.altitude !== undefined) {
    delete a.radar.climbUntilAssigned;
    a.radar.targetAltitude = point.altitude >= 18000 ? {unit: "flight-level", value: point.altitude / 100} : {unit: "feet", value: point.altitude};
    a.radar.altitudeFromRoute = true;
    a.radar.altitudeAssignedFrom ??= a.altitude;
  }
  if (point.speed !== undefined) a.radar.routeSpeed = point.speed;
  if (a.radar.routeSpeed !== undefined && !a.radar.speed && a.speedMode !== "manual") a.targetSpeed = a.radar.routeSpeed;
}

export function moveOwnRoute(a: Aircraft) {
  const route = a.routeNavigation;
  if (!route || a.radar || a.mode !== "heading") return;
  let point = a.flightPlan[route.index];
  if (point && distance(a.position, point) < Math.max(.15, a.speed / 3600 * 3)) point = a.flightPlan[++route.index];
  if (point) a.targetHeading = courseTo(a.position, point);
}

export function airportVisible(a: Aircraft, airport: Airport, elevation = airport.elevation) {
  const target = a.destination?.point ?? {x: 0, y: 0};
  return a.active && a.altitude > elevation + 1 && Math.hypot(distance(a.position, target), (a.altitude - elevation) / 6076.12) <= 15 + 1e-8
    && Math.abs(courseDifference(a.heading, courseTo(a.position, target))) <= 90 + 1e-8;
}

export function assignDestination(a: Aircraft, target: {name: string; point: Point}, vectors: boolean) {
  a.destination = structuredClone(target);
  a.flightPlan = [{...target.point}];
  delete a.starDescent; delete a.atcManeuver;
  if (a.radar) {
    a.radar.routeIndex = 0; a.radar.navigation = vectors ? "heading" : "route";
    delete a.radar.filedJoin;
    delete a.radar.gpsApproach;
    delete a.radar.cleared; delete a.radar.expected; a.radar.captured = false; a.radar.localizer = false;
    if ("glideslope" in a.radar) a.radar.glideslope = false;
  } else {a.mode = "heading"; a.routeNavigation = {index: 0};}
  if (!vectors) a.targetHeading = courseTo(a.position, target.point);
}

export const holdingLegSeconds = (altitude: number) => altitude > 14000 ? 90 : 60;
export const moveAltitude = (a: Aircraft, target: number, dt: number) => {
  const rate = a.altitude > target ? descentRate(a) : climbRate(a);
  a.altitude += Math.sign(target - a.altitude) * Math.min(Math.abs(target - a.altitude), rate / 60 * dt);
};
