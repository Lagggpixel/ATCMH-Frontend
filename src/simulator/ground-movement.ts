import {DEFAULTS, type Aircraft, type Airport, type Point, type TaxiPoint} from "./model";

const radians = Math.PI / 180;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const heading = (a: Point, b: Point) => (Math.atan2(b.x - a.x, b.y - a.y) / radians + 360) % 360;
const angleTo = (from: number, to: number) => (to - from + 540) % 360 - 180;
const approach = (value: number, target: number, rate: number) => value + Math.sign(target - value) * Math.min(Math.abs(target - value), rate);
const interpolate = (a: Point, b: Point, t: number): Point => ({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t});
export const GROUND = {spacing: .045, corridor: .018, collisionDistance: .018, turnRate: 20, pushbackSpeed: 3}; // NM, degrees/sec, knots.

const approvedPushConflict = (a: Aircraft, b: Aircraft) => (a.mode === "pushback" || b.mode === "pushback")
  && a.giveWay?.aircraftId !== b.id && b.giveWay?.aircraftId !== a.id;

/** Approved pushbacks are the controller's responsibility. Detect actual contact,
 * not merely intersecting planned routes, independently of the tuned frequency. */
export function groundCollisionGroups(traffic: Aircraft[], elevation: number): Aircraft[][] {
  const ground = traffic.filter(a => onGround(a, elevation) && a.altitude <= elevation + 50);
  const groups: Aircraft[][] = [];
  for (let i = 0; i < ground.length; i++) for (let j = i + 1; j < ground.length; j++) {
    const a = ground[i], b = ground[j];
    if (a.speed + b.speed <= .01 || distance(a.position, b.position) > GROUND.collisionDistance) continue;
    const touching = groups.filter(group => group.includes(a) || group.includes(b));
    const merged = [...new Set([a, b, ...touching.flat()])].sort((a, b) => a.id.localeCompare(b.id));
    for (const group of touching) groups.splice(groups.indexOf(group), 1);
    groups.push(merged);
  }
  return groups.sort((a, b) => a[0].id.localeCompare(b[0].id));
}

/** Join the mapped taxiway behind the nose, then turn the tail along its centerline.
 * A cardinal tail instruction chooses direction on that taxiway, never a random endpoint. */
export function planPushback(airport: Airport, a: Aircraft, tail: "north" | "east" | "south" | "west"): {path?: Point[]; error?: string} {
  const rear = {x: -Math.sin(a.heading * radians), y: -Math.cos(a.heading * radians)};
  const cardinal = {north: {x: 0, y: 1}, east: {x: 1, y: 0}, south: {x: 0, y: -1}, west: {x: -1, y: 0}}[tail];
  let best: {join: Point; end: Point; score: number} | undefined;
  for (const feature of airport.features.filter(f => f.kind === "taxiway" || f.kind === "taxilane")) for (let i = 1; i < feature.points.length; i++) {
    const from = feature.points[i - 1], to = feature.points[i], dx = to.x - from.x, dy = to.y - from.y, length = distance(from, to);
    if (length < 1e-7) continue;
    const denominator = rear.x * dy - rear.y * dx;
    const offset = {x: from.x - a.position.x, y: from.y - a.position.y};
    // Prefer the actual rearward ray intersection; projection handles oblique stands.
    const rayT = Math.abs(denominator) > 1e-10 ? (offset.x * rear.y - offset.y * rear.x) / denominator : -1;
    const projection = ((a.position.x - from.x) * dx + (a.position.y - from.y) * dy) / length ** 2;
    const t = rayT >= 0 && rayT <= 1 ? rayT : Math.max(0, Math.min(1, projection));
    const join = interpolate(from, to, t), delta = {x: join.x - a.position.x, y: join.y - a.position.y};
    const behind = delta.x * rear.x + delta.y * rear.y, lateral = Math.abs(delta.x * rear.y - delta.y * rear.x);
    if (behind < .004 || distance(a.position, join) > .2 || lateral > .025) continue;
    const direction = dx * cardinal.x + dy * cardinal.y >= 0 ? 1 : -1;
    const endT = Math.max(0, Math.min(1, t + direction * .015 / length));
    const end = interpolate(from, to, endT);
    if (distance(join, end) < .002) continue;
    const score = distance(a.position, join) + lateral * 3;
    if (!best || score < best.score) best = {join, end, score};
  }
  return best ? {path: [best.join, best.end]} : {error: "No mapped taxiway behind this aircraft. Check its stand position and nose direction before assigning pushback."};
}

