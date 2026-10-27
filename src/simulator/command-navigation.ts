import {climbRate, descentRate} from "./aircraft-performance";
import type {Aircraft, Airport, Point} from "./model";

export const courseTo = (from: Point, to: Point) => (Math.atan2(to.x - from.x, to.y - from.y) * 180 / Math.PI + 360) % 360;
export const courseDifference = (from: number, to: number) => (to - from + 540) % 360 - 180;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Resume the unflown route; a completed route remains completed. */
export function resumeRoute(a: Aircraft) {
  delete a.atcManeuver;
  if (!a.flightPlan.length && a.destination) {a.flightPlan = [{...a.destination.point}]; if (a.radar) a.radar.routeIndex = 0;}
  if (a.radar) {
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
