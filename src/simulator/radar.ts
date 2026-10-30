import {arrivalProcedureName} from "./arrival-procedure";
import {applyDepartureOrigin, departureGeometry, nearestScenarioDeparture, type DepartureAirport} from "./departure-airports";
import type {ScopeMapData} from "./scope-map-data";
import {visualDescentDistance, visualDescentHeight} from "./visual-descent";
import {runwayGoAroundDue, runwayOccupied} from "./runway-safety";
import {radarArrivalFrequency} from "./model";
import {airportApproaches, environmentWithDestinations} from "./aviation";
import {climbRate, descentRate, acceleration, headingForGroundTrack, performanceFor} from "./aircraft-performance";
import {controllerAircraft} from "./controller-state";
import {magneticToTrue, trueToMagnetic} from "./magnetic-headings";
import {MAX_ILS_INTERCEPT, GLIDESLOPE_DEVIATION_FEET, missedLocalizerReason} from "./radar-automation";
import {updateRouteConstraints} from "./command-navigation";
import {turnAircraft, bankTurnLead} from "./banked-turns";
import {runwayEnds, airportRunways, defaultRunway} from "./airports";
import {ILS_CAPTURE_DISTANCE_NM, type Aircraft, type Airport, type Altitude, type Instruction, type Point, type RadarEnvironment, type ExerciseWeather} from "./model";
import {automaticRadarTarget, radarPerformance, radarSpeedText, updateRadarSpeed, validRadarSpeed} from "./radar-speed";
import {enterPublishedHold} from "./holding";
import {routeWaypointName} from "./direct-to";
import {vectorSnapTarget} from "./vector-drag";
import {flyGpsRoute, gpsApproachJoin, gpsFinalApproachFix} from "./gps-approach";

