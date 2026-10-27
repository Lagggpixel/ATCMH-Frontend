import {bankTurnRadius, bankTurnRate} from "./banked-turns";
import {flightVelocity, trueAirspeed} from "./aircraft-performance";
import {holdingLegSeconds} from "./command-navigation";
import {holdEntryType} from "./holding";
import type {Aircraft, ExerciseWeather, Point} from "./model";
import type {AtcManeuver} from "./reference-commands";

const rad = Math.PI / 180, nmMeters = 1852;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const unit = (heading: number) => ({x: Math.sin(heading), y: Math.cos(heading)});
type Phase = NonNullable<AtcManeuver["phase"]>;
interface PathPoint extends Point {heading: number; distance: number; arc: number; phase: Phase}
interface Path {points: PathPoint[]; length: number; radius: number}
const cache = new Map<string, Path>();

/** IF 26.4 HoldGeometry: sampled arcs and straights in local nautical miles. */
export function buildHoldPath(center: Point, inboundDegrees: number, hand: "left" | "right", speed: number, seconds: number, arrivalDegrees?: number): Path {
  const inbound = inboundDegrees * rad, sign = hand === "right" ? 1 : -1;
  const radius = bankTurnRadius(Math.max(60, speed), 20), length = Math.max(1, Math.max(speed, 58.315) / 3600 * seconds);
  const points: PathPoint[] = []; let cursor = {...center}, heading = (arrivalDegrees ?? inboundDegrees) * rad, distance = 0;
  function turn(sweep: number, phase: Phase) {
    if (Math.abs(sweep) < .05) {heading = wrap(heading + sweep); return;}
    const direction = Math.sign(sweep), side = unit(heading + direction * Math.PI / 2);
    const pivot = {x: cursor.x + radius * side.x, y: cursor.y + radius * side.y};
    const count = Math.max(Math.floor(Math.abs(sweep) / (Math.PI / 30)), 4), initial = heading;
    for (let i = 0; i <= count; i++) {
      const h = initial + sweep * i / count, sideNow = unit(h + direction * Math.PI / 2);
      points.push({x: pivot.x - radius * sideNow.x, y: pivot.y - radius * sideNow.y, heading: wrap(h), distance: distance + Math.abs(sweep) * radius * i / count, arc: direction, phase});
    }
    distance += Math.abs(sweep) * radius; cursor = {...points[points.length - 1]}; heading = wrap(initial + sweep);
  }
  function straight(target: Point, phase: Phase) {
    const dx = target.x - cursor.x, dy = target.y - cursor.y, length = Math.hypot(dx, dy);
    if (length < 1 / nmMeters) {cursor = {...target}; return;}
    heading = Math.atan2(dx, dy);
    const count = clamp(Math.floor(length * nmMeters / 2000) + 1, 2, 32);
    for (let i = 0; i < count; i++) {const t = i / (count - 1); points.push({x: cursor.x + dx * t, y: cursor.y + dy * t, heading, distance: distance + length * t, arc: 0, phase});}
    distance += length; cursor = {...target};
  }
  function along(length: number, phase: Phase) {const v = unit(heading); straight({x: cursor.x + length * v.x, y: cursor.y + length * v.y}, phase);}
  function directed(to: number) {let sweep = wrap(to - heading); if (sign > 0 && sweep < -.05) sweep += 2 * Math.PI; else if (sign < 0 && sweep > .05) sweep -= 2 * Math.PI; return sweep;}
  const outbound = wrap(inbound + Math.PI);
  const entry = arrivalDegrees === undefined ? "circuit" : holdEntryType(arrivalDegrees, inboundDegrees, hand);
  if (entry === "teardrop") {
    turn(wrap(outbound - sign * Math.PI / 6 - heading), "turn-outbound"); along(length, "outbound");
    turn(directed(inbound), "turn-inbound"); straight(center, "inbound");
  } else if (entry === "parallel") {
    turn(wrap(outbound - heading), "turn-outbound"); along(length, "outbound");
    turn(sign * 5 * Math.PI / 4, "turn-inbound"); straight(center, "inbound");
  } else if (entry === "direct") {
    const backwards = unit(outbound), side = unit(inbound + sign * Math.PI / 2);
    const target = {x: center.x + length * backwards.x + 2 * radius * side.x, y: center.y + length * backwards.y + 2 * radius * side.y};
    turn(directed(outbound), "turn-outbound"); straight(target, "outbound");
    turn(directed(inbound), "turn-inbound"); straight(center, "inbound");
  } else {
    turn(sign * Math.PI, "turn-outbound"); along(length, "outbound");
    turn(sign * Math.PI, "turn-inbound"); straight(center, "inbound");
  }
  return {points, length: distance, radius};
}
function pathFor(m: AtcManeuver): Path {
  const key = JSON.stringify([m.center, m.inbound, m.hand, m.pathSpeed, m.pathSeconds, m.pathStage, m.pathArrival]);
  let path = cache.get(key);
  if (!path) {
    const active = buildHoldPath(m.center!, m.inbound ?? m.heading, m.hand, m.pathSpeed!, m.pathSeconds!, m.pathStage === "entry" ? m.pathArrival : undefined);
    const continuation = buildHoldPath(m.center!, m.inbound ?? m.heading, m.hand, m.pathSpeed!, m.pathSeconds!);
    path = {...active, points: [...active.points, ...continuation.points.map(point => ({...point, distance: point.distance + active.length}))]};
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, path);
  }
  return path;
}

