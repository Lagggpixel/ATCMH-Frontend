import {updateRouteConstraints} from "./command-navigation";
import {turnAircraft, bankTurnLead} from "./banked-turns";
import {runwayEnds, airportRunways, defaultRunway} from "./airports";
import {DEFAULTS, type Aircraft, type Airport, type Altitude, type Instruction, type Point, type RadarEnvironment} from "./model";
import {radarSpeedText, updateRadarSpeed, validRadarSpeed} from "./radar-speed";

export const ALTITUDES: readonly Altitude[] = [
  ...Array.from({length: 18}, (_, i): Altitude => ({unit: "feet", value: 1000 + i * 500})),
  ...Array.from({length: 8}, (_, i): Altitude => ({unit: "feet", value: 10000 + i * 1000})),
  ...Array.from({length: 43}, (_, i): Altitude => ({unit: "flight-level", value: 180 + i * 10})),
];
export const altitudeFeet = (a: Altitude) => a.unit === "feet" ? a.value : a.value * 100;
export const altitudeLabel = (a: Altitude) => a.unit === "feet" ? String(a.value) : `FL${a.value}`;
export const validAltitude = (a: Altitude) => ALTITUDES.some(item => item.unit === a.unit && item.value === a.value);
export const headingDifference = (target: number, current: number) => ((target - current + 540) % 360) - 180;
export const radarHeading = (from: Point, to: Point) => (Math.atan2(to.x - from.x, to.y - from.y) * 180 / Math.PI + 360) % 360;
export const roundedHeading = (heading: number) => Math.round(heading / 10) * 10 % 360;
export const snappedVectorHeading = (from: Point, to: Point) => roundedHeading(radarHeading(from, to));
export function roundedHeadingInstruction(c: Instruction): Instruction {
  return c.type === "heading" ? {...c, value: roundedHeading(c.value)} : c.type === "vector" && c.heading !== undefined ? {...c, heading: roundedHeading(c.heading)} : c;
}
export function vectorPreview(a: Aircraft, point: Point, environment?: RadarEnvironment) {
  const heading = snappedVectorHeading(a.position, point), nm = distance(a.position, point);
  const endpoint = {...point};
  const nearby = environment?.fixes.filter(fix => distance(fix.point, endpoint) <= 2).sort((a, b) => distance(a.point, endpoint) - distance(b.point, endpoint))[0];
  return {heading, nm, point: endpoint, minutes: a.speed > 0 ? nm / a.speed * 60 : null, fix: nearby?.id};
}
export function radarFlightLabel(a: Aircraft, airport: Airport, environment?: RadarEnvironment) {
  const r = a.radar, target = r?.targetAltitude;
  const assignedFrom = r?.altitudeAssignedFrom ?? a.altitude;
  const marker = target && (altitudeFeet(target) < assignedFrom ? ">" : altitudeFeet(target) > assignedFrom ? "<" : "=");
  const approach = environment?.approaches.find(p => p.id === (r?.expected ?? r?.cleared));
  return {flight: `${Math.round(a.altitude / 100)}${target ? ` ${marker} ${Math.round(altitudeFeet(target) / 100)}` : ""} ${Math.round(a.speed)}kts`,
    approach: approach ? `${approach.type === "visual" ? "Visual" : approach.type.toUpperCase()} - ${airport.icao} ${approach.runway}` : r?.guidance === "vectors" ? `RV - ${airport.icao} ${a.runway ?? defaultRunway(airport)}` : undefined};
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const airborne = (a: Aircraft, airport: Airport) => a.active && !["parked", "pushback", "taxi", "lineup", "rollout"].includes(a.mode) && a.altitude > airport.elevation;
const towards = (value: number, target: number, maximum: number) => value + Math.sign(target - value) * Math.min(Math.abs(target - value), maximum);

/** Versioned schematic training geometry, generated from the pinned runway snapshot.
 * These are simulator exercises, not imported instrument procedures. */
export function radarEnvironmentFor(airport: Airport): RadarEnvironment {
  return {version: 1, name: `${airport.icao} training sector`, range: 80,
    boundary: [{x: -80, y: -80}, {x: 80, y: -80}, {x: 80, y: 80}, {x: -80, y: 80}],
    fixes: [{id: "NORTH", point: {x: 0, y: 60}}, {id: "EAST", point: {x: 60, y: 0}}, {id: "SOUTH", point: {x: 0, y: -60}}, {id: "WEST", point: {x: -60, y: 0}}],
    approaches: runwayEnds(airport).flatMap(end => (["ils", "gps", "visual"] as const).map(type => ({id: `${type}-${end.id}`, type, runway: end.id, finalDistance: 15, captureWidth: type === "visual" ? .5 : .2, glideAngle: 3, missedHeading: end.heading}))),
  };
}
export function approachGeometry(airport: Airport, runway: string) {
  const pair = airportRunways(airport).find(pair => pair.ends.some(end => end.id === runway))!;
  const threshold = pair.ends.find(end => end.id === runway)!.point, departure = pair.ends.find(end => end.id !== runway)!.point;
  const heading = radarHeading(threshold, departure), radians = heading * Math.PI / 180;
  return {threshold, heading, vector: {x: Math.sin(radians), y: Math.cos(radians)}};
}
export function radarAircraft(a: Aircraft, station: "approach" | "center", airport: Airport): Aircraft {
  const g = approachGeometry(airport, a.runway ?? defaultRunway(airport));
  const altitude = station === "center" ? 30000 : Math.max(5000, Math.ceil((airport.elevation + 3000) / 500) * 500);
  return {...a, mode: "heading", landing: "full-stop", position: {x: g.threshold.x - g.vector.x * (station === "center" ? 45 : 20), y: g.threshold.y - g.vector.y * (station === "center" ? 45 : 20)},
    altitude, frequency: station, speed: station === "center" ? 450 : 250, targetSpeed: station === "center" ? 450 : 250,
    radar: {station, navigation: "heading", routeIndex: 0, report: "check-in"},
    clearedToLand: false, clearedForOption: false, leavingCircuit: true};
}
export function radarInstructionError(a: Aircraft, c: Instruction, airport: Airport, environment: RadarEnvironment): string | null {
  if (c.type === "radar-speed") return !a.radar && a.frequency === "tower" ? validRadarSpeed(c) && c.mode !== "maintain" ? null : "Choose a Tower speed instruction." : !a.radar || !airborne(a, airport) ? "This instruction requires airborne Approach or Center traffic." : validRadarSpeed(c) ? null : "Choose a listed speed instruction.";
  if (!["vector", "expect-approach", "missed-approach", "route"].includes(c.type)) return null;
  if (!a.radar || !airborne(a, airport)) return "This instruction requires airborne Approach or Center traffic.";
  if (c.type === "vector") {
    if (c.heading === undefined && !c.altitude && !c.approachId) return "Choose a heading, altitude or approach clearance.";
    if (c.heading !== undefined && (!Number.isFinite(c.heading) || c.heading < 0 || c.heading > 360)) return "Choose a heading from 0 to 360.";
    if (c.approachId && (a.radar.expected !== c.approachId || !environment.approaches.some(item => item.id === c.approachId))) return "The expected approach has changed. Select the current approach before clearing it.";
  }
  if ((c.type === "vector" || c.type === "missed-approach") && c.altitude && (!validAltitude(c.altitude) || altitudeFeet(c.altitude) <= airport.elevation)) return "Choose an available altitude above the airport elevation.";

  if (c.type === "expect-approach" && c.approachId && !environment.approaches.some(item => item.id === c.approachId)) return "This approach is unavailable in the pinned training environment.";
  if (c.type === "route" && (!Number.isInteger(c.index) || c.index < 0 || c.index >= a.flightPlan.length)) return "Choose an existing route waypoint.";
  return null;
}
export function assignRadar(a: Aircraft, c: Instruction, airport: Airport, environment: RadarEnvironment) {
  const r = a.radar!;
  if (c.type === "vector" || c.type === "missed-approach" || c.type === "route" && c.altitude) delete a.starDescent;
  if (c.type === "expect-approach") {
    if (c.navigation === "filed" && a.flightPlan[r.routeIndex]) r.navigation = "route";
    r.expected = c.approachId ?? undefined; r.guidance = c.vectors ? "vectors" : undefined;
    if (c.vectors) a.runway = c.runway ?? a.runway ?? defaultRunway(airport);
    r.cleared = undefined; r.captured = false; r.localizer = false; r.clearanceAltitudeChecked = false; if (r.navigation === "approach") r.navigation = "heading";
  } else if (c.type === "vector") {
    if (c.heading !== undefined) {a.targetHeading = c.heading % 360; r.navigation = "heading"; r.cleared = undefined; r.captured = false; r.localizer = false; r.clearanceAltitudeChecked = false;}
    if (c.altitude) {r.targetAltitude = {...c.altitude}; r.altitudeAssignedFrom = a.altitude;}
    if (c.approachId) {r.navigation = "approach"; r.cleared = c.approachId; r.captured = false; r.localizer = false; r.clearanceAltitudeChecked = false;}
  } else if (c.type === "route") {r.navigation = "route"; r.routeIndex = c.index; if (c.altitude) r.targetAltitude = {...c.altitude}; r.cleared = undefined; r.captured = false; r.localizer = false; r.clearanceAltitudeChecked = false;}
  else if (c.type === "missed-approach") {
    const expected = environment.approaches.find(item => item.id === r.expected);
    a.targetHeading = c.heading ?? expected?.missedHeading ?? approachGeometry(airport, a.runway ?? defaultRunway(airport)).heading;
    r.navigation = "missed"; r.cleared = undefined; r.captured = false; r.localizer = false; r.clearanceAltitudeChecked = false; r.targetAltitude = {...c.altitude}; r.altitudeAssignedFrom = a.altitude;
    r.speed = undefined;
    a.clearedToLand = false; a.clearedForOption = false; a.targetSpeed = 220; a.speedMode = "auto";
  }
  a.mode = "heading"; a.extended = false; a.sequence = undefined; a.leavingCircuit = true;
}
export function moveRadar(a: Aircraft, dt: number, airport: Airport, environment: RadarEnvironment, traffic: Aircraft[] = [], automatic = false) {
  const r = a.radar!;
  if (!a.active) return;
  updateRouteConstraints(a);
  let altitude = r.targetAltitude ? altitudeFeet(r.targetAltitude) : a.altitude;
  if (r.navigation === "route") {
    let point = a.flightPlan[r.routeIndex];
    const turnRadius = bankTurnLead(a.speed);
    if (point && distance(a.position, point) <= Math.max(.15, turnRadius * .7)) point = a.flightPlan[++r.routeIndex];
    updateRouteConstraints(a);
    altitude = r.targetAltitude ? altitudeFeet(r.targetAltitude) : a.altitude;
    if (point) a.targetHeading = radarHeading(a.position, point);
    else r.navigation = "heading";
  }
  if (a.starDescent) altitude = Math.min(altitude, a.altitude);
  if (r.navigation === "approach" && r.cleared) {
    const approach = environment.approaches.find(item => item.id === r.cleared);
    if (approach) {
      const g = approachGeometry(airport, approach.runway), dx = a.position.x - g.threshold.x, dy = a.position.y - g.threshold.y;
      const along = dx * g.vector.x + dy * g.vector.y, lateral = dx * -g.vector.y + dy * g.vector.x;
      const glideHeight = airport.elevation + 50 + Math.max(0, -along) * 6076.12 * Math.tan(approach.glideAngle * Math.PI / 180);
      const onLocalizer = along < -.1 && along >= -approach.finalDistance && Math.abs(lateral) <= approach.captureWidth && Math.abs(headingDifference(g.heading, a.heading)) <= 45;
      r.localizer = approach.type === "ils" && onLocalizer;
      const checkAltitude = !r.clearanceAltitudeChecked && (approach.type !== "ils" || onLocalizer);
      const clearanceHeight = approach.type === "ils" ? glideHeight : airport.elevation + 50 + Math.hypot(dx, dy) * 6076.12 * Math.tan(approach.glideAngle * Math.PI / 180);
      if (automatic && checkAltitude) {
        r.clearanceAltitudeChecked = true;
        // Visual traffic can recover a modest height excess within its final-capture allowance.
        const heightTolerance = approach.type === "visual" ? 500 : 0;
        if (a.altitude > clearanceHeight + heightTolerance + 1e-6) {
          const altitude = ALTITUDES.find(value => altitudeFeet(value) >= Math.max(a.altitude, 5000, airport.elevation + 2000)) ?? ALTITUDES[ALTITUDES.length - 1];
          assignRadar(a, {type: "missed-approach", altitude}, airport, environment); r.report = "missed";
          moveRadar(a, dt, airport, environment, traffic, automatic); return;
        }
      }
      if (!r.captured && along < -.1 && along >= -approach.finalDistance && Math.abs(lateral) <= approach.captureWidth && Math.abs(headingDifference(g.heading, a.heading)) <= 45 && a.altitude <= glideHeight + 500) r.captured = true;
      if (r.captured) {
        a.targetHeading = radarHeading(a.position, {x: g.threshold.x + g.vector.x, y: g.threshold.y + g.vector.y});
        altitude = glideHeight;
        if (a.speedMode !== "manual") a.targetSpeed = -along <= 2 ? 135 : -along <= 5 ? 160 : 180;
        if (along >= -.05) {
          if (r.transferred && a.frequency === "tower") {a.active = false; a.speed = 0; return;}
          assignRadar(a, {type: "missed-approach", altitude: {unit: "feet", value: Math.max(5000, Math.ceil((airport.elevation + 2000) / 500) * 500)}}, airport, environment);
          r.report = "missed"; altitude = altitudeFeet(r.targetAltitude!);
        }
      }
    }
  }
  a.altitude = towards(a.altitude, altitude, (altitude < a.altitude ? DEFAULTS.descentRate : DEFAULTS.climbRate) / 60 * dt);
  const final = approachGeometry(airport, environment.approaches.find(p => p.id === r.expected)?.runway ?? a.runway ?? defaultRunway(airport));
  const dx = a.position.x - final.threshold.x, dy = a.position.y - final.threshold.y;
  const along = dx * final.vector.x + dy * final.vector.y, lateral = Math.abs(dx * -final.vector.y + dy * final.vector.x);
  updateRadarSpeed(a, traffic, along < 0 && lateral <= .5 && Math.abs(headingDifference(final.heading, a.heading)) <= 30 ? -along : undefined);
  a.speed = towards(a.speed, a.targetSpeed, DEFAULTS.acceleration * dt);
  turnAircraft(a, dt);
  const stride = a.speed / 3600 * dt, radians = a.heading * Math.PI / 180;
  a.position = {x: a.position.x + Math.sin(radians) * stride, y: a.position.y + Math.cos(radians) * stride};
}
export function altitudeTransmission(a: Aircraft, altitude: Altitude) {
  const change = altitudeFeet(altitude) > a.altitude + 50 ? "climb and maintain" : altitudeFeet(altitude) < a.altitude - 50 ? "descend and maintain" : "maintain";
  return `${change} ${altitudeLabel(altitude)}`;
}
const spokenDigits = (value: number | string) => String(value).split("").map(digit => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][Number(digit)]).join(" ");
export function turnTransmission(a: Aircraft, heading: number) {
  const target = roundedHeading(heading);
  return `turn ${headingDifference(target, a.heading) < 0 ? "left" : "right"} heading ${spokenDigits(String(target || 360).padStart(3, "0"))}`;
}
export function checkInTransmission(a: Aircraft) {
  return `${a.callsign}, with you at ${a.altitude >= 18000 ? `flight level ${spokenDigits(Math.round(a.altitude / 100))}` : Math.round(a.altitude)}`;
}
export function radarInstructionText(a: Aircraft, c: Instruction, environment: RadarEnvironment): string | undefined {
  if (c.type === "radar-speed") return radarSpeedText(a, c);
  if (c.type === "heading") return turnTransmission(a, c.value);
  if (c.type === "vector") {
    const p = environment.approaches.find(p => p.id === c.approachId);
    const clearance = p ? p.type === "ils" ? `${c.standalone ? "" : `maintain ${c.altitude ? altitudeLabel(c.altitude) : a.radar?.targetAltitude ? altitudeLabel(a.radar.targetAltitude) : Math.round(a.altitude)} until established on the localizer, `}cleared ILS runway ${p.runway} approach` : p.type === "gps" ? `cleared GPS ${c.standalone ? "approach runway" : "runway"} ${p.runway}${c.standalone ? "" : " approach"}` : `cleared visual approach runway ${p.runway}` : "";
    return [c.heading === undefined ? "" : turnTransmission(a, c.heading), c.altitude && !c.standalone ? altitudeTransmission(a, c.altitude) : "", clearance].filter(Boolean).join(", ");
  }
  if (c.type === "missed-approach") return `execute missed approach, ${c.heading === undefined ? "" : turnTransmission(a, c.heading) + ", "}${altitudeFeet(c.altitude) > a.altitude ? "climb" : "descend"} and maintain ${altitudeLabel(c.altitude)}`;
  if (c.type === "expect-approach") {
    const p = environment.approaches.find(p => p.id === c.approachId), runway = p?.runway ?? c.runway ?? a.runway;
    if (c.vectors) return `expect vectors for runway ${runway} at ${environment.airportName ?? "destination"}`;
    return p ? `${c.navigation === "filed" ? "continue as filed, expect the" : "expect vectors for the"} ${p.type === "visual" ? "visual" : p.type.toUpperCase()} approach runway ${p.runway} at ${environment.airportName ?? "destination"}` : "unable to provide services";
  }
  if (c.type === "route") return `proceed direct ${c.name ?? `Waypoint ${c.index + 1}`}${c.altitude ? `, ${altitudeTransmission(a, c.altitude)}` : ""}`;
}