export const ALTITUDES: readonly Altitude[] = [
  ...Array.from({length: 18}, (_, i): Altitude => ({unit: "feet", value: 1000 + i * 500})),
  ...Array.from({length: 8}, (_, i): Altitude => ({unit: "feet", value: 10000 + i * 1000})),
  ...Array.from({length: 43}, (_, i): Altitude => ({unit: "flight-level", value: 180 + i * 10})),
];
export const altitudeFeet = (a: Altitude) => a.unit === "feet" ? a.value : a.value * 100;
export function standaloneApproachClearance(a: Aircraft, approachId: string): Extract<Instruction, {type: "vector"}> {
  return {type: "vector", approachId, standalone: true, interceptAltitude: a.radar?.targetAltitude ? altitudeFeet(a.radar.targetAltitude) : Math.round(a.altitude)};
}
export const altitudeLabel = (a: Altitude) => a.unit === "feet" ? `${a.value.toLocaleString("en-US")}ft` : `FL${a.value}`;
export const validAltitude = (a: Altitude) => ALTITUDES.some(item => item.unit === a.unit && item.value === a.value);
export const headingDifference = (target: number, current: number) => ((target - current + 540) % 360) - 180;
export const radarHeading = (from: Point, to: Point) => (Math.atan2(to.x - from.x, to.y - from.y) * 180 / Math.PI + 360) % 360;
export const roundedHeading = (heading: number) => Math.round(heading / 10) * 10 % 360;
export const snappedVectorHeading = (from: Point, to: Point, airport: Airport) => roundedHeading(trueToMagnetic(radarHeading(from, to), airport));
export function roundedHeadingInstruction(c: Instruction): Instruction {
  return c.type === "heading" ? {...c, value: roundedHeading(c.value)} : c.type === "vector" && c.heading !== undefined ? {...c, heading: roundedHeading(c.heading)} : c;
}
export function vectorPreview(a: Aircraft, point: Point, airport: Airport, environment?: RadarEnvironment, screenScale?: number) {
  const target = screenScale === undefined ? undefined : vectorSnapTarget(a, point, screenScale, environment);
  const endpoint = {...(target?.point ?? point)};
  const heading = snappedVectorHeading(a.position, endpoint, airport), nm = distance(a.position, endpoint);
  const nearby = environment?.fixes.filter(fix => distance(fix.point, endpoint) <= 2).sort((a, b) => distance(a.point, endpoint) - distance(b.point, endpoint))[0];
  return {heading, nm, point: endpoint, minutes: a.speed > 0 ? nm / a.speed * 60 : null, fix: nearby?.id, target};
}
export function radarFlightLabel(a: Aircraft, airport: Airport, environment?: RadarEnvironment) {
  a = controllerAircraft(a);
  if(environment)environment=environmentWithDestinations(airport,environment,[a]);
  const r = a.radar, target = a.assigned?.altitude ?? r?.targetAltitude;
  const approach = environment?.approaches.find(p => p.id === (r?.expected ?? r?.cleared));
  // Native integer casts truncate; '>' separates assigned altitude in every
  // direction and is not a climb/descent arrow.
  return {flight: `${Math.trunc(a.altitude / 100)}${target && altitudeFeet(target) > 0 ? ` > ${Math.trunc(altitudeFeet(target) / 100)}` : ""} ${Math.trunc(a.groundSpeed ?? a.speed)}KT`,
    approach: approach ? `${approach.type === "visual" ? "Visual" : approach.type.toUpperCase()} - ${approach.airportIcao ?? airport.icao} ${approach.runway}` : r?.guidance === "vectors" ? `RV - ${airport.icao} ${a.runway ?? defaultRunway(airport)}` : undefined};
}
export function radarGuidanceLabel(a: Aircraft, environment: RadarEnvironment): string | undefined {
  const r = a.radar;
  if (!r) return undefined;
  if (a.atcManeuver?.kind === "hold") return a.atcManeuver.fixName ? `Holding at ${a.atcManeuver.fixName}` : "Holding";
  if (r.arrival) return r.arrival.phase === "vacated" ? "Runway vacated" : r.arrival.phase === "vacating" ? "Vacating runway" : "Landing rollout";
  if (r.departure?.touchAndGo) return r.departure.phase === "roll" ? "Takeoff roll" : "Runway-heading climbout";
  if (r.patternJoin?.status === "unable") return `Unable to join pattern: ${r.patternJoin.reason}`;
  if (r.patternJoin) return `${r.patternJoin.status === "joining" ? "Joining" : "Local pattern"} · ${a.hand} ${a.leg}`;
  if (r.navigation === "missed") return "Missed approach";
  const approach = environment.approaches.find(p => p.id === r.cleared);
  if (r.navigation === "approach" && approach) {
    if (approach.type === "gps" && r.gpsApproach && !r.captured) return r.gpsApproach.joined ? "GPS · Following flight plan" : "GPS · Rejoining flight plan";
    if (approach.type === "ils") return r.glideslope || r.captured ? "LOC · GS" : r.localizer ? "LOC" : "ILS armed";
    return `${approach.type === "visual" ? "Visual" : "GPS"} ${r.captured ? "established" : "cleared"}`;
  }
  return r.navigation === "route" ? "Following route" : "Radar vectors";
}
/** A physical spawn/departure runway is not a controller-assigned arrival runway. */
export function radarStripRunway(a: Aircraft, environment: RadarEnvironment): string {
  a = controllerAircraft(a);
  const r = a.radar;
  if (!r) return a.runway ?? a.lastRunway ?? "----";
  const approach = environment.approaches.find(p => p.id === (r.cleared ?? r.expected));
  return a.assigned?.runway ?? approach?.runway ?? (r.guidance === "vectors" || r.arrival || r.patternJoin ? a.runway ?? a.lastRunway : undefined) ?? "----";
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
// A remote departure may be below the controlled airport while climbing, or
// below its origin while returning to a lower airport. Both can be airborne.
const airborneElevation = (a: Pick<Aircraft, "originDeparture">, airport: Airport) => Math.min(a.originDeparture?.elevation ?? airport.elevation, airport.elevation);
export const airborne = (a: Aircraft, airport: Airport) => a.active && !["parked", "pushback", "taxi", "lineup", "rollout"].includes(a.mode) && a.altitude > airborneElevation(a, airport);
const towards = (value: number, target: number, maximum: number) => value + Math.sign(target - value) * Math.min(Math.abs(target - value), maximum);

/** Versioned schematic training geometry, generated from the pinned runway snapshot.
 * These are simulator exercises, not imported instrument procedures. */
export function radarEnvironmentFor(airport: Airport): RadarEnvironment {
  return {version: 1, name: `${airport.icao} training sector`, range: 80,
    boundary: [{x: -80, y: -80}, {x: 80, y: -80}, {x: 80, y: 80}, {x: -80, y: 80}],
    fixes: [],
    approaches: airportApproaches(airport),
  };
}
export function approachGeometry(airport: Airport, runway: string, approach?: import("./model").RadarApproach) {
  if(approach?.threshold && approach.departure){const heading=radarHeading(approach.threshold,approach.departure),radians=heading*Math.PI/180;return {threshold:approach.threshold,heading,vector:{x:Math.sin(radians),y:Math.cos(radians)}};}
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
/** Tower takeoff is simulated automatically; radar training starts after the initial climb. */
export function radarTakeoffAircraft(a: Aircraft, airport: Airport, runway = defaultRunway(airport)): Aircraft {
  const g = approachGeometry(airport, runway), station = a.radar?.station ?? "approach";
  const result: Aircraft = {...a, runway, mode: "takeoff", position: {...g.threshold}, heading: g.heading, targetHeading: g.heading,
    altitude: airport.elevation, speed: 0, targetSpeed: 220, speedMode: "auto", flightPlan: structuredClone(a.flightPlan), trail: [],
    frequency: station, clearedToLand: false, clearedForOption: false, leavingCircuit: true,
    radar: {station, navigation: "heading", routeIndex: 0, flight: a.radar?.flight ?? "departure",
      requestedApproach: a.radar?.requestedApproach, departureDirection: a.radar?.departureDirection ?? "north",
      departure: {runway, phase: "roll"}, climbUntilAssigned: true}};
  delete result.originDeparture;
  result.targetSpeed = automaticRadarTarget(result);
  return result;
}
/** Convert an existing scenario aircraft using its position, heading and filed route. */
export function scenarioTakeoffAircraft(a: Aircraft, airport: Airport, origins: readonly DepartureAirport[], map: ScopeMapData): Aircraft {
  const selected = nearestScenarioDeparture(origins, map, airport, a.position, a.heading);
  const result = radarTakeoffAircraft(a, airport, selected.origin.icao === airport.icao ? selected.runway : defaultRunway(airport));
  result.radar!.navigation = a.flightPlan.length ? "route" : "heading";
  result.followRouteAltitudes = a.flightPlan.length ? true : undefined;
  return applyDepartureOrigin(result, airport, selected.origin, selected.runway);
}
export function radarTrafficStateError(a: Pick<Aircraft, "mode" | "altitude" | "runway" | "radar" | "frequency" | "originDeparture">, airport: Airport, allowLandingTransition = false): string | null {
  if (!a.radar) return "Radar traffic requires radar navigation.";
  if (a.radar.arrival) {
    const arrival = a.radar.arrival;
    return !a.radar.departure && arrival.runway === a.runway && runwayEnds(airport).some(end => end.id === arrival.runway) && radarArrivalFrequency(a.frequency) && a.radar.transferred && a.altitude === airport.elevation && a.mode === (["stopped", "vacated"].includes(arrival.phase) ? "parked" : arrival.phase === "vacating" ? "taxi" : "rollout") ? null : "Landing traffic must remain on its arrival runway.";
  }
  if (a.radar.departure && (a.radar.flight || a.radar.departure.touchAndGo) && (a.mode === "takeoff" || a.mode === "rollout" && a.radar.departure.touchAndGo)) {
    if (a.radar.departure.runway !== a.runway || !runwayEnds(airport).some(end => end.id === a.radar!.departure!.runway)) return "Choose a departure runway at this airport.";
    return a.altitude >= (a.originDeparture?.elevation ?? airport.elevation) ? null : "Takeoff traffic cannot start below airport elevation.";
  }
  const pattern = a.radar.patternJoin && a.radar.patternJoin.status !== "unable" && a.radar.guidance === "vectors" && a.radar.transferred && radarArrivalFrequency(a.frequency) && ["pattern", "go-around"].includes(a.mode);
  // A captured final can reach runway elevation before the next movement step
  // changes its mode to rollout. Saved sessions/replays must remain readable,
  // while new scenario seeds and manual edits still require an airborne start.
  if (allowLandingTransition && a.mode === "heading" && !a.radar.departure && a.altitude === airport.elevation
    && radarArrivalFrequency(a.frequency) && a.radar.transferred && a.radar.navigation === "approach" && a.radar.captured && a.radar.cleared) return null;
  return (a.mode === "heading" || pattern) && !a.radar.departure && a.altitude > airborneElevation(a, airport) ? null : "Radar traffic must be airborne or taking off from this airport.";
}
/** Unspecified radar arrivals default to landing; explicit departures and onward destinations check in. */
export function radarLandingIntention(a: Aircraft, airport: Airport): boolean {
  if (!a.radar || a.radar.flight === "departure" || a.radar.departure || a.radar.arrival) return false;
  if (a.destination && a.destination.name !== airport.icao && Math.hypot(a.destination.point.x, a.destination.point.y) > 5) return false;
  return a.radar.flight === "return" || !!a.radar.requestedApproach || !!a.radar.expected || a.landing === "full-stop";
}
export function radarRequestedApproach(a: Aircraft, environment: RadarEnvironment) {
  const assigned = environment.approaches.find(p => p.id === (a.radar?.requestedApproach ?? a.radar?.expected));
  if (assigned) return assigned;
  const runway = a.flightPlan.at(-1)?.name?.match(/^RW(\d{1,2}[LRC]?)$/)?.[1];
  return runway ? environment.approaches.find(p => p.type === "ils" && p.runway === runway) : undefined;
}
export function radarIntentionText(a: Aircraft, airport: Airport, environment: RadarEnvironment) {
  if (a.radar?.flight === "departure") return `requesting departure to the ${a.radar.departureDirection ?? "north"}`;
  const approach = radarRequestedApproach(a, environment);
  if (approach) return `requesting ${approach.type === "ils" ? "ILS" : approach.type === "gps" ? "GPS" : "visual"} approach at ${airport.icao}`;
  return a.radar?.navigation === "route" ? "continuing on route" : "awaiting vectors";
}
export function radarInstructionError(a: Aircraft, c: Instruction, airport: Airport, environment: RadarEnvironment): string | null {
  if (a.radar?.departure && c.type !== "radio") return "Takeoff is automatic. Wait for the pilot's radar check-in at 1,000 ft AGL.";
  if (c.type === "radar-speed") return !a.radar && a.frequency === "tower" ? validRadarSpeed(c) && c.mode !== "maintain" ? null : "Choose a Tower speed instruction." : !a.radar || !airborne(a, airport) ? "This instruction requires airborne Approach or Center traffic." : validRadarSpeed(c) ? null : "Choose a listed speed instruction.";
  if (!["vector", "expect-approach", "missed-approach", "route"].includes(c.type)) return null;
  if (!a.radar || !airborne(a, airport)) return "This instruction requires airborne Approach or Center traffic.";
  if (c.type === "vector") {
    if (c.heading === undefined && !c.altitude && !c.approachId) return "Choose a heading, altitude or approach clearance.";
    if (c.approachId && ((a.assigned?.expected ?? a.radar.expected) !== c.approachId || !environment.approaches.some(item => item.id === c.approachId))) return "The expected approach has changed. Select the current approach before clearing it.";
  }
  if ((c.type === "vector" || c.type === "missed-approach") && c.heading !== undefined && (!Number.isFinite(c.heading) || c.heading < 0 || c.heading > 360)) return "Choose a heading from 0 to 360.";
  if ((c.type === "vector" || c.type === "missed-approach" || c.type === "route") && c.altitude && (!validAltitude(c.altitude) || altitudeFeet(c.altitude) <= airport.elevation)) return "Choose an available altitude above the airport elevation.";

  if (c.type === "expect-approach" && c.approachId && !environment.approaches.some(item => item.id === c.approachId)) return "This approach is unavailable in the pinned training environment.";
  if (c.type === "route" && (!Number.isInteger(c.index) || c.index < 0 || c.index >= a.flightPlan.length)) return "Choose an existing route waypoint.";
  if (c.type === "route" && c.name !== undefined && c.name !== routeWaypointName(a, environment, c.index)) return "The selected flight-plan waypoint has changed. Select it again.";
  if (c.type === "route" && c.point && distance(c.point, a.flightPlan[c.index]) > .000001) return "The selected flight-plan waypoint has changed. Select it again.";
  return null;
}
export function assignRadar(a: Aircraft, c: Instruction, airport: Airport, environment: RadarEnvironment) {
  const r = a.radar!;
  const gps = c.type === "vector" && c.approachId ? environment.approaches.find(p => p.id === c.approachId && p.type === "gps") : undefined;
  const gpsJoin = gps && c.type === "vector" ? gpsApproachJoin(a, gps, approachGeometry(airport, gps.runway,gps), c.heading === undefined ? undefined : magneticToTrue(c.heading, airport)).join : undefined;
  if (r.navigation === "missed") r.missedApproach = true; // Older snapshots have no phase flag.
  // A vertical instruction must leave the lateral clearance and banked turn intact.
  if (c.type === "vector" && c.heading === undefined && !c.approachId) {
    if (c.altitude) {delete r.climbUntilAssigned; r.targetAltitude = {...c.altitude}; delete r.altitudeFromRoute; r.altitudeAssignedFrom = a.altitude; delete a.starDescent; delete a.followRouteAltitudes;}
    return;
  }
  delete r.gpsApproach;
  if (c.type === "expect-approach" || c.type === "route" || c.type === "missed-approach" || c.type === "vector" && (c.heading !== undefined || c.approachId)) {delete r.localizerIntercept; delete r.missedReason;}
  delete r.patternJoin;
  if (c.type === "expect-approach" || c.type === "route" || c.type === "missed-approach" || c.type === "vector" && c.heading !== undefined) delete r.finalSpeedProfile;
  if (c.type === "route" || c.type === "missed-approach" || c.type === "vector") delete r.routeSpeed;
  if (c.type === "expect-approach" || c.type === "vector" && (c.approachId || c.heading !== undefined) || c.type === "missed-approach" || c.type === "route") delete r.approachIntercept;
  if (c.type === "vector" || c.type === "missed-approach" || c.type === "route" && c.altitude) delete a.starDescent;
  if (c.type === "vector" || c.type === "missed-approach" || c.type === "route" && c.altitude) delete a.followRouteAltitudes;
  if (c.type === "expect-approach") {
    if (c.navigation === "filed" && a.flightPlan[r.routeIndex]) r.navigation = "route";
    r.expected = c.approachId ?? undefined; r.guidance = c.vectors ? "vectors" : undefined;
    if (c.vectors) a.runway = c.runway ?? a.runway ?? defaultRunway(airport);
    r.cleared = undefined; r.captured = false; r.localizer = false; r.glideslope = false; r.clearanceAltitudeChecked = false; if (r.navigation === "approach") r.navigation = "heading";
  } else if (c.type === "vector") {
    if (c.heading !== undefined) {a.targetHeading = magneticToTrue(c.heading, airport); r.navigation = "heading"; r.cleared = undefined; r.captured = false; r.localizer = false; r.glideslope = false; r.clearanceAltitudeChecked = false;}
    if (c.altitude) {delete r.climbUntilAssigned; r.targetAltitude = {...c.altitude}; delete r.altitudeFromRoute; r.altitudeAssignedFrom = a.altitude;}
    if (c.approachId) {delete r.missedApproach; r.navigation = "approach"; r.expected = c.approachId; r.cleared = c.approachId; r.captured = false; r.localizer = false; r.glideslope = false; r.clearanceAltitudeChecked = false;
      const approach = environment.approaches.find(item => item.id === c.approachId);
      if (approach && (!approach.airportIcao || approach.airportIcao === airport.icao)) a.runway = approach.runway;
      if (gpsJoin) {r.gpsApproach = gpsJoin; r.routeIndex = gpsJoin.index;}
    }
  } else if (c.type === "route") {
    r.navigation = "route"; r.routeIndex = c.index;
    a.targetHeading = radarHeading(a.position, a.flightPlan[c.index]);
    if (c.altitude) {delete r.climbUntilAssigned; r.targetAltitude = {...c.altitude}; delete r.altitudeFromRoute; r.altitudeAssignedFrom = a.altitude;}
    r.cleared = undefined; r.captured = false; r.localizer = false; r.glideslope = false; r.clearanceAltitudeChecked = false;
    a.clearedToLand = false; a.clearedForOption = false;
  }
  else if (c.type === "missed-approach") {
    const expected = environment.approaches.find(item => item.id === (r.cleared ?? r.expected));
    if (expected && (!expected.airportIcao || expected.airportIcao===airport.icao)) a.runway = expected.runway;
    r.guidance = undefined;
    if (c.heading !== undefined) a.targetHeading = magneticToTrue(c.heading, airport);
    r.navigation = "missed"; r.missedApproach = true; r.cleared = undefined; r.captured = false; r.localizer = false; r.glideslope = false; r.clearanceAltitudeChecked = false; delete r.climbUntilAssigned; r.targetAltitude = {...c.altitude}; delete r.altitudeFromRoute; r.altitudeAssignedFrom = a.altitude;
    r.speed = undefined;
    a.clearedToLand = false; a.clearedForOption = false; a.targetSpeed = automaticRadarTarget(a); a.speedMode = "auto";
  }
  a.mode = "heading"; a.extended = false; a.sequence = undefined; a.leavingCircuit = true;
}
/** Tower owns the landing clearance after handoff; the selected intention owns the outcome. */
export function touchdownRadar(a: Aircraft, airport: Airport, runway: Aircraft["runway"]) {
  const r = a.radar!, g = approachGeometry(airport, runway!);
  delete r.gpsApproach;
  a.bankAngle = 0;
  delete r.missedApproach;
  r.requestedApproach ??= r.cleared ?? r.expected;
  r.navigation = "heading"; r.cleared = undefined; r.expected = undefined;
  r.captured = false; r.localizer = false; r.glideslope = false;
  delete r.patternJoin; delete r.speed; delete r.report;
  a.taxiPath = []; a.taxiIndex = 0; a.releasedHold = null;
  delete a.originDeparture;
  a.runway = runway; a.altitude = airport.elevation; a.mode = "rollout";
  a.heading = a.targetHeading = g.heading; a.speedMode = "auto";
  a.clearedToLand = false; a.clearedForOption = false; a.extended = false;
  if (a.landing === "touch-and-go") {
    delete r.arrival; r.departure = {runway: runway!, phase: "roll", touchAndGo: true};
    r.targetAltitude = {unit: "feet", value: Math.max(5000, Math.ceil((airport.elevation + 3000) / 500) * 500)};
    delete r.altitudeFromRoute; r.altitudeAssignedFrom = airport.elevation; a.targetSpeed = automaticRadarTarget(a);
  } else {delete r.departure; delete r.targetAltitude; delete r.altitudeFromRoute; r.arrival = {runway: runway!, phase: "rollout"}; a.targetSpeed = 0;}
}
function automaticMissed(a: Aircraft, airport: Airport, environment: RadarEnvironment, reason: string) {
  const altitude = ALTITUDES.find(value => altitudeFeet(value) >= Math.max(a.altitude, 5000, airport.elevation + 2000)) ?? ALTITUDES[ALTITUDES.length - 1];
  const approach = environment.approaches.find(p => p.id === (a.radar!.cleared ?? a.radar!.expected));
  const heading = trueToMagnetic(approach?.missedHeading ?? approachGeometry(airport, a.runway ?? defaultRunway(airport)).heading, airport);
  assignRadar(a, {type: "missed-approach", altitude, heading}, airport, environment);
  a.radar!.report = "missed"; a.radar!.missedReason = reason;
}
/** Predict only this clearance's flown join/final, using the actual banked guidance.
 * No filed legs or looping failed intercepts are credited as descent distance.
 * Runs at readback time, never in the live movement loop. */
export function visualApproachTrackMiles(a: Aircraft, command: Extract<Instruction, {type: "vector"}>, airport: Airport, environment: RadarEnvironment, weather?: ExerciseWeather): number {
  const approach = environment.approaches.find(p => p.id === command.approachId)!;
  const geometry = approachGeometry(airport, approach.runway, approach);
  const direct = distance(a.position, geometry.threshold);
  const predicted = structuredClone(a);
  assignRadar(predicted, command, airport, environment);
  // Predict the same final without a Tower landing or occupancy decision.
  predicted.frequency = "approach"; predicted.radar!.transferred = false;
  let travelled = 0;
  for (let seconds = 0; seconds < 600; seconds += .5) {
    const before = {...predicted.position};
    moveRadar(predicted, .5, airport, environment, [], false, weather);
    travelled += distance(before, predicted.position);
    const dx = predicted.position.x - geometry.threshold.x, dy = predicted.position.y - geometry.threshold.y;
    const along = dx * geometry.vector.x + dy * geometry.vector.y;
    const lateral = Math.abs(dx * -geometry.vector.y + dy * geometry.vector.x);
    if (along >= -.1 && along <= .1 && lateral <= .05) return travelled + distance(predicted.position, geometry.threshold);
    if (predicted.radar!.navigation !== "approach") break;
  }
  return direct;
}

export function visualClearanceUnable(a: Aircraft, command: Instruction, airport: Airport, environment: RadarEnvironment, weather?: ExerciseWeather): string | null {
  if (!a.radar || command.type !== "vector" || !command.approachId) return null;
  const approach = environment.approaches.find(p => p.id === command.approachId);
  if (approach?.type !== "visual") return null;
  const required = visualDescentDistance(a.altitude - (approach.elevation ?? airport.elevation));
  const available = visualApproachTrackMiles(a, command, airport, environment, weather);
  return required > available + 1e-6 ? `Insufficient visual approach track miles: ${required.toFixed(2)} NM required, ${available.toFixed(2)} NM available (4° above 1,000 ft, 3° below).` : null;
}
export function moveRadar(a: Aircraft, dt: number, airport: Airport, environment: RadarEnvironment, traffic: Aircraft[] = [], automatic = false, weather?: ExerciseWeather) {
  const r = a.radar!;
  if (!a.active) return;
  // The airport engine handles mapped runway exits and ground traffic.
  if (r.arrival) return;
  if (r.departure) {
    a.mode = "takeoff";
    const g = a.originDeparture ? departureGeometry(a.originDeparture) : approachGeometry(airport, r.departure.runway);
    a.heading = g.heading; a.targetHeading = g.heading;
    if (a.speedMode !== "manual") a.targetSpeed = automaticRadarTarget(a);
    updateRadarSpeed(a, traffic, undefined, automaticRadarTarget(a), weather);
    a.speed = towards(a.speed, a.targetSpeed, acceleration(a) * dt);
    if (a.speed >= radarPerformance(a).rotation) r.departure.phase = "climb";
    if (r.departure.phase === "climb") a.altitude += climbRate(a) / 60 * dt;
    const stride = a.speed / 3600 * dt;
    a.position = {x: a.position.x + g.vector.x * stride, y: a.position.y + g.vector.y * stride};
    if (a.altitude >= (a.originDeparture?.elevation ?? airport.elevation) + 1000) {
      if (a.originDeparture) a.originDeparture.phase = "complete";
      const touchAndGo = r.departure.touchAndGo;
      delete r.departure; a.mode = "heading"; r.report = touchAndGo ? "touch-and-go" : "intentions";
      if (touchAndGo) {a.frequency = "approach"; r.returningToApproach = true; r.transferred = false;}
      if (a.speedMode !== "manual") a.targetSpeed = automaticRadarTarget(a);
    }
    return;
  }
  updateRouteConstraints(a);
  const clearedApproach = r.navigation === "approach" ? environment.approaches.find(p => p.id === r.cleared) : undefined;
  const finalApproach=clearedApproach ?? environment.approaches.find(p=>p.id===r.expected);
  const final = approachGeometry(airport, finalApproach?.runway ?? a.runway ?? defaultRunway(airport),finalApproach);
  const dx = a.position.x - final.threshold.x, dy = a.position.y - final.threshold.y;
  const along = dx * final.vector.x + dy * final.vector.y, lateral = Math.abs(dx * -final.vector.y + dy * final.vector.x);
  const expectedGps = !r.cleared && environment.approaches.find(p => p.id === r.expected && p.type === "gps");
  if (automatic && expectedGps && r.navigation === "route") {
    const fafIndex = gpsFinalApproachFix(a, expectedGps, final), faf = fafIndex === undefined ? undefined : a.flightPlan[fafIndex];
    if (fafIndex !== undefined && faf && r.routeIndex >= fafIndex && along >= (faf.x - final.threshold.x) * final.vector.x + (faf.y - final.threshold.y) * final.vector.y
      && lateral <= expectedGps.captureWidth && Math.abs(headingDifference(final.heading, a.heading)) <= 45) {
      automaticMissed(a, airport, environment, "Reached the final approach fix without a GPS approach clearance.");
      moveRadar(a, dt, airport, environment, traffic, automatic, weather); return;
    }
  }
  const finalDistance = along < 0 && lateral <= .5 && Math.abs(headingDifference(final.heading, a.heading)) <= 30 ? -along : undefined;
  const arrival = clearedApproach || r.expected || r.guidance === "vectors" || r.flight !== "departure" && !r.departure && a.landing === "full-stop";
  // Vectoring retains inbound speed off final. A cleared visual join uses the
  // approach profile during its turn so the aircraft can establish on final.
  const approachDistance = clearedApproach && r.captured && r.transferred && along >= 0 ? 0
    : clearedApproach?.type === "visual" && !r.captured ? distance(a.position, final.threshold)
      : arrival || r.finalSpeedProfile ? finalDistance : undefined;
  const automaticTarget = automaticRadarTarget(a, approachDistance);
  if (a.speedMode !== "manual") a.targetSpeed = automaticTarget;
  let groundTrack: number | undefined;
  let altitude = r.targetAltitude ? altitudeFeet(r.targetAltitude) : r.climbUntilAssigned ? (performanceFor(a)?.ceiling ?? 60000) : a.altitude;
  if (r.navigation === "route") {
    let point = a.flightPlan[r.routeIndex];
    const turnRadius = bankTurnLead(a.speed);
    const terminalHold = point?.hold && r.routeIndex === a.flightPlan.length - 1;
    const gpsFaf = expectedGps && gpsFinalApproachFix(a, expectedGps, final) === r.routeIndex;
    if (terminalHold && point.hold?.maxSpeed && distance(a.position, point) < a.speed / 60 * 3) a.targetSpeed = Math.min(a.targetSpeed, point.hold.maxSpeed);
    if (point && distance(a.position, point) <= (terminalHold ? Math.max(.05, a.speed / 3600 * dt) : gpsFaf ? Math.max(.005, a.speed / 3600 * dt) : Math.max(.15, turnRadius * .7))) {
      if (terminalHold) {enterPublishedHold(a, point); return;}
      point = a.flightPlan[++r.routeIndex];
    }
    updateRouteConstraints(a);
    altitude = r.targetAltitude ? altitudeFeet(r.targetAltitude) : r.climbUntilAssigned ? (performanceFor(a)?.ceiling ?? 60000) : a.altitude;
    if (point) groundTrack = a.targetHeading = radarHeading(a.position, point);
    else r.navigation = "heading";
  }
  if (a.starDescent && !a.followRouteAltitudes) altitude = Math.min(altitude, a.altitude);
  if (r.navigation === "approach" && r.cleared) {
    const approach = environment.approaches.find(item => item.id === r.cleared);
    if (approach) {
      const g = approachGeometry(airport, approach.runway,approach), dx = a.position.x - g.threshold.x, dy = a.position.y - g.threshold.y;
      const along = dx * g.vector.x + dy * g.vector.y, lateral = dx * -g.vector.y + dy * g.vector.x;
      const destinationElevation=approach.elevation??airport.elevation;
      const glideHeight = approach.type === "visual" ? destinationElevation + visualDescentHeight(Math.max(0, -along - (a.groundSpeed ?? a.speed) / 3600 * dt))
        : destinationElevation + 50 + Math.max(0, -along) * 6076.12 * Math.tan(approach.glideAngle * Math.PI / 180);
      // Existing saved ILS definitions also receive the extended LOC/GS range.
      const captureDistance = approach.type === "ils" ? Math.max(ILS_CAPTURE_DISTANCE_NM, approach.finalDistance) : approach.finalDistance;
      const onLocalizer = along < -.1 && along >= -captureDistance - 1e-8 && Math.abs(lateral) <= approach.captureWidth && Math.abs(headingDifference(g.heading, a.heading)) <= (approach.type === "ils" ? MAX_ILS_INTERCEPT : 45) + 1e-8;
      // Older saved approaches used one capture flag for both ILS axes.
      if (approach.type === "ils" && r.captured && r.glideslope === undefined) {r.localizer = true; r.glideslope = approach.glideslope!==false;}
      if (approach.type === "ils" && onLocalizer) r.localizer = true;
      if (approach.type === "ils") {
        const reason = missedLocalizerReason(a, along, lateral, Math.abs(headingDifference(g.heading, a.heading)), captureDistance);
        if (automatic && reason) {automaticMissed(a, airport, environment, reason); moveRadar(a, dt, airport, environment, traffic, automatic, weather); return;}
        if (automatic && approach.glideslope!==false && (r.localizer || r.captured) && r.clearanceAltitudeChecked && a.altitude > glideHeight + GLIDESLOPE_DEVIATION_FEET) {
          automaticMissed(a, airport, environment, "Above glideslope after localizer interception.");
          moveRadar(a, dt, airport, environment, traffic, automatic, weather); return;
        }
      }
      const gpsRouting = approach.type === "gps" && r.gpsApproach;
      if (gpsRouting && !r.captured) {
        const faf = a.flightPlan[gpsRouting.fafIndex];
        if (flyGpsRoute(a, approach, g)) r.captured = true;
        else if (!faf || r.routeIndex >= gpsRouting.fafIndex && along >= (faf.x - g.threshold.x) * g.vector.x + (faf.y - g.threshold.y) * g.vector.y + .25) {
          automaticMissed(a, airport, environment, "Unable to rejoin the flight plan before the final approach fix.");
          moveRadar(a, dt, airport, environment, traffic, automatic, weather); return;
        }
      }
      if (gpsRouting && !r.captured) groundTrack = a.targetHeading;
      const checkAltitude = !r.clearanceAltitudeChecked && (gpsRouting ? r.captured : approach.type !== "ils" || onLocalizer);
      const clearanceHeight = approach.type === "visual" ? destinationElevation + visualDescentHeight(Math.hypot(dx, dy)) : approach.type === "ils" ? glideHeight : destinationElevation + 50 + Math.hypot(dx, dy) * 6076.12 * Math.tan(approach.glideAngle * Math.PI / 180);
      if (gpsRouting && !r.captured) altitude = Math.min(altitude, clearanceHeight);
      if (automatic && checkAltitude && approach.type === "visual") r.clearanceAltitudeChecked = true;
      if (automatic && checkAltitude && approach.type !== "visual") {
        r.clearanceAltitudeChecked = true;
        // Visual feasibility is checked before the pilot accepts the clearance.
        const heightTolerance = gpsRouting ? 25 : 0;
        if ((approach.type!=="ils" || approach.glideslope!==false) && a.altitude > clearanceHeight + heightTolerance + 1e-6) {
          automaticMissed(a, airport, environment, approach.type === "ils" ? "Above glideslope at localizer interception." : gpsRouting ? "Above the GPS glide path at the final approach fix." : "Above the approach glide path at clearance.");
          moveRadar(a, dt, airport, environment, traffic, automatic, weather); return;
        }
      }
      if (approach.type === "ils") {
        // LOC steers independently while the assigned altitude intercepts GS.
        if (approach.glideslope!==false && !r.glideslope && onLocalizer && Math.abs(a.altitude - glideHeight) <= 25) r.glideslope = true;
        r.captured = !!r.localizer && (approach.glideslope===false || !!r.glideslope);
      } else if (!gpsRouting) {
        r.approachIntercept ??= {seconds: 0, entered: false};
        r.approachIntercept.seconds += dt;
        if (along < -.1 && along >= -approach.finalDistance) r.approachIntercept.entered = true;
        if (!r.captured && onLocalizer && (approach.type === "visual" || a.altitude <= glideHeight + 500)) r.captured = true;
        if (!r.captured && along < -.1 && along >= -approach.finalDistance) {
          // GPS/visual clearances join the schematic final without another vector.
          // Intercept the course ahead of the aircraft, anticipating the banked
          // turn before crossing final. Chasing a fixed point abeam the aircraft
          // crosses the centerline at 90 degrees and can produce endless orbits.
          const lookAhead = Math.max(.75, bankTurnLead(a.speed));
          const intercept = Math.max(-45, Math.min(45, Math.atan2(lateral, lookAhead) * 180 / Math.PI));
          groundTrack = a.targetHeading = (g.heading + intercept + 360) % 360;
          altitude = Math.min(altitude, clearanceHeight);
        }
        // An uncleared capture cannot silently continue past the runway or
        // outside the published final forever. Keep the normal missed lifecycle.
        if (!r.captured && (r.approachIntercept.entered && (along >= -.1 || along < -approach.finalDistance - 1) || r.approachIntercept.seconds > 300)) {
          automaticMissed(a, airport, environment, "Unable to establish on final before the approach limit.");
          moveRadar(a, dt, airport, environment, traffic, automatic, weather); return;
        }
      }
      if (r.captured || approach.type === "ils" && r.localizer) {
        const lookAhead = Math.max(1, bankTurnLead(a.speed));
        const trackAlong = Math.min(1, along + lookAhead);
        groundTrack = a.targetHeading = radarHeading(a.position, {x: g.threshold.x + g.vector.x * trackAlong, y: g.threshold.y + g.vector.y * trackAlong});
        if (r.captured && (approach.type!=="ils" || approach.glideslope!==false)) altitude = Math.min(a.altitude, along < 0 ? glideHeight : approach.type === "visual" ? destinationElevation : destinationElevation + Math.max(0, 50 - along * 500));
        const towerLanding = r.transferred && radarArrivalFrequency(a.frequency) && r.captured;
        if (towerLanding && along >= -.65 && along < .1 && runwayGoAroundDue(a.altitude, destinationElevation, along) && runwayOccupied(airport, approach.runway, traffic, a.id)) {
          automaticMissed(a, airport, environment, "Landing runway is occupied.");
          moveRadar(a, dt, airport, environment, traffic, automatic, weather); return;
        }
        if (towerLanding && along >= .1 && Math.abs(lateral) < .012 && a.altitude <= airport.elevation + 5) {
          touchdownRadar(a, airport, approach.runway); return;
        }
        if (along >= -.05 && !towerLanding || along >= distance(g.threshold, approach.departure ?? airportRunways(airport).find(pair => pair.ends.some(end => end.id === approach.runway))!.ends.find(end => end.id !== approach.runway)!.point)) {
          automaticMissed(a, airport, environment, towerLanding ? "Unable to complete landing before the runway end." : "Reached the runway without completing the approach."); altitude = altitudeFeet(r.targetAltitude!);
        }
      }
    }
  }
  a.altitude = towards(a.altitude, altitude, (altitude < a.altitude ? descentRate(a) : climbRate(a)) / 60 * dt);
  // Transferred arrivals complete final; Approach resumes control during missed-approach climbout.
  if (r.navigation === "missed" && radarArrivalFrequency(a.frequency) && a.altitude >= Math.min(airport.elevation + 1000, altitude)) {
    a.frequency = "approach"; r.returningToApproach = true; r.transferred = false; r.report = "missed";
  }
  updateRadarSpeed(a, traffic, finalDistance, automaticTarget, weather);
  a.speed = towards(a.speed, a.targetSpeed, acceleration(a) * dt);
  if (groundTrack !== undefined) a.targetHeading = headingForGroundTrack(groundTrack, a, weather);
  turnAircraft(a, dt);
  const stride = a.speed / 3600 * dt, radians = a.heading * Math.PI / 180;
  a.position = {x: a.position.x + Math.sin(radians) * stride, y: a.position.y + Math.cos(radians) * stride};
}
export function altitudeTransmission(a: Aircraft, altitude: Altitude) {
  const change = altitudeFeet(altitude) > a.altitude + 50 ? "climb and maintain" : altitudeFeet(altitude) < a.altitude - 50 ? "descend and maintain" : "maintain";
  return `${change} ${altitudeLabel(altitude)}`;
}
export function turnTransmission(a: Aircraft, heading: number, airport: Airport) {
  const target = roundedHeading(heading);
  return `turn ${headingDifference(magneticToTrue(target, airport), a.heading) < 0 ? "left" : "right"} heading ${String(target || 360).padStart(3, "0")}`;
}
export function checkInTransmission(a: Aircraft, facility?: string) {
  const altitude = Math.round(a.altitude / 100) * 100;
  return `${facility ? facility + ", " : ""}${a.callsign}, with you${altitude ? ` at ${altitude.toLocaleString("en-US")}ft` : ""}${a.arrivalProcedure ? `, descending via ${arrivalProcedureName(a.arrivalProcedure)} arrival` : ""}`;
}
export function radarInstructionText(a: Aircraft, c: Instruction, environment: RadarEnvironment, airport: Airport): string | undefined {
  if (c.type === "radar-speed") return radarSpeedText(a, c);
  if (c.type === "heading") return turnTransmission(a, c.value, airport);
  if (c.type === "vector") {
    const p = environment.approaches.find(p => p.id === c.approachId);
    const clearance = p ? p.type === "ils" ? `${c.standalone ? "" : `maintain ${c.altitude ? altitudeLabel(c.altitude) : a.radar?.targetAltitude ? altitudeLabel(a.radar.targetAltitude) : Math.round(a.altitude)} until established on the localizer, `}cleared ILS runway ${p.runway} approach` : p.type === "gps" ? `cleared GPS ${c.standalone ? "approach runway" : "runway"} ${p.runway}${c.standalone ? "" : " approach"}` : `cleared visual approach runway ${p.runway}` : "";
    return [c.heading === undefined ? "" : turnTransmission(a, c.heading, airport), c.altitude && !c.standalone ? altitudeTransmission(a, c.altitude) : "", clearance].filter(Boolean).join(", ");
  }
  if (c.type === "missed-approach") return `execute missed approach, ${c.heading === undefined ? "" : turnTransmission(a, c.heading, airport) + ", "}${altitudeTransmission(a, c.altitude)}`;
  if (c.type === "expect-approach") {
    const p = environment.approaches.find(p => p.id === c.approachId), runway = p?.runway ?? c.runway ?? a.runway;
    if (c.vectors) return `expect vectors for runway ${runway} at ${p?.airportName ?? environment.airportName ?? "destination"}`;
    return p ? `${c.navigation === "filed" ? "continue as filed, expect the" : "expect vectors for the"} ${p.type === "visual" ? "visual" : p.type.toUpperCase()} approach runway ${p.runway} at ${p?.airportName ?? environment.airportName ?? "destination"}` : "unable to provide services";
  }
  if (c.type === "route") return `proceed direct ${routeWaypointName(a, environment, c.index)}${c.altitude ? `, ${altitudeTransmission(a, c.altitude)}` : ""}`;
}
