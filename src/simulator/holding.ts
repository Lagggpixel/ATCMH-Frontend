import type {Aircraft, Point, RoutePoint} from "./model";
import {bankTurnRadius} from "./banked-turns";
import {holdingLegSeconds} from "./command-navigation";

/** Fly-over clearance limit: preserve the controller's level; never auto-descend into a stack. */
export function enterPublishedHold(a: Aircraft, fix: RoutePoint) {
  const hold = fix.hold;
  if (!hold || !a.radar) return;
  const target = a.radar.targetAltitude;
  a.atcManeuver = {kind: "hold", hand: hold.hand, remaining: 360, heading: a.heading,
    previousMode: "heading", previousLeg: a.leg,
    altitude: target ? target.unit === "feet" ? target.value : target.value * 100 : a.altitude,
    center: {x: fix.x, y: fix.y}, inbound: hold.inbound, phase: "entry", timer: 0,
    published: true, fixName: fix.name, maxSpeed: hold.maxSpeed, legSeconds: hold.legSeconds};
  a.radar.routeIndex = a.flightPlan.length;
  a.radar.navigation = "heading";
  a.targetSpeed = Math.min(a.targetSpeed, hold.maxSpeed ?? 265);
}

/** Racetrack anchored at the fix, on the assigned holding side. Coordinates are NM. */
export function holdingPattern(a: Aircraft): Point[] {
  const m = a.atcManeuver;
  if (!a.active || m?.kind !== "hold" || !m.center) return [];
  const speed = Math.max(80, Math.min(a.targetSpeed, m.maxSpeed ?? 265, m.altitude <= 6000 ? 200 : m.altitude <= 14000 ? 230 : 265));
  const radius = bankTurnRadius(speed), length = speed / 3600 * (m.legSeconds ?? holdingLegSeconds(m.altitude));
  const radians = (m.inbound ?? m.heading) * Math.PI / 180, sign = m.hand === "right" ? 1 : -1;
  const forward = {x: Math.sin(radians), y: Math.cos(radians)};
  const side = {x: Math.cos(radians) * sign, y: -Math.sin(radians) * sign};
  const point = (along: number, across: number) => ({x: m.center!.x + forward.x * along + side.x * across, y: m.center!.y + forward.y * along + side.y * across});
  const points: Point[] = [];
  for (let i = 0; i <= 24; i++) {const angle = i / 24 * Math.PI; points.push(point(radius * Math.sin(angle), radius * (1 - Math.cos(angle))));}
  for (let i = 0; i <= 24; i++) {const angle = i / 24 * Math.PI; points.push(point(-length - radius * Math.sin(angle), radius * (1 + Math.cos(angle))));}
  points.push(point(0, 0));
  return points;
}