const onGround = (a: Aircraft, elevation: number) => a.active && a.altitude < elevation + 1000 && ["parked", "pushback", "taxi", "lineup", "rollout", "takeoff"].includes(a.mode);
const remainingPath = (a: Aircraft) => [a.position, ...(a.mode === "pushback" ? a.pushback?.path.slice(a.pushback.index) ?? [] : a.taxiPath.slice(a.taxiIndex))];
function followsRoute(a: Aircraft, b: Aircraft) {
  const path = remainingPath(a), leader = remainingPath(b), next = leader.find(p => distance(p, b.position) > 1e-7);
  if (!next) return false;
  const bx = next.x - b.position.x, by = next.y - b.position.y, size = Math.hypot(bx, by);
  let along = 0;
  for (let i = 1; i < path.length && along < .2; i++) {
    const from = path[i - 1], end = path[i], dx = end.x - from.x, dy = end.y - from.y, length = Math.hypot(dx, dy);
    if (length < 1e-8) continue;
    const ox = b.position.x - from.x, oy = b.position.y - from.y, projection = (ox * dx + oy * dy) / length;
    if (projection >= 0 && projection <= length && along + projection > 1e-7 && Math.abs(ox * dy - oy * dx) / length < GROUND.corridor && (dx * bx + dy * by) / length / size > .7) return true;
    along += length;
  }
  return false;
}
/** Upcoming crossing/merge, excluding collinear following and head-on traffic. */
export function groundConflict(a: Aircraft, b: Aircraft): {own: number; other: number; point: Point} | undefined {
  if (followsRoute(a, b) || followsRoute(b, a)) return;
  const first = remainingPath(a), second = remainingPath(b);
  let own = 0;
  for (let i = 1; i < first.length && own < .2; i++) {
    const p = first[i - 1], r = {x: first[i].x - p.x, y: first[i].y - p.y}, length = Math.hypot(r.x, r.y);
    let other = 0;
    for (let j = 1; j < second.length && other < .2; j++) {
      const q = second[j - 1], s = {x: second[j].x - q.x, y: second[j].y - q.y}, size = Math.hypot(s.x, s.y);
      const denominator = r.x * s.y - r.y * s.x;
      if (Math.abs(denominator) > 1e-10) {
        const dx = q.x - p.x, dy = q.y - p.y;
        const t = (dx * s.y - dy * s.x) / denominator, u = (dx * r.y - dy * r.x) / denominator;
        if (t >= -1e-7 && t <= 1 + 1e-7 && u >= -1e-7 && u <= 1 + 1e-7) return {own: own + Math.max(0, t) * length, other: other + Math.max(0, u) * size, point: interpolate(p, first[i], Math.max(0, t))};
      }
      other += size;
    }
    own += length;
  }
}
/** Reserve a junction until the winner has passed it. Braking/turn speeds cannot
 * swap priority each frame. Predictions reserve on their own copies only. */
export function resolveGroundPriorities(traffic: Aircraft[], elevation = 0) {
  for (const a of traffic) if (a.groundYield) {
    const other = traffic.find(b => b.id === a.groundYield!.aircraftId);
    if (!other || !onGround(other, elevation) || !groundConflict(a, other) && distance(other.position, a.groundYield.point) > GROUND.spacing) delete a.groundYield;
  }
  const sorted = [...traffic].filter(a => onGround(a, elevation) && !a.holding && ["taxi", "pushback", "lineup"].includes(a.mode)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const a = sorted[i], b = sorted[j], conflict = groundConflict(a, b);
    if (approvedPushConflict(a, b)) continue;
    if (!conflict) continue;
    const aWins = b.giveWay?.aircraftId === a.id || a.giveWay?.aircraftId !== b.id && (b.groundYield?.aircraftId === a.id || a.groundYield?.aircraftId !== b.id && conflict.own <= conflict.other);
    const loser = aWins ? b : a, winner = aWins ? a : b;
    if (!loser.groundYield || loser.groundYield.aircraftId === winner.id || loser.giveWay?.aircraftId === winner.id) loser.groundYield = {aircraftId: winner.id, point: conflict.point};
  }
}
export interface GroundGuidance {speedLimit: number; travelLimit: number}
/** Distance along the upcoming route, rather than heading alone, also sees traffic
 * around a bend. No radio frequency or roster ordering affects the spacing. */