/** Start at a fix; keep the compact geometry definition and progress in saved state. */
export function startHoldPath(a: Aircraft, weather?: ExerciseWeather) {
  const m = a.atcManeuver!;
  m.pathStage = "entry"; m.pathArrival = a.track ?? a.heading;
  m.entryType = holdEntryType(m.pathArrival, m.inbound ?? m.heading, m.hand);
  m.pathSpeed = Math.max(60, trueAirspeed(a.speed, a.altitude, weather)); m.pathSeconds = m.legSeconds ?? holdingLegSeconds(m.altitude); m.pathIndex = 0;
}

/** Returns true at the next fix crossing when an exit is armed. */
export function trackHoldPath(a: Aircraft, dt: number, weather?: ExerciseWeather): boolean {
  const m = a.atcManeuver!, path = pathFor(m), points = path.points;
  const velocity = flightVelocity(a, weather), gs = Math.hypot(velocity.x, velocity.y), track = Math.atan2(velocity.x, velocity.y);
  let best = Infinity, index = Math.min(m.pathIndex ?? 0, points.length - 2), fraction = 0, cross = 0;
  const start = Math.max(0, index - 4), end = Math.min(points.length - 1, index + 11);
  function search(first: number, last: number, matchTrack: boolean) {
    for (let i = first; i < last; i++) {
      const p = points[i], q = points[i + 1], dx = q.x - p.x, dy = q.y - p.y, len2 = dx * dx + dy * dy;
      if (m.exitArmed && q.distance > path.length + .01 / nmMeters) break;
      if (len2 < 1e-10 || matchTrack && Math.abs(wrap(p.heading - track)) > 100 * rad) continue;
      const t = clamp(((a.position.x - p.x) * dx + (a.position.y - p.y) * dy) / len2, 0, 1);
      const error = Math.hypot(a.position.x - p.x - t * dx, a.position.y - p.y - t * dy);
      if (error < best) {best = error; index = i; fraction = t; cross = -(dx * (a.position.y - p.y) - dy * (a.position.x - p.x)) / Math.sqrt(len2);}
    }
  }
  search(start, end, false);
  if (best > 2500 / nmMeters) search(0, points.length - 1, true);
  m.pathIndex = index;
  const p = points[index], q = points[index + 1];
  const progress = p.distance + fraction * (q.distance - p.distance);
  if (progress >= path.length - 30 / nmMeters) {
    if (m.exitArmed) return true;
    m.pathStage = "circuit"; m.pathIndex = 0;
    const speed = Math.max(60, trueAirspeed(a.speed, a.altitude, weather));
    if (Math.abs(speed - m.pathSpeed!) > 5) m.pathSpeed = speed;
    m.pathSeconds = m.legSeconds ?? holdingLegSeconds(m.altitude);
    delete m.entryType;
    return trackHoldPath(a, dt, weather);
  }
  m.phase = p.phase;
  // Predict the aircraft's ground track 3.5 seconds ahead, as IF's director does.
  const speed = gs * nmMeters / 3600;
  let predictedTrack = track, guidanceIndex = index, guidanceFraction = fraction;
  if (speed >= 5) {
    const rate = 9.80665 * Math.tan((a.bankAngle ?? 0) * rad) * Math.cos(a.heading * rad - track) / speed;
    const sweep = rate * 3.5, travel = gs / 3600 * 3.5 * (Math.abs(sweep) > 1e-5 ? Math.sin(sweep / 2) / (sweep / 2) : 1);
    const predicted = {x: a.position.x + travel * Math.sin(track + sweep / 2), y: a.position.y + travel * Math.cos(track + sweep / 2)};
    let nearest = Infinity;
    for (let i = Math.max(0, index - 1); i < Math.min(points.length - 1, index + 32); i++) {
      const start = points[i], end = points[i + 1];
      if (end.distance > progress + travel * 2 + 100 / nmMeters || m.exitArmed && end.distance > path.length + .01 / nmMeters) break;
      const dx = end.x - start.x, dy = end.y - start.y, len2 = dx * dx + dy * dy;
      if (len2 < 1e-10) continue;
      const t = clamp(((predicted.x - start.x) * dx + (predicted.y - start.y) * dy) / len2, 0, 1);
      const error = Math.hypot(predicted.x - start.x - t * dx, predicted.y - start.y - t * dy);
      if (error < nearest) {nearest = error; guidanceIndex = i; guidanceFraction = t; cross = -(dx * (predicted.y - start.y) - dy * (predicted.x - start.x)) / Math.sqrt(len2);}
    }
    predictedTrack += sweep;
  }
  const g = points[guidanceIndex], h = points[guidanceIndex + 1];
  const tangent = g.heading + guidanceFraction * wrap(h.heading - g.heading);
  const curvature = g.arc && h.arc === g.arc ? g.arc / (path.radius * nmMeters) : 0;
  // Infinite Flight LateralPathGuidance, expressed in metres and radians.
  const xte = cross * nmMeters;
  const capture = Math.max(100, speed * 12), intercept = clamp(-Math.atan(xte / capture), -Math.PI / 6, Math.PI / 6);
  const trackError = wrap(predictedTrack - tangent), crossVelocity = speed * Math.sin(trackError);
  const interceptRate = Math.abs(intercept) < Math.PI / 6 ? -capture * crossVelocity / (capture * capture + xte * xte) : 0;
  let feedforward = curvature * speed * Math.cos(trackError) / Math.max(.5, 1 - curvature * xte);
  feedforward *= clamp(1 - Math.abs(xte) / capture, 0, 1);
  const rate = feedforward + interceptRate + clamp(wrap(intercept - trackError), -Math.PI / 2, Math.PI / 2) / 5;
  const correction = Math.max(.25, Math.cos(a.heading * rad - track));
  const desired = clamp(Math.atan(speed * rate / (9.80665 * correction)) / rad, -25, 25);
  const before = a.bankAngle ?? 0, bank = before + clamp(desired - before, -6 * dt, 6 * dt);
  a.bankAngle = bank;
  a.heading = (a.heading + bankTurnRate(trueAirspeed(a.speed, a.altitude, weather), (before + bank) / 2) * dt + 360) % 360;
  a.targetHeading = (tangent / rad + 360) % 360;
  return false;
}