export function groundGuidance(a: Aircraft, traffic: Aircraft[], elevation = 0): GroundGuidance {
  let speedLimit = Infinity, travelLimit = Infinity;
  if (!a.active || !["pushback", "taxi", "lineup"].includes(a.mode)) return {speedLimit, travelLimit};
  if (a.followGroundId) {
    const leader = traffic.find(b => b.id === a.followGroundId && b.active);
    if (!leader) delete a.followGroundId;
    else {const gap = distance(a.position, leader.position); speedLimit = Math.min(speedLimit, Math.max(0, leader.speed + (gap - GROUND.spacing * 2) * 200));}
  }
  const path = a.mode === "pushback" ? a.pushback?.path.slice(a.pushback.index) ?? [] : a.taxiPath.slice(a.taxiIndex);
  for (const other of traffic) {
    if (other.id === a.id || !onGround(other, elevation) || Math.abs(other.altitude - a.altitude) > 50) continue;
    if (approvedPushConflict(a, other)) continue;
    const conflict = !other.holding && ["taxi", "pushback", "lineup"].includes(other.mode) ? groundConflict(a, other) : undefined;
    const yielding = a.giveWay?.aircraftId === other.id;
    if (yielding || conflict) {
      const priority = other.giveWay?.aircraftId === a.id || !yielding && !!conflict && (other.groundYield?.aircraftId === a.id || a.groundYield?.aircraftId !== other.id && (conflict.own < conflict.other - 1e-7 || Math.abs(conflict.own - conflict.other) < 1e-7 && a.id < other.id));
      if (!priority) {
        const room = Math.max(0, (conflict?.own ?? distance(a.position, other.position)) - GROUND.spacing);
        travelLimit = Math.min(travelLimit, room);
        speedLimit = Math.min(speedLimit, Math.sqrt(2 * DEFAULTS.acceleration * 3600 * room));
      }
      // Junction traffic needs lateral clearance, rather than leader-following distance.
      // Never waive the physical footprint, even for the aircraft with priority.
      if (conflict) {
        const end = path.find(p => distance(p, a.position) > 1e-8);
        if (end) {
          const length = distance(a.position, end), dx = (end.x - a.position.x) / length, dy = (end.y - a.position.y) / length;
          const ox = other.position.x - a.position.x, oy = other.position.y - a.position.y;
          const forward = ox * dx + oy * dy, lateral = Math.abs(ox * dy - oy * dx);
          if (forward > 0 && lateral < GROUND.corridor) {
            const room = Math.max(0, forward - Math.sqrt(GROUND.corridor ** 2 - lateral ** 2));
            travelLimit = Math.min(travelLimit, room); speedLimit = Math.min(speedLimit, Math.sqrt(2 * DEFAULTS.acceleration * 3600 * room));
          }
        }
        continue;
      }
    }
    let start = a.position, along = 0;
    for (const end of path) {
      const length = distance(start, end);
      if (length < 1e-8) {start = end; continue;}
      const dx = (end.x - start.x) / length, dy = (end.y - start.y) / length;
      const offset = {x: other.position.x - start.x, y: other.position.y - start.y};
      const projection = offset.x * dx + offset.y * dy;
      const lateral = Math.abs(offset.x * dy - offset.y * dx);
      if (projection > 0 && projection <= length + GROUND.spacing && lateral < GROUND.corridor) {
        let room = Math.max(0, Math.min(along + projection, distance(a.position, other.position)) - GROUND.spacing);
        // Both aircraft consume this same gap during a simultaneous tick.
        if (!other.holding && other.targetSpeed > 0 && ["taxi", "pushback", "lineup"].includes(other.mode) && Math.cos((a.heading - other.heading) * radians) < -.7) room /= 2;
        travelLimit = Math.min(travelLimit, room);
        // Stop behind stationary traffic and automatically resume when the route clears.
        speedLimit = Math.min(speedLimit, Math.sqrt(2 * DEFAULTS.acceleration * 3600 * room));
        break;
      }
      along += length; start = end;
      if (along > .2) break;
    }
  }
  return {speedLimit, travelLimit};
}

/** Continuous steering with corner anticipation. Only an endpoint within the
 * current travel budget can be reached exactly; corners never teleport traffic. */
export function moveGround(a: Aircraft, path: TaxiPoint[], index: number, dt: number, reverse: boolean, guidance: GroundGuidance): {index: number; held: boolean} {
  const maximum = reverse ? GROUND.pushbackSpeed : a.arrivalExit?.speed ?? (a.expedited ? 25 : DEFAULTS.taxiSpeed);
  let waypoint = path[index];
  if (!waypoint) {a.speed = 0; return {index, held: false};}
  const mustStop = (i: number) => (i === path.length - 1 && !(a.mode === "lineup" && !a.lineupWait)) || (!reverse && a.mode !== "lineup" && !!path[i].hold && a.releasedHold !== i);
  let gap = distance(a.position, waypoint);
  if (!mustStop(index) && path[index + 1]) {
    const next = path[index + 1];
    const turn = Math.abs(angleTo(heading(a.position, waypoint), heading(waypoint, next)));
    const radius = Math.max(a.speed, 3) / 3600 / (GROUND.turnRate * radians);
    const lead = Math.min(.012, distance(waypoint, next) * .35, radius * Math.tan(Math.min(120, turn) * radians / 2));
    if (gap <= Math.max(1e-6, lead)) {index++; waypoint = path[index]; gap = distance(a.position, waypoint);}
  }
  const stopping = mustStop(index);
  const budget = Math.min(Math.max(a.speed, 1) / 3600 * dt, guidance.travelLimit);
  if (gap <= Math.max(1e-7, budget) && (gap < 1e-6 || Math.abs(angleTo(a.heading, heading(a.position, waypoint) + (reverse ? 180 : 0))) < 5)) {
    if (gap <= guidance.travelLimit) {
      a.position = {x: waypoint.x, y: waypoint.y};
      if (stopping) {
        a.speed = 0;
        if (!reverse && a.mode !== "lineup" && waypoint.hold && a.releasedHold !== index) return {index, held: true};
      }
      return {index: index + 1, held: false};
    }
  }
  a.targetHeading = (heading(a.position, waypoint) + (reverse ? 180 : 0)) % 360;
  const angle = angleTo(a.heading, a.targetHeading);
  const turn = Math.sign(angle) * Math.min(Math.abs(angle), GROUND.turnRate * dt);
  // Slow sharp turns and endpoint approaches rather than orbiting an unreachable point.
  const turningSpeed = maximum * Math.max(0, Math.cos(angle * radians));
  // A target must remain outside our turning circle. This bounds curvature even
  // in the last centimetres, so a tiny heading error cannot cause endless orbits.
  const steeringSpeed = gap * 3600 * GROUND.turnRate * radians / Math.max(.01, 2 * Math.sin(Math.abs(angle) * radians));
  const stoppingSpeed = stopping ? Math.min(Math.sqrt(2 * DEFAULTS.acceleration * 3600 * gap), steeringSpeed) : Infinity;
  a.speed = approach(a.speed, Math.min(a.targetSpeed, maximum, turningSpeed, stoppingSpeed, guidance.speedLimit), DEFAULTS.acceleration * dt);
  a.speed = Math.min(a.speed, steeringSpeed, turningSpeed);
  const stride = Math.min(a.speed / 3600 * dt, guidance.travelLimit, gap);
  const course = (a.heading + turn / 2) * radians;
  a.position = {x: a.position.x + Math.sin(course) * stride * (reverse ? -1 : 1), y: a.position.y + Math.cos(course) * stride * (reverse ? -1 : 1)};
  a.heading = (a.heading + turn + 360) % 360;
  return {index, held: false};
}
