import {facilityActive} from "./facility-activity";
import {visualClearanceUnable} from "./radar";
import {aircraftPosition} from "./positions";
import {availableHandoffs, environmentWithDestinations, freshFacilityEnvironment} from "./aviation";
import {advancePerformance, climbRate, descentRate, acceleration, rotationSpeed, performanceFor, headingForGroundTrack, densityRatio} from "./aircraft-performance";
import {recordControllerAssignment} from "./controller-state";
import {startConflict, prepareConflicts, conflictCommand, aircraftCollisionGroups, removeConflictAircraft} from "./training-conflicts";
import {groundReady} from "./ground-ready";
import {magneticToTrue, trueToMagnetic} from "./magnetic-headings";
import {moveOwnRoute} from "./command-navigation";
import {crossingHold, runwayContinuation} from "./command-ground";
import {advanceAirportSighting, airportSightingReady} from "./airport-sighting";
import {controllerInstruction, diversionRequestDestination} from "./controller-message-context";
import {assignReference, moveReference, pilotReadback, referenceInstructionError} from "./reference-commands";
import {turnAircraft, bankTurnLead} from "./banked-turns";
import {groundRouteError, groundRouteJoin} from "./ground-route";
import {planTaxiRoute, planParkingRoute} from "./taxi-routing";
import {GROUND, groundGuidance, groundConflict, resolveGroundPriorities, moveGround, planPushback, runwayTurn, type GroundGuidance} from "./ground-movement";
import {currentAtisOptions, atisFrequencies, atisSelectionText} from "./atis-options";
import {applyTaxiPathEdit} from "./taxi-path-editing";
import {callsignConflict, reserveCallsigns} from "./callsigns";
import {assignRadar, touchdownRadar, checkInTransmission, moveRadar, radarAircraft, radarTakeoffAircraft, radarTrafficStateError, radarIntentionText, radarRequestedApproach, radarEnvironmentFor, radarInstructionError, radarInstructionText, roundedHeadingInstruction} from "./radar";
import {runwayGoAroundDue, runwayLateralClear, runwayOccupied} from "./runway-safety";
import {automaticRadarUnable, headingOnlyUnable} from "./radar-safety";
import {assignRadarSpeed, updateRadarSpeed, radarPerformance} from "./radar-speed";
import {gpsApproachJoin} from "./gps-approach";

import {controlledFrequencies, defaultAirport, getAirport, airportRunways, runwayEnds, defaultRunway, airportSelection, airportCallsign, frequenciesFor, simulatedMetar, runwayReferenceError, trainingMode, type AirportSelection} from "./airports";
import {catalogFor, positionReportText} from "./catalog";
import {MAX_AIRCRAFT, radarArrivalFrequency, commandHasReadback, DEFAULTS, radarControlFrequency, intentionsOf, EXERCISE_WEATHER as DEFAULT_WEATHER, emptyAtis, pendingCommands, pendingPilotMessage, unreadMessages, type Aircraft, type Airport, type Atis, type Envelope, type Exercise, type ExerciseWeather, type Frequency, type Instruction, type Message, type Leg, type Point, type Runway, type SpeedPhase} from "./model";


export function createAirportEngine(AIRPORT: Airport, selection: AirportSelection = {}) {
const EXERCISE_WEATHER: ExerciseWeather = selection.weather ?? DEFAULT_WEATHER;
const radarEnvironment = environmentWithDestinations(AIRPORT,{...(selection.radarEnvironment ?? radarEnvironmentFor(AIRPORT)), airportName: airportCallsign(AIRPORT)}, selection.traffic);
const DEFAULT_RUNWAY = defaultRunway(AIRPORT), FREQUENCIES = frequenciesFor(AIRPORT), METAR = simulatedMetar(AIRPORT, EXERCISE_WEATHER);
const {pilotRequests, pilotRequestText, resolvePilotRequest} = catalogFor(AIRPORT, radarEnvironment, EXERCISE_WEATHER);
const radians = Math.PI / 180;
// Begin the base/final turn one base-speed turn radius beyond the desired join.
// Otherwise turn anticipation establishes final almost a mile too close in.
const defaultBaseDistance = (a: Pick<Aircraft, "speedTargets">) => DEFAULTS.finalLength + bankTurnLead(a.speedTargets?.base ?? 180) * 1.2;

const normalizeHeading = (heading: number) => (heading % 360 + 360) % 360;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const bearing = (a: Point, b: Point) => normalizeHeading(Math.atan2(b.x - a.x, b.y - a.y) / radians);
const add = (p: Point, vector: Point, scale: number): Point => ({x: p.x + vector.x * scale, y: p.y + vector.y * scale});
const approach = (value: number, target: number, rate: number) => value + Math.sign(target - value) * Math.min(Math.abs(target - value), rate);

function runwayGeometry(runway: Runway = DEFAULT_RUNWAY) {
  const pair = airportRunways(AIRPORT).find(pair => pair.ends.some(end => end.id === runway));
  if (!pair) throw new Error("Runway is not in this airport snapshot.");
  const threshold = pair.ends.find(end => end.id === runway)!;
  const departure = pair.ends.find(end => end.id !== runway)!;
  const heading = bearing(threshold.point, departure.point);
  // Keep a 0.04 NM margin beyond the pavement edge, capped at the legacy
  // clearance distance. Pinned compact-airport overrides remain at least 50 ft
  // outside the pavement; they are training boundaries, not published hold lines.
  const clearance = pair.exitClearanceFeet
    ? Math.max(pair.exitClearanceFeet, (pair.widthFeet ?? 0) / 2 + 50) / 6076
    : pair.widthFeet ? Math.min(.06, .04 + pair.widthFeet / (2 * 6076)) : .06;
  return {threshold: threshold.point, departure: departure.point, heading, vector: {x: Math.sin(heading * radians), y: Math.cos(heading * radians)}, clearance};
}
/** IAS targets; ground movement keeps its separate taxi/rollout speeds. */

function speedProfile(a: Aircraft): {segment: SpeedPhase; minimum: number; maximum: number; target: number} {
  let profile: ReturnType<typeof speedProfile>;
  if (a.mode === "takeoff" || a.mode === "go-around") profile = {segment: "upwind-downwind", minimum: 210, maximum: 230, target: 220};
  else if (a.mode !== "pattern" || a.leavingCircuit) profile = {segment: "inbound", minimum: 250, maximum: 250, target: 250};
  else if (["upwind", "crosswind", "downwind"].includes(a.leg)) profile = {segment: "upwind-downwind", minimum: 210, maximum: 230, target: 220};
  else if (a.leg === "base") profile = {segment: "base", minimum: 180, maximum: 200, target: 180};
  else {
    const finalDistance = -runwayCoordinates(a.position, runwayGeometry(a.runway ?? DEFAULT_RUNWAY)).along;
    profile = finalDistance <= 2 + 1e-8 ? {segment: "vref", minimum: 135, maximum: 135, target: 135}
      : {segment: "final", minimum: 140, maximum: 180, target: finalDistance <= 4.5 + 1e-8 ? 160 : 180};
  }
  const p=performanceFor(a);
  if(p){const target=profile.segment==="vref"?p.landing:profile.segment==="inbound"?p.inbound:profile.segment==="upwind-downwind"?p.climbSpeed:profile.segment==="base"?Math.min(p.inbound,p.landing*1.3):Math.min(p.inbound,p.landing*1.15); profile={...profile,target,minimum:p.min,maximum:p.max};}
  const fixed = a.speedTargets?.[profile.segment];
  return fixed == null ? profile : {...profile, target: fixed, minimum: fixed, maximum: fixed};
}

function automaticSpeed(a: Aircraft) {
  if (!a.active) return;
  // Resume old full-stop snapshots using the same mapped exits as new arrivals.
  if (a.radar?.arrival?.phase === "stopped") {
    if (a.mode === "taxi" || a.mode === "lineup") a.radar.arrival.phase = "vacating";
    else {
      // A legacy stop beyond the last exit must not become an automatic overrun or back-taxi.
      if (a.holding || !runwayExitRoute(a, "any").path) {a.holding = true; a.speed = a.targetSpeed = 0; return;}
      a.radar.arrival.phase = "rollout"; a.mode = "rollout";
    }
  }
  if (a.radar && !a.radar.arrival && (!a.radar.patternJoin || a.radar.patternJoin.status === "unable")) return;
  if (a.speedMode !== "manual" && ["pattern", "heading", "go-around", "takeoff"].includes(a.mode)) a.targetSpeed = speedProfile(a).target;
}

function patternTargets(aircraft: Pick<Aircraft, "runway" | "hand" | "patternFinalDistance" | "speedTargets">): Record<Leg, Point> {
  const {threshold, departure, vector} = runwayGeometry(aircraft.runway ?? DEFAULT_RUNWAY);
  const side = aircraft.hand === "left" ? {x: -vector.y, y: vector.x} : {x: vector.y, y: -vector.x};
  const upwind = add(departure, vector, DEFAULTS.upwindLength);
  const final = add(threshold, vector, -Math.max(defaultBaseDistance(aircraft), aircraft.patternFinalDistance ?? 0));
  return {upwind, crosswind: add(upwind, side, DEFAULTS.patternWidth), downwind: add(final, side, DEFAULTS.patternWidth), base: final, final: threshold};
}

/** Tower handoff of vectored traffic joins a reachable leg without relocating it. */
function joinRadarPattern(a: Aircraft) {
  const r = a.radar;
  if (!r || r.guidance !== "vectors" || !radarArrivalFrequency(a.frequency) || !r.transferred) return;
  const g = runwayGeometry(a.runway ?? DEFAULT_RUNWAY), points = patternTargets(a);
  const previous: Record<Leg, Point> = {upwind: g.threshold, crosswind: points.upwind, downwind: points.crosswind, base: points.downwind, final: points.base};
  const legs: Leg[] = ["upwind", "crosswind", "downwind", "base", "final"];
  const radius = Math.max(.25, bankTurnLead(a.speed));
  const height = AIRPORT.elevation + DEFAULTS.patternHeight;
  const candidates = legs.flatMap((leg, index) => {
    const start = previous[leg], end = points[leg], length = distance(start, end);
    const vector = {x: (end.x - start.x) / length, y: (end.y - start.y) / length};
    const along = (a.position.x - start.x) * vector.x + (a.position.y - start.y) * vector.y;
    if (along > length - radius * .5) return [];
    const entry = add(start, vector, Math.max(0, along)), travel = distance(a.position, entry);
    const turn = Math.abs(((bearing(start, end) - a.heading + 540) % 360) - 180);
    if (leg === "final" && (turn > 30 || travel > 1 || distance(a.position, g.threshold) < Math.max(2, radius * 2) || a.altitude > height + 300)) return [];
    const remaining = distance(entry, end) + legs.slice(index + 1).reduce((sum, next) => sum + distance(previous[next], points[next]), 0);
    const secondsAvailable = (travel + remaining) / Math.max(a.speed, 180) * 3600;
    const secondsToHeight = Math.abs(a.altitude - height) / ((a.altitude > height ? descentRate(a) : climbRate(a)) / 60);
    if (secondsToHeight > secondsAvailable) return [];
    return [{leg, score: travel + radius * turn / 90}];
  }).sort((a, b) => a.score - b.score);
  const reason = !a.active || a.altitude <= AIRPORT.elevation ? "Aircraft is not airborne."
    : distance(a.position, g.threshold) > radarEnvironment.range ? "Aircraft is outside the training sector."
    : !candidates.length ? "Current altitude and heading leave no reachable pattern entry; more vectors or descent are required." : undefined;
  if (reason) {r.patternJoin = {status: "unable", reason}; return;}
  r.patternJoin = {status: "joining"}; r.captured = false; r.localizer = false; r.glideslope = false;
  r.targetAltitude = undefined; delete r.altitudeFromRoute; r.altitudeAssignedFrom = undefined; r.speed = undefined;
  a.mode = "pattern"; a.leg = candidates[0].leg; a.leavingCircuit = false; a.extended = false; a.speedMode = "auto";
  delete a.transitionAltitude; clearLanding(a);
  automaticSpeed(a);
}

function updateRadarFrequency(a: Aircraft) {
  const r = a.radar;
  if (!r) return;
  r.transferred = a.frequency !== radarControlFrequency(a);
  if (!r.transferred) r.report = "check-in";
  if (radarArrivalFrequency(a.frequency)) joinRadarPattern(a);
  else if (r.patternJoin) {delete r.patternJoin; a.mode = "heading"; a.leavingCircuit = true;}
}

function newAircraft(id: string, airborne: boolean): Aircraft {
  const geometry = runwayGeometry();
  const aircraft: Aircraft = {id, callsign: airborne ? "Speedbird 124" : "Easy 571", type: "A320", position: airborne ? add(geometry.threshold, geometry.vector, -5) : {x: 0.5, y: -0.25},
    heading: geometry.heading, targetHeading: geometry.heading, speed: airborne ? DEFAULTS.airSpeed : 0, targetSpeed: airborne ? DEFAULTS.airSpeed : 0,
    altitude: AIRPORT.elevation + (airborne ? DEFAULTS.patternHeight : 0), frequency: airborne ? "tower" : "ground", runway: DEFAULT_RUNWAY, lastRunway: null,
    hand: "left", leg: "final", mode: airborne ? "pattern" : "parked", extended: false, landing: "touch-and-go", clearedToLand: false,
    taxiPath: [], taxiIndex: 0, holding: false, releasedHold: null, flightPlan: [], trail: [], pending: 0, active: true, color: null, tag: "auto", reminderAt: null};
  const mode = trainingMode({...airportSelection(AIRPORT), ...selection});
  return mode === "local" ? aircraft : airborne ? radarAircraft(aircraft, mode, AIRPORT) : radarTakeoffAircraft(radarAircraft(aircraft, mode, AIRPORT), AIRPORT);
}

function initialExercise(id = "egph-local"): Exercise {
  const first = newAircraft("demo-air", true);
  first.flightPlan = [{x: 5, y: 7}, {x: 3, y: 3}, {x: 2, y: 1}, runwayGeometry().threshold];
  const second = newAircraft("demo-ground", false);
  const taxiway = AIRPORT.features.find(f => f.kind === "taxiway" && f.points.length >= 3);
  if (taxiway) { second.position = {...taxiway.points[0]}; second.taxiPath = taxiway.points.map((p, i) => ({...p, hold: i === taxiway.points.length - 2})); }
  const mode = trainingMode({...airportSelection(AIRPORT), ...selection});
  return {schema: 2, ...airportSelection(AIRPORT, mode), id, revision: 0, elapsed: 0, running: false, pausedByStaff: false, autoReadback: true, aircraft: mode === "local" ? [first, second] : [radarAircraft(first, mode, AIRPORT)], radarEnvironment: freshFacilityEnvironment(AIRPORT, mode, radarEnvironment), ...(selection.weather?{weather:structuredClone(selection.weather)}:{}), messages: [], processed: [], atis: {...emptyAtis(), departures: [DEFAULT_RUNWAY], arrivals: [DEFAULT_RUNWAY]}, publishedAtis: "ATIS UNAVAILABLE", publishedDraft: null};
}
/** Upgrade old snapshots once: the last pending pilot messages were the only unread ones. */

function restoreExercise(saved: Exercise): Exercise {
  const state = structuredClone(saved);
  for (const a of state.aircraft) {
    if (a.radar?.station === "center" && !a.radar.departure && !a.radar.arrival && a.frequency === "approach" && (a.radar.returningToApproach || state.messages.some(m => m.aircraftId === a.id && m.sender === "pilot" && m.frequency === "approach" && m.text.includes("after touch and go")))) {
      a.radar.returningToApproach = true; a.radar.transferred = false;
    }
    automaticSpeed(a);
    const legacy = state.messages.filter(m => m.aircraftId === a.id && m.sender === "pilot" && m.read === undefined);
    const unread = new Set(legacy.slice(Math.max(0, legacy.length - a.pending)).map(m => m.id));
    for (const m of legacy) m.read = !unread.has(m.id);
    a.pending = unreadMessages(state, a.id);
    a.trail = a.trail.filter(p => p.time !== undefined && p.time >= state.elapsed - DEFAULTS.radarSeconds && p.time <= state.elapsed);
  }
  reconcileSequences(state.aircraft);
  return state;
}
// A scheduled heading arrival's runway/leg are intentions until it joins or is sequenced.
const arrivalTraffic = (a: Aircraft) => a.active && !a.leavingCircuit && (a.frequency === "tower" || !!a.radar && radarArrivalFrequency(a.frequency)) && ["pattern", "heading", "go-around"].includes(a.mode)
  && (a.mode !== "heading" || !!a.radar || !!a.sequence);
const departureTraffic = (a: Aircraft) => a.active && a.frequency === "tower" && ["parked", "taxi", "lineup"].includes(a.mode);
/** Remaining circuit distance orders arrivals for one runway, across both pattern hands. */

function arrivalDistance(a: Aircraft): number {
  const p = patternTargets(a), g = runwayGeometry(a.runway ?? DEFAULT_RUNWAY);
  if (a.leg === "final") return Math.max(0, -runwayCoordinates(a.position, g).along);
  const legs: Leg[] = ["upwind", "crosswind", "downwind", "base", "final"];
  const index = legs.indexOf(a.leg);
  let remaining = distance(a.position, p[a.leg]);
  for (let i = index; i < legs.length - 1; i++) remaining += distance(p[legs[i]], p[legs[i + 1]]);
  return remaining;
}

/** Keep an assigned predecessor ahead even while its follower is physically closer. */
function arrivalQueue(aircraft: Aircraft[], runway: Aircraft["runway"], excludeId?: string): Aircraft[] {
  const candidates = aircraft.filter(other => other.id !== excludeId && other.runway === runway && arrivalTraffic(other))
    .sort((x, y) => arrivalDistance(x) - arrivalDistance(y) || x.id.localeCompare(y.id));
  const eligible = new Map(candidates.map(other => [other.id, other]));
  const visited = new Set<string>(), queue: Aircraft[] = [];
  const visit = (other: Aircraft) => {
    if (visited.has(other.id)) return;
    visited.add(other.id);
    const following = followedAircraft(other, aircraft);
    if (following && eligible.has(following.id)) visit(following);
    queue.push(other);
  };
  for (const other of candidates) visit(other);
  return queue;
}

function sequenceTarget(aircraft: Aircraft[], a: Aircraft, instruction: Instruction) {
  const requested = instruction.type === "sequence" ? instruction : instruction.type === "pattern" ? instruction.sequence : undefined;
  if (!requested) return;
  const runway = instruction.type === "pattern" ? instruction.runway ?? a.runway : a.runway;
  const queue = requested.departure
    ? aircraft.filter(other => other.id !== a.id && other.runway === runway && departureTraffic(other))
      .sort((x, y) => distance(x.position, runwayGeometry(runway ?? DEFAULT_RUNWAY).threshold) - distance(y.position, runwayGeometry(runway ?? DEFAULT_RUNWAY).threshold) || x.id.localeCompare(y.id))
    : arrivalQueue(aircraft, runway, a.id);
  const following = queue[requested.number - 2];
  // The number identifies the predecessor. Its spoken leg can change while the command travels.
  const visited = new Set([a.id]);
  let current: Aircraft | undefined = following;
  while (current) {if (visited.has(current.id)) return; visited.add(current.id); current = aircraft.find(other => other.id === current!.sequence?.followingId);}
  return following;
}
function assignSequence(aircraft: Aircraft[], a: Aircraft, instruction: Instruction) {
  const requested = instruction.type === "sequence" ? instruction : instruction.type === "pattern" ? instruction.sequence : undefined;
  if (!requested) return;
  const following = sequenceTarget(aircraft, a, instruction), runway = instruction.type === "pattern" ? instruction.runway ?? a.runway : a.runway;
  a.sequence = following ? {number: requested.number, traffic: requested.traffic, departure: requested.departure, followingId: following.id, runway: runway ?? undefined, circuit: a.circuit ?? 0, followingCircuit: following.circuit ?? 0} : undefined;
}

function followedAircraft(a: Aircraft, aircraft: Aircraft[]): Aircraft | undefined {
  const s = a.sequence;
  if (!s?.followingId || s.number < 2 || s.runway !== a.runway || s.circuit !== (a.circuit ?? 0)) return;
  const target = aircraft.find(other => other.id === s.followingId);
  if (!target || target.id === a.id || target.runway !== a.runway || (target.circuit ?? 0) !== s.followingCircuit) return;
  const visited = new Set([a.id]); let leader: Aircraft | undefined = target;
  while (leader) {if (visited.has(leader.id)) return; visited.add(leader.id); leader = aircraft.find(other => other.id === leader!.sequence?.followingId);}
  return (s.departure ? departureTraffic(a) && departureTraffic(target) : arrivalTraffic(a) && arrivalTraffic(target)) ? target : undefined;
}

function reconcileSequences(aircraft: Aircraft[]) {
  for (const a of aircraft) if (a.sequence && !followedAircraft(a, aircraft)) a.sequence = undefined;
}

function sequenceStatus(a: Aircraft, aircraft: Aircraft[]): string {
  const following = followedAircraft(a, aircraft);
  if (following) return `Following ${following.callsign}${a.mode === "pattern" && a.leg === "downwind" && !a.extended && sequenceGuidance(a, aircraft).extendDownwind && -runwayCoordinates(a.position, runwayGeometry(a.runway ?? DEFAULT_RUNWAY)).along >= defaultBaseDistance(a) - turnLead(a) ? " · Extending downwind for spacing" : ""} · Runway ${a.runway}`;
  if (!arrivalTraffic(a)) return "";
  return arrivalNumber(a, aircraft) > 1 ? "Sequence required for this circuit" : "First for this runway · no sequence required";
}
/** Instructor arrival expectations use the same runway/circuit ordering as spacing. */

function arrivalNumber(a: Aircraft, aircraft: Aircraft[], runway = a.runway): number {
  const arrival = {...a, runway};
  return Math.max(1, 1 + arrivalQueue([...aircraft.filter(other => other.id !== a.id), arrival], runway).findIndex(other => other.id === a.id));
}

function clearLanding(a: Aircraft) {a.clearedToLand = false; a.clearedForOption = false; a.optionHand = undefined; if (a.assigned) a.assigned = {...a.assigned, landing: false};}

function fullStop(a: Aircraft) {a.landing = "full-stop"; delete a.optionHand; if (a.automaticRequest === "inbound-option") a.automaticRequest = "inbound-land";}

function newCircuit(a: Aircraft) {a.circuit = (a.circuit ?? 0) + 1; a.sequence = undefined; a.patternFinalDistance = undefined; delete a.patternEntry; delete a.arrivalExit; delete a.arrivalRequest; clearLanding(a);}
/** Sending a clearance never depends on a pilot request or an aircraft's position.
 * Physical prerequisites are checked separately when staff chooses to assign it. */

function validateInstruction(a: Aircraft, command: Instruction, frequency?: string, traffic: Aircraft[] = []): string | null {
  if (command.type === "atc") {if (frequency && a.frequency !== frequency && command.action !== "guard") return "Aircraft is not on this frequency."; return referenceInstructionError(a, command, AIRPORT, traffic);}
  const radarError = radarInstructionError(a, command, AIRPORT, radarEnvironment); if (radarError) return radarError;
  if ("runway" in command && command.runway && !runwayEnds(AIRPORT).some(end => end.id === command.runway)) return "Runway is not in this airport snapshot.";
  if (frequency && a.frequency !== frequency) return "Aircraft is not on this frequency.";
  if (frequency === "atis") return "ATIS cannot issue aircraft instructions.";
  const requestedSequence = command.type === "sequence" ? command : command.type === "pattern" ? command.sequence : undefined;
  if (requestedSequence && requestedSequence.number > 1 && !sequenceTarget(traffic, a, command)) return "That sequence has no eligible predecessor, or would make aircraft follow each other. Review the traffic order.";
  if ((command.type === "taxi" || command.type === "pushback") && command.route) {
    // Staff maneuvers have no frequency: they apply the route as the pilot, without a clearance.
    if (frequency !== undefined && frequency !== "ground") return "Routed ground clearances require Ground frequency.";
    if (command.type === "taxi" && ((command.runway && (command.route.destination.type !== "runway" || command.runway !== command.route.destination.id)) || command.destination === "parking" && command.route.destination.type !== "parking")) return "The clearance destination must match its route.";
    return groundRouteError(AIRPORT, command.route, command.type);
  }
  if ((command.type === "heading" || command.type === "speed") && (!Number.isFinite(command.value) || command.value < 0 || command.value > (command.type === "heading" ? 360 : 600))) return "Enter a valid heading (0–360) or speed (0–600 knots).";
  if (command.type === "transition" && (!Number.isFinite(command.altitude) || command.altitude < 1000 || command.altitude > 60000 || command.altitude % (command.altitude < 10000 ? 500 : 1000) !== 0)) return "Choose a listed transition altitude.";
  if (command.type === "transition" && command.altitude <= AIRPORT.elevation) return "Choose a transition altitude above the airport elevation.";
  if (command.type === "radio" && command.message === "misc" && (!command.text?.trim() || command.text.length > 300)) return "Enter a Misc message of 1–300 characters.";
  return null;
}

function validateAssignment(a: Aircraft, command: Instruction, frequency?: string, traffic: Aircraft[] = []): string | null {
  if (frequency !== undefined) {const error = headingOnlyUnable(a, command); if (error) return error;}
  if (command.type === "atc") return referenceInstructionError(a, command, AIRPORT, traffic, true);
  if (command.type === "radio") return "Radio messages do not assign aircraft movement.";
  if (a.radar && !["vector", "expect-approach", "missed-approach", "route", "heading", "speed", "radar-speed", "frequency"].includes(command.type)) return "This instruction is unavailable in radar training.";
  const invalid = validateInstruction(a, command, frequency, traffic); if (invalid) return invalid;
  if (command.type === "vector" && command.approachId) {
    const approach = radarEnvironment.approaches.find(p => p.id === command.approachId);
    if (approach?.type === "gps") return gpsApproachJoin(a, approach, runwayGeometry(approach.runway), command.heading === undefined ? undefined : magneticToTrue(command.heading, AIRPORT)).error ?? null;
  }
  const ground = a.mode === "pushback" || a.mode === "parked" || a.mode === "taxi" || a.mode === "lineup" || a.mode === "rollout";
  if (command.type === "frequency" && command.whenReady && (command.frequency !== "tower" || !ground)) return "Contact Tower when ready requires ground traffic and Tower as the destination.";
  if (command.type === "taxi" && command.contactTowerWhenReady && (!command.runway || command.destination === "parking")) return "Contact Tower when ready requires taxi to a runway.";
  if (["give-way", "pushback", "taxi", "stop", "hold-short", "cross", "takeoff", "lineup", "exit-runway"].includes(command.type) && !ground && !(command.type === "takeoff" && a.mode === "takeoff" && a.altitude <= AIRPORT.elevation + 1)) return "This instruction requires ground traffic.";
  if (["land", "cancel-landing", "go-around", "pattern", "extend", "heading", "transition", "departure"].includes(command.type) && (ground || a.mode === "takeoff" && a.altitude <= AIRPORT.elevation + 1)) return "This instruction requires airborne traffic.";
  if ((command.type === "taxi" || command.type === "pushback") && command.route) {
    if (groundRouteJoin(a, command.route) === undefined) return "Aircraft has moved away from this route. Recalculate it.";
    if (command.type === "pushback" && (a.speed > .2 || a.enginesRunning === true)) return "Routed pushback requires stopped traffic with engines off.";
    return null;
  }
  if (command.type === "pushback") {
    if (a.mode === "pushback" && a.pushback) {
      if (!command.tail || command.tail === (a.pushback.tail ?? "north")) return null;
      if (a.pushback.index !== 0) return "The pushback turn has started. Stop before requesting a different tail direction.";
      const amended = planPushback(AIRPORT, a, command.tail);
      if (amended.error) return amended.error;
      if (distance(amended.path![0], a.pushback.path[0]) > .002) return "The amended pushback cannot join the remaining straight path safely.";
      return null;
    }
    if (groundReady(a, AIRPORT)) return "This aircraft has completed pushback and is ready to taxi.";
    if (a.mode !== "parked") return "This aircraft is not in a pushback phase.";
    return planPushback(AIRPORT, a, command.tail ?? "north").error ?? null;
  }
  if (command.type === "taxi" && command.runway) return planTaxiRoute(AIRPORT, a.position, command.runway).error ?? null;
  if (command.type === "taxi" && command.destination === "parking" && (a.mode === "rollout" || a.arrivalExit)) return a.runwayExit || a.arrivalExit ? null : runwayExitRoute(a, "any").error ?? null;
  if (command.type === "taxi" && command.destination === "parking" && a.frequency === "tower") return null;
  if (command.type === "taxi" && command.destination === "parking") return planParkingRoute(AIRPORT, a.position, intentionsOf(a).parkingStand, traffic.filter(other => other.id !== a.id && other.active && other.altitude < AIRPORT.elevation + 1000).map(other => other.position)).error ?? null;
  if (["taxi", "cross"].includes(command.type) && (a.taxiPath.length < 2 || a.taxiIndex >= a.taxiPath.length)) return "Staff must configure a taxi path first.";
  if (command.type === "hold-short" && !a.taxiPath.slice(a.taxiIndex).some(p => p.hold) && !waitingAtDepartureHold(a, command.runway)) return "The taxi path has no upcoming hold-short point.";
  if (command.type === "cross") return crossingHold(AIRPORT, a, command.runway).error ?? null;
  if (command.type === "takeoff" && a.mode === "takeoff" && command.runway && command.runway !== a.runway) return "A rolling takeoff must remain on its current runway.";
  if (command.type === "takeoff" && a.mode === "takeoff") return null;
  if (command.type === "takeoff" || command.type === "lineup") {
    const route = departureRoute(a, command.runway ?? a.runway ?? DEFAULT_RUNWAY);
    if (route.error) return route.error;
  }
  if (command.type === "exit-runway") return exitRunwayPlan(a, command).error ?? null;
  return null;
}

function departureHoldMatches(a: Aircraft, hold: {runway?: Runway}, runway = a.departureRunway ?? a.runway) {
  return !hold.runway || airportRunways(AIRPORT).some(pair => pair.ends.some(end => end.id === runway) && pair.ends.some(end => end.id === hold.runway));
}

function waitingAtDepartureHold(a: Aircraft, runway = a.departureRunway ?? a.runway) {
  if (a.mode !== "parked" || a.speed !== 0 || !runway || !departureHoldMatches(a, {runway})) return false;
  // Spawned departures can already be waiting without a route. Completed taxi
  // routes also end at the departure hold without an intermediate Hold flag.
  const end = a.taxiPath.at(-1);
  return !end || a.taxiIndex >= a.taxiPath.length - 1 && distance(a.position, end) < .005;
}

function departureRoute(a: Aircraft, runway: Runway) {
  const g = runwayGeometry(runway), q = runwayCoordinates(a.position, g);
  if (Math.abs(q.lateral) < .012 && q.along >= -.02 && q.along <= distance(g.threshold, g.departure)) {
    return departureEntry([a.position], Math.max(0, q.along), g);
  }
  // Preserve an explicitly assigned intersection hold instead of routing to a
  // different departure access point near the threshold.
  const hold = a.taxiPath.at(-1);
  if (hold && (hold.hold || a.mode === "parked" && a.speed <= 1) && a.taxiIndex >= a.taxiPath.length - 1 && departureHoldMatches(a, hold, runway) && distance(a.position, hold) < .005) {
    const entry = runwayCoordinates(hold, g);
    if (entry.along >= 0 && entry.along < distance(g.threshold, g.departure) && Math.abs(entry.lateral) <= .1)
      return departureEntry([a.position], entry.along, g);
  }
  // A cleared departure may enter from a nearby mapped hold-short point, or taxi
  // there along A*. It never starts its takeoff roll from a stand or taxiway.
  const route = planTaxiRoute(AIRPORT, a.position, runway);
  if (route.error && !(distance(a.position, g.threshold) < .21 && Math.abs(q.lateral) <= .06)) return {error: route.error};
  const points = route.path ?? [a.position];
  if (route.path?.some(point => point.hold && point.runway)) return {error: "Taxi to the departure hold and clear intermediate runway crossings before lining up."};
  const entry = runwayCoordinates(points[points.length - 1], g);
  return departureEntry(points.map(p => ({x: p.x, y: p.y})), Math.max(0, entry.along), g);
}

function departureEntry(path: Point[], along: number, g: ReturnType<typeof runwayGeometry>): {path?: Point[]; error?: string} {
  // A clearance preserves the selected entry. Insufficient runway is handled by
  // the takeoff roll, without inventing an Unable or cancellation transmission.
  return {path: [...path, add(g.threshold, g.vector, along)]};
}

function brakeRejectedTakeoff(a: Aircraft, dt: number, g: ReturnType<typeof runwayGeometry>) {
  const speed = Math.max(0, a.speed - acceleration(a) * dt);
  const along = runwayCoordinates(a.position, g).along + (a.speed + speed) / 2 / 3600 * dt;
  a.position = add(g.threshold, g.vector, along);
  a.speed = speed; a.targetSpeed = 0; a.altitude = AIRPORT.elevation;
  a.heading = g.heading; a.targetHeading = g.heading;
  if (along > distance(g.threshold, g.departure)) a.takeoffOutcome = "overrun";
  if (!speed) {a.mode = "parked"; a.holding = true; a.groundReady = true;}
}

function runwayCoordinates(p: Point, g: ReturnType<typeof runwayGeometry>) {
  return {along: (p.x - g.threshold.x) * g.vector.x + (p.y - g.threshold.y) * g.vector.y, lateral: (p.x - g.threshold.x) * -g.vector.y + (p.y - g.threshold.y) * g.vector.x};
}
/** Follow a mapped runway connector to a point beyond the protected runway area.
 * Exit selection allows enough runway distance to decelerate before turning. */

function runwayExitRoute(a: Aircraft, side: "left" | "right" | "any", slow = false): {path?: Point[]; speed?: 15 | 35; braking?: number; skippedExit?: boolean; error?: string} {
  const g = runwayGeometry(a.runway ?? DEFAULT_RUNWAY), q = runwayCoordinates(a.position, g), length = distance(g.threshold, g.departure);
  const runway = airportRunways(AIRPORT).find(pair => pair.ends.some(end => end.id === (a.runway ?? DEFAULT_RUNWAY)))!;
  const joinTolerance = Math.max(.002, (runway.widthFeet ?? 0) / (2 * 6076));
  // A stopped aircraft can use a nearby connector; moving traffic needs room to turn.
  const entryMargin = Math.min(.015, a.speed / 3600);
  if (Math.abs(q.lateral) > .015 || q.along < -.02 || q.along > length + .02) return {error: "Aircraft must be on the runway before assigning an exit."};
  const candidates: {along: number; path: Point[]; speed: 15 | 35}[] = [];
  const taxiways = AIRPORT.features.filter(f => f.kind === "taxiway");
  const trace = (path: Point[], points: Point[], visited: Set<string>): Point[][] => {
    for (const next of points) {
      const previous = path.at(-1)!, prior = runwayCoordinates(previous, g).lateral, lateral = runwayCoordinates(next, g).lateral;
      // A connector must lead forwards until it clears the runway. Merely
      // placing its entrance ahead still allowed a turn back along the pavement.
      // Near-perpendicular mapped connectors can drift by a few feet. Bound
      // that skew against the furthest point, then straighten the chosen path.
      if (runwayCoordinates(next, g).along < Math.max(...path.map(p => runwayCoordinates(p, g).along)) - 3 / 6076) return [];
      if (Math.abs(lateral) < 1e-7) continue;
      if (side !== "any" && side !== (lateral > 0 ? "left" : "right") || prior * lateral < -1e-8 || Math.abs(lateral) + .0001 < Math.abs(prior)) return [];
      if (Math.abs(lateral) >= g.clearance) {
        const t = (Math.sign(lateral) * g.clearance - prior) / (lateral - prior);
        return [[...path, {x: previous.x + (next.x - previous.x) * t, y: previous.y + (next.y - previous.y) * t}]];
      }
      path = [...path, next];
    }
    // Connectors often end at a shared node on the next taxiway, inside the hold line.
    const junction = path.at(-1)!;
    return taxiways.filter(f => !visited.has(f.id)).flatMap(f => {
      const index = f.points.findIndex(p => distance(p, junction) < 1e-7);
      if (index < 0) return [];
      const used = new Set([...visited, f.id]);
      return [f.points.slice(index + 1), f.points.slice(0, index).reverse()].filter(p => p.length).flatMap(p => trace(path, p, used));
    });
  };
  for (const feature of taxiways) {
    for (let i = 1; i < feature.points.length; i++) {
      const p = feature.points[i - 1], r = feature.points[i], u = runwayCoordinates(p, g), v = runwayCoordinates(r, g);
      if (Math.abs(v.lateral - u.lateral) < 1e-8) continue;
      const intersection = -u.lateral / (v.lateral - u.lateral);
      // Mapped connectors may end on the runway pavement rather than its pinned centerline.
      if (intersection < 0 && (i !== 1 || Math.abs(u.lateral) > joinTolerance) || intersection > 1 && (i !== feature.points.length - 1 || Math.abs(v.lateral) > joinTolerance)) continue;
      const fraction = Math.max(0, Math.min(1, intersection));
      const along = u.along + (v.along - u.along) * fraction, entry = add(g.threshold, g.vector, along);
      if (along < q.along + entryMargin || along > length) continue;
      for (const direction of [-1, 1]) {
        const points = direction === 1 ? feature.points.slice(i) : feature.points.slice(0, i).reverse();
        for (const path of trace([entry], points, new Set([feature.id]))) {
          // Infer forward oblique connectors from mapped geometry (within 60°).
          // Measure near the runway, before a connector joins a perpendicular taxiway.
          const departure = runwayCoordinates(path.find(p => Math.abs(runwayCoordinates(p, g).lateral) >= .015) ?? path.at(-1)!, g);
          const speed = departure.along - along >= Math.abs(departure.lateral) / Math.sqrt(3) ? 35 : 15;
          if (along >= q.along + entryMargin) candidates.push({along, path: [{...a.position}, ...path], speed});
        }
      }
    }
  }
  const exits = candidates.sort((x, y) => x.along - y.along).filter((entry, index, all) => index === 0 || entry.along - all[index - 1].along > .02);
  // Prefer a connector reachable with normal braking. If none remain, brake
  // for the last forward connector instead of overrunning or backtracking.
  const reachable = exits.filter(exit => exit.along >= q.along + Math.max(0, (a.speed ** 2 - exit.speed ** 2) / (2 * acceleration(a) * 3600)) + entryMargin);
  const planned = reachable.length ? reachable : exits.slice(-1);
  // GA timing comes from slow forward motion, not an obligatory later exit.
  const chosen = planned[0];
  if (chosen) {
    let forward = chosen.along;
    const path: Point[] = [];
    chosen.path.forEach((p, index) => {
      if (index === 0) {path.push(p); return;}
      const along = runwayCoordinates(p, g).along;
      forward = Math.max(forward, along);
      const next = add(p, g.vector, forward - along);
      // Rounded runway/connector intersections can differ by centimetres.
      // Keep the entrance and endpoint, without creating phantom tiny turns.
      if (index === 1 || index === chosen.path.length - 1 || distance(path.at(-1)!, next) >= 1 / 1852) path.push(next);
    });
    return {...chosen, path, ...(slow || a.radar?.arrival ? {braking: Math.min(100, Math.max(.0001, (a.speed ** 2 - chosen.speed ** 2) / (2 * Math.max(.001, chosen.along - q.along) * 3600)))} : {})};
  }
  return {error: `No reachable mapped ${side === "any" ? "" : side + " "}exit ahead. Slow down or reposition before assigning an exit.`};
}

function exitRunwayPlan(a: Aircraft, c: Extract<Instruction, {type: "exit-runway"}>) {
  const exit = runwayExitRoute(a, c.side);
  if (!exit.path || (!c.crossRunway && !c.holdShort)) return exit;
  const follow = runwayContinuation(AIRPORT, exit.path.at(-1)!, (c.crossRunway ?? c.holdShort)!, !!c.crossRunway);
  return follow.path ? {...exit, path: [...exit.path, ...follow.path.slice(1)]} : {error: follow.error};
}

function queueRunwayExit(a: Aircraft, side: "left" | "right" | "any", instruction: NonNullable<Aircraft["arrivalExit"]>["instruction"], command?: Extract<Instruction, {type: "exit-runway"}>) {
  const route = command ? exitRunwayPlan(a, command) : runwayExitRoute(a, side, !!a.conflictMotion?.slowExit);
  if (!route.path || !route.speed) return;
  a.runwayExit = route.path; a.arrivalExit = {instruction, ...("skippedExit" in route ? {skippedExit: route.skippedExit} : {}), ...("braking" in route && typeof route.braking === "number" ? {braking: route.braking} : {}), speed: command?.expedite && route.speed === 15 ? 25 : route.speed, ...(command?.crossRunway || command?.holdShort ? {followOn: true} : {})};
  // The rollout computes braking from the remaining distance to this exit.
  a.targetSpeed = a.speed;
}

function instruct(a: Aircraft, c: Instruction, traffic: Aircraft[] = []) {
  c = roundedHeadingInstruction(c);
  // A sequenced entry from upwind must establish space before turning into the
  // predecessor's circuit. Keep the requested leg until the physical merge is safe.
  const entry = c.type === "pattern" && (c.leg === "crosswind" || c.leg === "downwind")
    && a.leg === "upwind" && ["pattern", "takeoff", "go-around"].includes(a.mode)
    && (c.sequence?.number ?? a.sequence?.number ?? 1) > 1 ? c.leg : undefined;
  const leavesHold = ["heading", "route", "pattern", "go-around", "missed-approach"].includes(c.type) || c.type === "vector" && (c.heading !== undefined || c.approachId !== undefined);
  if (leavesHold || ["extend", "departure", "transition", "takeoff", "lineup", "runway", "frequency"].includes(c.type)) delete a.patternEntry;
  if (leavesHold) {delete a.atcManeuver; delete a.routeNavigation;}
  if (a.atcManeuver?.kind === "hold" && c.type === "vector" && c.altitude) a.atcManeuver.altitude = c.altitude.unit === "feet" ? c.altitude.value : c.altitude.value * 100;
  if (c.type === "radar-speed") {assignRadarSpeed(a, c, EXERCISE_WEATHER); return;}
  if (["vector", "expect-approach", "missed-approach", "route"].includes(c.type)) {assignRadar(a, c, AIRPORT, radarEnvironment); return;}
  if (a.radar && c.type === "heading") {assignRadar(a, {type: "vector", heading: c.value}, AIRPORT, radarEnvironment); return;}
  if (c.type === "atc") {if (c.action === "back-taxi") delete a.takeoffOutcome; assignReference(a, c, AIRPORT, traffic); return;}
  if (c.type === "radio") return;
  if (c.type === "takeoff" && a.mode === "takeoff") {a.expedited = !!c.immediate; a.targetSpeed = Math.max(a.targetSpeed, DEFAULTS.airSpeed); return;}
  if (["pushback", "taxi", "lineup", "takeoff", "exit-runway"].includes(c.type)) delete a.takeoffOutcome;
  if (["taxi", "lineup", "takeoff", "cross", "exit-runway"].includes(c.type)) {a.expedited = "expedite" in c ? !!c.expedite : c.type === "takeoff" && !!c.immediate; delete a.followGroundId;}
  if (["heading", "transition", "departure", "pattern", "go-around"].includes(c.type)) delete a.takeoffPattern;
  if (!["give-way", "stop", "speed", "frequency", "outcome", "sequence", "cross"].includes(c.type)) delete a.giveWay;
  if (["taxi", "pushback", "give-way", "takeoff", "lineup", "exit-runway"].includes(c.type)) delete a.groundYield;
  if (!["frequency", "speed", "sequence", "outcome", "give-way"].includes(c.type)) delete a.automaticRequest;
  if (!["transition", "frequency", "speed", "outcome", "sequence"].includes(c.type)) delete a.transitionOverheadArmed;
  if (["transition", "departure", "exit-runway"].includes(c.type)) clearLanding(a);
  if ("runway" in c && c.runway && c.runway !== a.runway) clearLanding(a);
  if (["pattern", "heading", "departure", "transition", "takeoff", "lineup"].includes(c.type)) delete a.goAroundRunwayHeading;
  if (["pushback", "takeoff", "lineup", "exit-runway", "frequency", "runway"].includes(c.type) || c.type === "taxi" && c.destination === "parking") delete a.contactTowerAtHold;
  const arrivalParking = c.type === "taxi" && c.destination === "parking" && (a.mode === "rollout" || !!a.arrivalExit);
  if (!arrivalParking && !["speed", "frequency", "runway", "outcome", "sequence", "stop"].includes(c.type)) {delete a.transitionAltitude; delete a.runwayExit; delete a.lineupWait; delete a.arrivalExit; delete a.arrivalRequest;}
  if (["pattern", "land", "go-around", "takeoff", "lineup"].includes(c.type)) delete a.leavingCircuit;
  if ("runway" in c && c.runway && c.runway !== a.runway || "hand" in c && c.hand && c.hand !== a.hand) a.patternFinalDistance = undefined;
  if ("runway" in c && c.runway && !["cross", "hold-short"].includes(c.type)) {a.lastRunway = a.runway ?? a.lastRunway; a.runway = c.runway;}
  if (c.type !== "pushback" && !["stop", "speed", "frequency", "runway", "outcome"].includes(c.type)) a.pushback = undefined;
  switch (c.type) {
    case "pushback": {
      if (c.route) {
        a.pushback = {path: c.route.points.map(p => ({x: p.x, y: p.y})), index: groundRouteJoin(a, c.route)!, ...(c.route.controlIndices.length === 3 ? {pullFrom: c.route.controlIndices[1] + 1} : {}), tail: c.tail};
        a.groundReady = false; a.enginesRunning = false; a.mode = "pushback"; a.holding = false; a.targetSpeed = GROUND.pushbackSpeed; break;
      }
      const tail = c.tail ?? a.pushback?.tail ?? "north";
      if (a.mode !== "pushback" || !a.pushback || (a.pushback.tail ?? "north") !== tail) a.pushback = {path: planPushback(AIRPORT, a, tail).path!, index: 0, tail};
      a.groundReady = false;
      a.mode = "pushback"; a.holding = false; a.targetSpeed = GROUND.pushbackSpeed; break;
    }
    case "give-way": if (c.aircraftId) a.giveWay = {aircraftId: c.aircraftId, description: c.description}; else delete a.giveWay; break;
    case "taxi":
      a.enginesRunning = true;
      if (c.route) {
        a.taxiPath = c.route.points.map(p => ({...p})); a.taxiIndex = groundRouteJoin(a, c.route)!; a.releasedHold = null;
        a.intentions = {...intentionsOf(a), taxi: c.route.destination.type === "parking" ? "parking" : "runway", ...(c.route.destination.type === "parking" ? {parkingStand: c.route.destination.id} : {})};
        if (c.runway) {a.departureRunway = c.runway; a.runway = c.runway;}
        if (c.contactTowerWhenReady) a.contactTowerAtHold = true; else delete a.contactTowerAtHold;
        a.mode = "taxi"; a.holding = false; a.targetSpeed = DEFAULTS.taxiSpeed; a.groundReady = true; break;
      }
      if (arrivalParking) {
        if (a.arrivalExit) a.arrivalExit = {...a.arrivalExit, instruction: "parking"};
        else if (a.runwayExit) a.arrivalExit = {instruction: "parking", speed: 15};
        else queueRunwayExit(a, "any", "parking");
        a.landing = "full-stop"; a.clearedToLand = false; a.sequence = undefined;
        a.holding = false; a.targetSpeed = a.arrivalExit!.speed; break;
      }
      if (c.destination === "parking" && a.frequency === "tower") {a.frequency = "ground"; a.arrivalRequest = "taxi-parking"; break;}
      if (c.destination === "parking") {
        const route = planParkingRoute(AIRPORT, a.position, intentionsOf(a).parkingStand, traffic.filter(other => other.id !== a.id && other.active && other.altitude < AIRPORT.elevation + 1000).map(other => other.position));
        if (route.path) {a.taxiPath = route.path; a.taxiIndex = 0; a.releasedHold = null;}
        a.intentions = {...intentionsOf(a), taxi: "parking"};
      }
      if (c.runway) {
        a.intentions = {...intentionsOf(a), taxi: "runway"}; a.departureRunway = c.runway;
        const route = planTaxiRoute(AIRPORT, a.position, c.runway);
        if (c.contactTowerWhenReady && !route.path?.some(p => p.hold)) a.contactTowerAtHold = true; else delete a.contactTowerAtHold;
        if (route.path) {a.taxiPath = route.path; a.taxiIndex = 0; a.releasedHold = null; a.lastRunway = a.runway; a.runway = c.runway;}
      } a.mode = "taxi"; a.holding = false; a.targetSpeed = DEFAULTS.taxiSpeed; break;
    case "stop": a.holding = true; a.targetSpeed = 0; a.releasedHold = null; break;
    case "hold-short": {
      const waiting = waitingAtDepartureHold(a, c.runway);
      a.releasedHold = null; a.mode = waiting ? "parked" : "taxi"; a.holding = waiting; a.targetSpeed = waiting ? 0 : DEFAULTS.taxiSpeed; break;
    }
    case "cross": {
      const crossing = crossingHold(AIRPORT, a, c.runway);
      if (crossing.index === undefined) break;
      a.releasedHold = crossing.index;
      // Clear an actual runway hold, but keep an earlier manual Hold Position.
      if (!a.holding || a.taxiIndex === crossing.index && distance(a.position, a.taxiPath[crossing.index]) < 1e-6) {
        a.holding = false; a.mode = "taxi"; a.targetSpeed = a.expedited ? 25 : DEFAULTS.taxiSpeed;
      }
      break;
    }
    case "lineup":
    case "takeoff": {const route = departureRoute(a, a.runway ?? DEFAULT_RUNWAY); a.sequence = undefined; if (c.type === "takeoff") {a.takeoffPattern = !c.straightOut && (!!c.hand || intentionsOf(a).flight === "pattern"); if (c.straightOut) {a.transitionAltitude = c.straightOut; a.leavingCircuit = true;} if (c.hand) a.hand = c.hand;} a.lineupWait = c.type === "lineup"; a.mode = "lineup"; a.taxiPath = route.path ?? []; if (c.type === "takeoff" && a.taxiPath.length) {const end = a.taxiPath.at(-1)!, g = runwayGeometry(a.runway ?? DEFAULT_RUNWAY), remaining = distance(g.threshold, g.departure) - runwayCoordinates(end, g).along; a.taxiPath = [...a.taxiPath, add(end, g.vector, Math.min(.06, Math.max(0, remaining / 2)))];} a.taxiIndex = 1; a.holding = false; a.releasedHold = null; a.targetSpeed = DEFAULTS.taxiSpeed; a.leg = "upwind"; a.extended = false; break;}
    case "exit-runway": {queueRunwayExit(a, c.side, "exit-runway", c); a.landing = "full-stop"; a.clearedToLand = false; a.mode = "rollout"; a.holding = false; a.sequence = undefined; break;}
    case "transition": a.transitionOverheadArmed = intentionsOf(a).afterTransition === "touch-and-go"; a.mode = "heading"; a.targetHeading = a.heading; a.transitionAltitude = c.altitude; a.leavingCircuit = true; a.clearedToLand = false; a.extended = false; a.sequence = undefined; break;
    case "departure": a.mode = "heading"; a.targetHeading = {north: 0, east: 90, south: 180, west: 270}[c.direction]; a.leavingCircuit = true; a.clearedToLand = false; a.extended = false; a.sequence = undefined; break;
    case "land": a.clearedToLand = true; a.clearedForOption = !!c.option; if (!c.option) a.landing = "full-stop"; a.optionHand = c.option ? c.hand : undefined; if (c.number === 1) a.sequence = undefined; break;
    case "cancel-landing": clearLanding(a); break;
    case "go-around": if (a.mode !== "go-around") newCircuit(a); else clearLanding(a); a.mode = "go-around"; a.goAroundRunwayHeading = !!c.runwayHeading; a.leg = "upwind"; a.extended = false; a.targetSpeed = DEFAULTS.airSpeed; if (c.hand) a.hand = c.hand; a.targetHeading = runwayGeometry(a.runway ?? DEFAULT_RUNWAY).heading; break;
    case "pattern": if (a.leg === "final" && c.leg === "upwind") newCircuit(a); a.mode = "pattern"; a.leg = c.leg; a.extended = false; if (entry) {a.patternEntry = entry; a.leg = "upwind";} if (c.hand) a.hand = c.hand; if (c.leg === "base") a.patternFinalDistance = Math.max(defaultBaseDistance(a), -runwayCoordinates(a.position, runwayGeometry(a.runway ?? DEFAULT_RUNWAY)).along); break;
    case "sequence": if (c.cancelLanding) clearLanding(a); break;
    case "extend": a.mode = "pattern"; a.leg = c.leg; a.extended = true; break;
    case "heading": a.mode = "heading"; a.extended = false; a.targetHeading = magneticToTrue(c.value, AIRPORT); break;
    case "speed": delete a.speedInstruction; a.targetSpeed = c.value; a.speedMode = "manual"; if (a.radar) delete a.radar.speed; break;
    case "runway": break;
    case "frequency":
      if(c.facilityId)a.facilityId=c.facilityId;else delete a.facilityId;
      if (c.whenReady) a.contactTowerAtHold = true;
      else {
        a.frequency = c.frequency;
        updateRadarFrequency(a);
        if(c.targetPositionId) {a.positionId=c.targetPositionId; if(a.radar){a.radar.transferred=false;a.radar.report="check-in";}}
        else {delete a.positionId; if(c.facilityId && a.radar) a.radar.transferred=true;}
        if (c.frequency === "ground" && a.parkingAfterContact) {a.arrivalRequest = "taxi-parking"; delete a.parkingAfterContact;}
        if (c.frequency === "tower" && ["parked","taxi","lineup"].includes(a.mode)) {a.towerCheckInPending=true;if(atDepartureHold(a))a.automaticRequest="departure";} else delete a.towerCheckInPending;
      }
      break;
    case "outcome": a.landing = c.outcome; break;
  }
  automaticSpeed(a);
}

function atisText(draft: Atis): string {
  if(draft.publicText) return draft.publicText;
  return [`${airportCallsign(AIRPORT)} information ${draft.letter}.`, `${selection.weather ? "Observed weather." : "Simulated weather."} Wind ${EXERCISE_WEATHER.windDirection} degrees at ${EXERCISE_WEATHER.windSpeed} knots. Visibility ${Math.round(EXERCISE_WEATHER.visibilityKm)} kilometres.`,
    ...(selection.weather?.temperature !== undefined ? [`Temperature ${Math.round(selection.weather.temperature)} degrees Celsius.`] : []),
    ...(selection.weather?.dewpoint !== undefined ? [`Dew Point ${Math.round(selection.weather.dewpoint)} degrees Celsius.`] : []),
    `QNH ${EXERCISE_WEATHER.qnh}.`,
    ...atisSelectionText(draft, atisFrequencies(AIRPORT, selection.radarEnvironment)),
    `Advise on initial contact you have information ${draft.letter}.`].join(" ");
}

/** Preserve radio history while retiring instructions left behind by a retune. */
function retireRetunedCommands(state: Exercise, before: Aircraft[]) {
  const changed = new Map(state.aircraft.filter(a => before.some(old => old.id === a.id && (old.frequency !== a.frequency || old.positionId !== a.positionId))).map(a => [a.id, {frequency: a.frequency, positionId: a.positionId}]));
  if (!changed.size) return;
  for (const a of state.aircraft) if (changed.has(a.id)) a.requestedPatternDeparture = false;
  state.messages = state.messages.map(message => {
    if (!changed.has(message.aircraftId) || (changed.get(message.aircraftId)?.frequency === message.frequency && changed.get(message.aircraftId)?.positionId === message.positionId) || message.sender !== "controller" || message.acknowledged || !commandHasReadback(message.instruction)) return message;
    const retired = {...message, acknowledged: true}; delete retired.autoReadbackAt; return retired;
  });
}

/** Pace runway-relative final progress, including staggered parallel thresholds.
 * Targets are temporary IAS guidance; normal acceleration and safety still apply. */
function uwcFinalSpeeds(a: Aircraft, b: Aircraft): readonly [number, number] | undefined {
  if (![a, b].every(p => p.mode === "pattern" && p.leg === "final" && !p.leavingCircuit && p.landing === "touch-and-go")) return;
  const band = (p: Aircraft) => {
    const g = runwayGeometry(p.runway!), heading = ((p.heading - g.heading + 540) % 360 - 180);
    const reference = p.speedTargets?.vref ?? performanceFor(p)?.landing ?? 135;
    const minimum = Math.max(reference, performanceFor(p)?.min ?? 0);
    // A modest final-speed increase, never below landing speed or above the
    // aircraft's performance limit. Do not overwrite assigned/custom speeds.
    const maximum = Math.min(reference + 30, performanceFor(p)?.max ?? 600);
    const factor = Math.cos(heading * radians) / Math.sqrt(densityRatio(p.altitude, EXERCISE_WEATHER.temperature, EXERCISE_WEATHER.qnh));
    const wind = -EXERCISE_WEATHER.windSpeed * Math.cos((EXERCISE_WEATHER.windDirection - g.heading) * radians);
    const preferred = p.speedMode === "manual" ? p.targetSpeed : speedProfile(p).target;
    return {minimum, maximum, factor, wind, heading, preferred, distance: Math.max(0, -runwayCoordinates(p.position, g).along)};
  };
  const first = band(a), second = band(b);
  // Wait for the base-to-final turns to settle; never force an incompatible pair
  // outside either aircraft's final-speed envelope to manufacture alignment.
  if ([first, second].some(p => Math.abs(p.heading) > 30 || p.maximum < p.minimum || p.distance <= 0)) return;
  const low = Math.max(...[first, second].map(p => p.minimum * p.factor + p.wind));
  const high = Math.min(...[first, second].map(p => p.maximum * p.factor + p.wind));
  if (high < low || high <= 0) return;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const common = clamp(Math.min(...[first, second].map(p => p.preferred * p.factor + p.wind)), low, high);
  if (common <= 0) return;
  // Close toward zero rather than waiting to breach 0.1 NM. Tighten the response
  // near the threshold so both touch-and-go transitions happen together.
  const horizon = clamp(Math.min(first.distance, second.distance) * 3600 / common * .3, 4, 20);
  const correction = (first.distance - second.distance) * 3600 / horizon;
  return [clamp((common + correction / 2 - first.wind) / first.factor, first.minimum, first.maximum),
    clamp((common - correction / 2 - second.wind) / second.factor, second.minimum, second.maximum)];
}

const conflictEngine = {finalSpeeds: uwcFinalSpeeds, vacateSpeed: (a: Aircraft, following: Aircraft) => {
  // Start pacing on the runway, reserving enough distance for gradual braking
  // as well as the slow roll to the exit and across the clearance boundary.
  // Explicit exit/taxi instructions retain their normal speeds and can resolve it.
  if (!["rollout", "taxi"].includes(a.mode) || a.arrivalExit && a.arrivalExit.instruction !== "automatic"
    || following.mode !== "pattern" || !["base", "final"].includes(following.leg)) return;
  const path = a.mode === "rollout" ? (a.runwayExit ?? runwayExitRoute(a, "any", true).path)?.slice(1) : a.taxiPath.slice(a.taxiIndex);
  if (!path?.length) return;
  let remaining = 0, previous = a.position;
  for (const point of path) {remaining += distance(previous, point); previous = point;}
  const seconds = Math.min(600, approachSeconds(following) + 8);
  // D = target*T + (current-target)^2/(2*braking), in knot-seconds.
  // Subtracting the braking distance prevents a fast rollout spending the
  // distance that a constant-speed ETA calculation reserved for the delay.
  const braking = acceleration(a), offset = braking * seconds - a.speed;
  const target = Math.sqrt(Math.max(0, offset ** 2 - a.speed ** 2 + 2 * braking * remaining * 3600)) - offset;
  // Never stop or crawl indefinitely to manufacture an unachievable conflict.
  return Math.max(5, Math.min(15, target));
}, geometry: runwayGeometry, distance: arrivalDistance, instruct: (a: Aircraft, c: Instruction) => instruct(a, c), lineupError: (a: Aircraft) => departureRoute(a, a.runway ?? DEFAULT_RUNWAY).error};

function applyEnvelope(state: Exercise, envelope: Envelope, options: {legacyPatternEntry?: boolean; suppressSpawnRequest?: boolean} = {}): {state: Exercise; error?: string} {
  if (state.processed.includes(envelope.id)) return {state};
  const next = structuredClone(state);
  let action = envelope.action;
  const invalidRunway = runwayReferenceError(action, AIRPORT);
  if (invalidRunway) return {state, error: invalidRunway};
  const aircraftId = "aircraftId" in action ? action.aircraftId : undefined;
  const aircraft = aircraftId ? next.aircraft.find(a => a.id === aircraftId) : undefined;
  if ("aircraftId" in action && !aircraft) return {state, error: "Aircraft no longer exists."};
  if (action.kind === "spawn" || action.kind === "edit") {
    const edited = action.kind === "spawn" ? action.aircraft : {...aircraft!, ...action.patch};
    if (action.kind === "spawn" || action.patch.callsign !== undefined && action.patch.callsign !== aircraft!.callsign) {
      // A scenario spawn materializes an existing authored aircraft, including legacy shared numbers.
      const reservedSpawn = action.kind === "spawn" && next.callsignReservations?.some(a => a.id === edited.id && a.callsign === edited.callsign);
      const error = reservedSpawn ? undefined : callsignConflict(edited.callsign, [...next.aircraft, ...(next.callsignReservations ?? [])].filter(a => a.id !== edited.id).map(a => a.callsign));
      if (error) return {state, error};
      if ((next.callsignReservations?.length ?? 0) >= 19900) return {state, error: "Start a new exercise before adding more callsigns."};
      reserveCallsigns(next, [...next.aircraft, edited]);
    }
    if (action.kind === "edit" && edited.radar?.patternJoin && action.patch.frequency !== undefined && !radarArrivalFrequency(action.patch.frequency)) {
      edited.mode = "heading";
      edited.radar = {...edited.radar, patternJoin: undefined, transferred: action.patch.frequency !== radarControlFrequency(edited)};
    }
    if (trainingMode(state) === "local" ? !!edited.radar : !edited.radar || edited.radar.station !== trainingMode(state) || !!radarTrafficStateError(edited, AIRPORT)) return {state, error: "Aircraft does not match this exercise's training mode."};
    if (edited.radar) {
      if ([edited.radar.expected, edited.radar.cleared, edited.radar.requestedApproach].some(id => id && !radarEnvironment.approaches.some(p => p.id === id))) return {state, error: "Aircraft approach is missing from the training environment."};
      if (edited.radar.cleared && edited.radar.cleared !== edited.radar.expected) return {state, error: "Approach clearance must match the expected approach."};
    }
  }
  if ((action.kind === "command" || action.kind === "maneuver") && action.command.type === "give-way") {
    const targetId = action.command.aircraftId;
    if (targetId) {
      const target = next.aircraft.find(a => a.id === targetId);
      if (!target || !target.active || target.id === aircraft!.id || target.altitude >= AIRPORT.elevation + 1000 || !["parked", "pushback", "taxi", "lineup", "rollout"].includes(target.mode)) return {state, error: "Choose another active ground aircraft to give way to."};
      let leader: Aircraft | undefined = target;
      const visited = new Set([aircraft!.id]);
      while (leader) {
        if (visited.has(leader.id)) return {state, error: "This would create a circular Give way instruction. Cancel the previous yield with Continue Taxi first."};
        visited.add(leader.id); const nextId: string | undefined = leader.giveWay?.aircraftId; leader = next.aircraft.find(a => a.id === nextId);
      }
    }
  }
  const changedPositionId = action.kind === "edit" ? action.patch.positionId : action.kind === "spawn" ? action.aircraft.positionId : undefined;
  if (changedPositionId && !state.positions?.some(p => p.id === changedPositionId)) return {state, error: "Controller position is unavailable."};
  if (action.kind === "command" && !action.resendOf) {
    const {replyTo} = action;
    action = {...action, command: controllerInstruction(aircraft!, action.command, radarEnvironment, next.messages.find(m => m.id === replyTo), action.frequency)};
  }
  if (action.kind === "command" || action.kind === "maneuver") {
    const error = action.kind === "command" ? validateControllerMessage(next, aircraft!, action.command, action.frequency, action.replyTo, !action.resendOf) : validateAssignment(aircraft!, action.command, undefined, next.aircraft);
    if (error) return {state, error};
    if (action.kind === "maneuver") {
      if(["expect-approach","vector","missed-approach","route","runway","taxi","lineup","takeoff","land","pattern","go-around","cancel-landing"].includes(action.command.type))delete aircraft!.assigned;
      instruct(aircraft!, action.command, next.aircraft);
      conflictCommand(next, aircraft!.id, action.command, conflictEngine, true);
      assignSequence(next.aircraft, aircraft!, action.command);
      if (action.command.type !== "frequency") aircraft!.lastRunway = aircraft!.runway ?? aircraft!.lastRunway;
    }
  }
  if (action.kind === "conflict") {const error = startConflict(next, AIRPORT, conflictEngine, envelope.id, action.conflict, action.aircraftId, action.otherId); if (error) return {state, error};}
  if (action.kind === "cancel-conflict") {const c = next.conflicts?.find(c => c.id === action.conflictId); if (!c) return {state, error: "Conflict no longer exists."}; c.phase = "cancelled"; c.outcome = "Cancelled by staff"; for (const a of next.aircraft.filter(a => [c.first, c.second].includes(a.id))) {delete a.conflictMotion; delete a.conflictRequest; if (c.kind === "uwc") {a.extended = false; if (a.leg === "upwind") instruct(a, {type: "pattern", leg: "crosswind"});}}}
  switch (action.kind) {
    case "reset": {const reset = initialExercise(state.id); reset.trainingStation = state.trainingStation; if (state.positions) {reset.positions = structuredClone(state.positions); for (const a of reset.aircraft) if (a.frequency === "approach") a.positionId = state.positions[0].id;} reset.autoReadback = state.autoReadback ?? false; reset.revision = state.revision + 1; reset.processed = [...state.processed.slice(-511), envelope.id]; return {state: reset};}
    case "facilities": next.radarEnvironment={...radarEnvironment,facilityActivity:{...action.activity}};break;
    case "weather": next.weather = {...action.weather}; next.atis={...next.atis,weather:{...action.weather}};break;
    case "play": next.running = true; next.pausedByStaff = false; break;
    case "pause": next.running = false; next.pausedByStaff = true; next.pauseVisibility = action.visibility ?? "hidden"; break;
    case "demonstrate": if (action.enabled) next.demonstration ??= {startedAt: next.elapsed, ...(action.positionId ? {positionId: action.positionId} : {})}; else delete next.demonstration; break;
    case "auto-readback": {
      next.autoReadback = action.enabled;
      if (!action.enabled) for (const a of next.aircraft) if (a.airportSighting) a.airportSighting.seconds = 0;
      for (const m of next.messages) delete m.autoReadbackAt;
      if (action.enabled) for (const a of next.aircraft) {
        const command = pendingCommands(next, a.id).at(-1);
        if (command) command.autoReadbackAt = next.elapsed + AUTO_READBACK_DELAY;
      }
      break;
    }
    case "all-full-stop":
      if (action.enabled === false) {
        for (const a of next.aircraft) {const landing = next.fullStopAll?.[a.id]; if (landing) a.landing = landing;}
        delete next.fullStopAll; break;
      }
      next.fullStopAll = {...next.fullStopAll};
      for (const a of next.aircraft) {next.fullStopAll[a.id] ??= a.landing; fullStop(a);}
      break;
    case "report-position": {
      if (!aircraft!.active || aircraft!.frequency !== "tower" || !["pattern", "heading", "go-around"].includes(aircraft!.mode)) return {state, error: "Position reports require airborne traffic on Tower."};
      next.messages.push({id: envelope.id, aircraftId: aircraft!.id, time: envelope.time, frequency: "tower", sender: "pilot", text: positionReportText(aircraft!, AIRPORT), read: false});
      break;
    }
    case "spawn": {
      if (next.aircraft.length >= MAX_AIRCRAFT) return {state, error: `This exercise supports up to ${MAX_AIRCRAFT} aircraft.`};
      if (next.aircraft.some(a => a.id === action.aircraft.id)) return {state, error: "Aircraft already exists."};
      const spawned = structuredClone(action.aircraft);
      next.aircraft.push(spawned);
      if (next.fullStopAll) {next.fullStopAll[spawned.id] = spawned.landing; fullStop(spawned);}
      if (!options.suppressSpawnRequest && spawned.active && spawned.frequency && spawned.frequency !== "atis") {
        const ground = spawned.altitude <= AIRPORT.elevation + 1;
        const requestId = spawned.frequency === "unicom" ? ground ? "unicom-taxi" : "unicom-inbound"
          : ground ? groundReady(spawned, AIRPORT) ? "taxi-runway" : "pushback"
          : spawned.frequency === "tower" ? spawned.landing === "touch-and-go" ? "inbound-option" : "inbound-land" : "request-approach";
        const request = resolvePilotRequest({requestId})!;
        const selection = {id: request.id, runway: spawned.runway ?? DEFAULT_RUNWAY, ...(requestId === "unicom-inbound" ? {outcome: spawned.landing} : {})};
        next.messages.push({id: envelope.id, aircraftId: spawned.id, time: envelope.time, frequency: spawned.frequency, sender: "pilot", text: pilotRequestText(spawned, request, selection.runway, false, {...selection, exercise: next}), request: selection, requestCircuit: spawned.circuit ?? 0, read: false});
        if (spawned.radar && ["check-in", "approach-request", "intentions"].includes(spawned.radar.report ?? "")) delete spawned.radar.report;
      }
      break;
    }
    case "remove": if (next.fullStopAll) delete next.fullStopAll[action.aircraftId]; reserveCallsigns(next, [aircraft!]); next.aircraft = next.aircraft.filter(a => a.id !== action.aircraftId); removeConflictAircraft(next, action.aircraftId); break;
    case "taxi-path": {const error = applyTaxiPathEdit(aircraft!, action.path, action.edit); if (error) return {state, error}; break;}
    case "edit":
      if (["runway", "position", "altitude"].some(key => key in action.patch)) delete aircraft!.takeoffOutcome;
      if (["runway","altitude","heading","radar","targetSpeed","speedTargets"].some(key=>key in action.patch)) delete aircraft!.assigned;
      if (["frequency","runway","position","taxiPath","taxiIndex"].some(key=>key in action.patch))delete aircraft!.towerCheckInPending;
      if (["runway", "position", "taxiPath", "taxiIndex"].some(key => key in action.patch)) aircraft!.releasedHold = null;
      if (["frequency", "runway", "position", "taxiPath", "taxiIndex"].some(key => key in action.patch)) delete aircraft!.arrivalRequest;
      if (["runway", "position", "taxiPath", "taxiIndex"].some(key => key in action.patch)) {delete aircraft!.arrivalExit; delete aircraft!.runwayExit;}
      if (action.patch.clearedToLand === false || action.patch.runway && action.patch.runway !== aircraft!.runway) clearLanding(aircraft!); if (["frequency", "runway", "position", "taxiPath", "taxiIndex"].some(key => key in action.patch)) delete aircraft!.contactTowerAtHold; if (action.patch.runway && action.patch.runway !== aircraft!.runway || action.patch.hand && action.patch.hand !== aircraft!.hand) aircraft!.patternFinalDistance = undefined; if (["frequency", "runway", "position", "taxiPath", "taxiIndex"].some(key => key in action.patch)) {delete aircraft!.groundYield; delete aircraft!.giveWay; delete aircraft!.automaticRequest; delete aircraft!.parkingAfterContact;}
      if(action.patch.frequency!==undefined)delete aircraft!.facilityId;
      Object.assign(aircraft!, action.patch);
      if (aircraft!.radar?.gpsApproach && action.patch.flightPlan) {
        delete aircraft!.radar.gpsApproach; delete aircraft!.radar.cleared;
        aircraft!.radar.captured = false; aircraft!.radar.navigation = aircraft!.flightPlan[aircraft!.radar.routeIndex] ? "route" : "heading";
      }
      if (aircraft!.radar && action.patch.position) delete aircraft!.radar.localizerIntercept;
      if (action.patch.targetSpeed !== undefined || action.patch.speedMode !== undefined) delete aircraft!.speedInstruction;
      if (action.patch.tag !== undefined && action.patch.tagAngle === undefined) delete aircraft!.tagAngle;
      if (aircraft!.radar && (action.patch.targetSpeed !== undefined || action.patch.speedMode !== undefined)) delete aircraft!.radar.speed;
      if (action.patch.frequency !== undefined) updateRadarFrequency(aircraft!);
      if (aircraft!.radar && action.patch.altitude !== undefined) {aircraft!.radar.targetAltitude = undefined; delete aircraft!.radar.altitudeFromRoute; aircraft!.radar.altitudeAssignedFrom = undefined;}
      if (action.patch.intentions && aircraft!.transitionAltitude !== undefined) aircraft!.transitionOverheadArmed = intentionsOf(aircraft!).afterTransition === "touch-and-go"; if (action.patch.targetSpeed !== undefined && action.patch.speedMode === undefined) aircraft!.speedMode = "manual"; if (action.patch.runway && action.patch.runway !== state.aircraft.find(a => a.id === action.aircraftId)?.runway) aircraft!.lastRunway = state.aircraft.find(a => a.id === action.aircraftId)?.runway ?? aircraft!.lastRunway; break;
    case "read": for (const m of next.messages) if (m.aircraftId === aircraft!.id && m.sender === "pilot" && (!action.frequency || m.frequency === action.frequency)) m.read = true; aircraft!.reminderAt = null; break;
    case "atis": next.atis = currentAtisOptions(action.draft); break;
    case "publish-atis": next.atis = currentAtisOptions(next.atis); next.publishedAtis = atisText(next.atis); next.publishedDraft = structuredClone(next.atis); break;
    case "pilot": {
      if (!aircraft!.frequency || aircraft!.frequency === "atis") return {state, error: "Tune the aircraft to a controller frequency first."};
      let pilotText = action.text;
      if (action.request) {
        if (action.replyTo || action.assign) return {state, error: "A pilot request cannot also answer a controller command."};
        const request = resolvePilotRequest({requestId: action.request.id});
        if (["minimum-fuel","emergency-fuel"].includes(action.request.id) && !action.request.confirmed) return {state,error:"Confirm the fuel endurance disclosure before sending."};
        const legacyEntry = options.legacyPatternEntry && request?.id === "pattern-entry" && aircraft!.frequency === "tower";
        if (!request || !legacyEntry && !pilotRequests(aircraft!).some(r => r.id === request.id)) return {state, error: "This pilot request is unavailable for the aircraft's phase or frequency."};
        pilotText = pilotRequestText(aircraft!, request, action.request.runway, action.request.remainingInPattern, {...action.request, exercise: next});
        if (aircraft!.radar?.report === "intentions" && ["request-approach", "departure-direction"].includes(request.id) || ["approach-request", "check-in"].includes(aircraft!.radar?.report ?? "") && ["request-approach", "check-in"].includes(request.id)) delete aircraft!.radar!.report;
        if (request.id === "departure") {aircraft!.requestedPatternDeparture = !!action.request.remainingInPattern; delete aircraft!.towerCheckInPending;aircraft!.intentions = {...intentionsOf(aircraft!), taxi: "runway", flight: action.request.remainingInPattern ? "pattern" : "departure"}; delete aircraft!.automaticRequest;}
        if (["minimum-fuel","emergency-fuel"].includes(request.id) && aircraft!.fuel) aircraft!.fuel={...aircraft!.fuel,declared:request.id==="minimum-fuel"?"minimum":"emergency"};
        if (["report-position","unicom-inbound"].includes(request.id) && action.request.outcome) aircraft!.landing=action.request.outcome;
        if(request.id === "inbound-option") aircraft!.landing="touch-and-go";
        if (request.id === "airport-in-sight") {delete aircraft!.reportAirportInSight; delete aircraft!.airportSighting;}
        if (request.id === "taxi-parking") aircraft!.intentions = {...intentionsOf(aircraft!), taxi: "parking"};
        if (request.id === "taxi-runway") aircraft!.intentions = {...intentionsOf(aircraft!), taxi: "runway"};
        if (["go-around","unicom-go-around"].includes(request.id) && !aircraft!.radar) instruct(aircraft!, {type: "go-around"});
        if (["missed-approach", "unicom-go-around"].includes(request.id) && aircraft!.radar) {
          const altitude = {unit: "feet" as const, value: Math.max(5000, Math.ceil((Math.max(aircraft!.altitude, AIRPORT.elevation) + 1000) / 500) * 500)};
          if (altitude.value <= 17500) instruct(aircraft!, {type: "missed-approach", altitude});
          else instruct(aircraft!, {type: "missed-approach", altitude: {unit: "flight-level", value: Math.min(600, Math.ceil(altitude.value / 1000) * 10)}});
        }
      }
      if (action.replyTo && pendingCommands(next, aircraft!.id).at(-1)?.id !== action.replyTo) return {state, error: "This command has already been answered or superseded. Only the latest command can be answered."};
      const command = next.messages.find(m => m.id === action.replyTo);
      if (action.assign) {
        if (!command?.instruction) return {state, error: "This message has no pending instruction to assign."};
        if (command.instruction.type === "land" && command.clearanceCircuit !== undefined && command.clearanceCircuit !== (aircraft!.circuit ?? 0)) return {state, error: "This landing clearance belongs to a previous circuit."};
        const error = validateAssignment(aircraft!, command.instruction, command.frequency, next.aircraft);
        if (error) return {state, error};
        const previousRunway = aircraft!.runway, previousCircuit = aircraft!.circuit, wasArrival = arrivalTraffic(aircraft!);
        instruct(aircraft!, command.instruction, next.aircraft);
        conflictCommand(next, aircraft!.id, command.instruction, conflictEngine, true);
        if (command.instruction.type === "pattern" && command.instruction.sequence && (aircraft!.runway !== previousRunway || aircraft!.circuit !== previousCircuit || !wasArrival)) assignSequence(next.aircraft, aircraft!, command.instruction);
        if (command.instruction.type !== "frequency") aircraft!.lastRunway = aircraft!.runway ?? aircraft!.lastRunway;
      }
      const requestSelection = action.request?.id === "diversion" ? {...action.request, destination: aircraft!.diversionDestination ? structuredClone(aircraft!.diversionDestination) : undefined} : action.request;
      next.messages.push({id: envelope.id, aircraftId: aircraft!.id, time: envelope.time, frequency: command?.frequency ?? aircraft!.frequency!, sender: "pilot", text: pilotText, ...(!action.assign && !action.request && /^Unable\b/i.test(pilotText) ? {unableReason: (command && commandUnableReason(aircraft!, command, next.aircraft)) ?? "Declined by mentor."} : {}), commandId: action.replyTo, read: !!action.replyTo, ...(requestSelection ? {request: requestSelection, requestCircuit: aircraft!.circuit ?? 0} : {})}); break;
    }
    case "command": {
      let c = roundedHeadingInstruction(action.command);
      if ((c.type === "taxi" || c.type === "pushback") && c.route) c = {...c, route: structuredClone(c.route)};
      if (c.type === "taxi" && c.route) c.contactTowerWhenReady = c.route.destination.type === "runway" && !c.route.points.some(p => p.hold);
      const calculatedTaxi = c.type === "taxi" && c.runway && !c.route ? planTaxiRoute(AIRPORT, aircraft!.position, c.runway) : undefined;
      const calculatedHold = calculatedTaxi?.path?.find(p => p.hold);
      if (c.type === "taxi" && calculatedTaxi?.path) c = {...c, contactTowerWhenReady: c.contactTowerWhenReady !== false && !calculatedHold};
      if(c.type==="atc" && c.action==="hold"){const point=c.index===undefined?undefined:aircraft!.flightPlan[c.index];c={...c,...(point?{point:{x:point.x,y:point.y},...(point.waypointType?{waypointType:point.waypointType}:{}),name:point.name??radarEnvironment.fixes.find(f=>distance(f.point,point)<.001)?.id??`Waypoint ${c.index!+1}`} : {}),inbound:trueToMagnetic(point?bearing(aircraft!.position,point):aircraft!.heading,AIRPORT)};}
      conflictCommand(next, aircraft!.id, c, conflictEngine, false);
      if (c.type === "missed-approach" && !action.resendOf) c = {...c, fromAltitude: aircraft!.altitude};
      if (c.type === "atc" && c.action === "bookmark") {next.bookmarks = [...(next.bookmarks ?? []), {id: envelope.id, elapsed: next.elapsed, aircraftId: aircraft!.id, label: c.text ?? aircraft!.callsign}]; break;}
      if (c.type === "atc" && c.action === "radar-contact" && c.variant === "request" && aircraft!.radar) aircraft!.radar.report = "approach-request";
      if (c.type === "departure" && next.autoReadback) instruct(aircraft!, c, next.aircraft);
      if (aircraft!.radar && c.type === "radio" && c.message === "say-intentions") aircraft!.radar.report = "intentions";
      if (c.type === "radio" && ["correction-standby", "disregard"].includes(c.message)) {
        const previous = c.message === "correction-standby" ? pendingCommands(next, aircraft!.id).filter(m => m.frequency === action.frequency).at(-1) ?? next.messages.filter(m => m.aircraftId === aircraft!.id && m.sender === "controller" && m.frequency === action.frequency && commandHasReadback(m.instruction) && !m.retractedBy).at(-1) : next.messages.filter(m => m.aircraftId === aircraft!.id && m.sender === "controller" && m.frequency === action.frequency).at(-1);
        if (previous) {previous.retractedBy = envelope.id; delete previous.autoReadbackAt;}
      }
      recordControllerAssignment(aircraft!, c, radarEnvironment);
      // Sequence commands identify actual traffic immediately; readbacks never re-resolve it.
      assignSequence(next.aircraft, aircraft!, c);
      if (c.type === "land" && c.number === 1) aircraft!.sequence = undefined;
      const original = action.resendOf ? next.messages.find(m => m.id === action.resendOf && m.sender === "controller" && m.aircraftId === aircraft!.id && m.frequency === action.frequency) : undefined;
      if (action.resendOf && (!original?.instruction || JSON.stringify(original.instruction) !== JSON.stringify(c))) return {state, error: "The original controller message is unavailable."};
      const radarText = original ? undefined : radarInstructionText(aircraft!, c, radarEnvironment, AIRPORT);
      const referenceText = c.type === "atc" ? catalogFor(AIRPORT, radarEnvironment, selection.weather).instructionText(aircraft!, c) : undefined;
      const groundText = c.type === "taxi" ? catalogFor(AIRPORT, radarEnvironment, selection.weather).instructionText(aircraft!, c) + (calculatedHold ? `, hold short${calculatedHold.runway ? ` of runway ${calculatedHold.runway}` : " at waypoint"}` : "") : undefined;
      next.messages.push({id: envelope.id, aircraftId: aircraft!.id, time: envelope.time, frequency: action.frequency, sender: "controller", text: original ? original.text : referenceText ?? groundText ?? (radarText === undefined ? action.text : `${aircraft!.callsign}, ${radarText}`), instruction: c, ...(c.type === "land" ? {clearanceCircuit: aircraft!.circuit ?? 0} : {}), ...(action.replyTo ? {replyTo: action.replyTo} : {}), ...(next.demonstration ? {demonstrated: true} : {}), ...(next.autoReadback && commandHasReadback(c) ? {autoReadbackAt: next.elapsed + AUTO_READBACK_DELAY} : {})}); break;
    }
  }
  for (const a of next.aircraft) {
    const join = a.radar?.patternJoin;
    if (join?.status === "unable" && !join.notified) {
      join.notified = true;
      next.messages.push({id: `${envelope.id}:pattern:${a.id}`, aircraftId: a.id, time: envelope.time, frequency: "tower", sender: "pilot", text: `${a.callsign}, unable to join the local pattern`, unableReason: join.reason ?? "No reachable pattern entry."});
    }
  }
  if (next.positions?.length) {
    for (const a of next.aircraft) if (a.frequency === "approach" && !a.positionId) a.positionId = next.positions[0].id;
    // Only new split transmissions need attribution. Historical messages are immutable.
    const previousMessages = new Set(state.messages.map(m => m.id));
    for (const message of next.messages) if (!previousMessages.has(message.id)) {
      const old = state.aircraft.find(a => a.id === message.aircraftId), current = next.aircraft.find(a => a.id === message.aircraftId);
      const command = next.messages.find(m => m.id === message.commandId);
      const source = command?.positionId ?? (current && aircraftPosition(next, current)) ?? (old && aircraftPosition(state, old));
      if (source) message.positionId = source;
    }
  }
  retireRetunedCommands(next, state.aircraft);
  next.messages = next.messages.slice(-300);
  reconcileSequences(next.aircraft);
  for (const a of next.aircraft) a.pending = unreadMessages(next, a.id);
  if (action.kind === "edit") automaticSpeed(aircraft!);
  next.processed = [...next.processed.slice(-511), envelope.id];
  next.revision++;
  return {state: next};
}

const AUTO_READBACK_DELAY = 1.5;

function validateControllerMessage(state: Exercise, a: Aircraft, command: Instruction, frequency: Frequency, replyTo?: string, resolveContext = true): string | null {
  const request = state.messages.find(m => m.id === replyTo && m.aircraftId === a.id && m.frequency === frequency && m.sender === "pilot" && !m.commandId);
  if (resolveContext) command = controllerInstruction(a, command, radarEnvironment, request, frequency);
  if (resolveContext && command.type === "atc" && command.action === "diversion" && !diversionRequestDestination(a, request, frequency)) return "A diversion reply requires a pilot request with a destination airport.";
  if (command.type === "frequency" && command.targetPositionId) {
    const target = state.positions?.find(p => p.id === command.targetPositionId);
    if (!target || target.id === aircraftPosition(state, a) || command.frequency !== target.service || command.facilityId !== target.facilityId || command.mhz !== target.mhz) return "Choose another configured controller position.";
  } else if (command.type === "frequency" && command.frequency !== null) {
    const allowed = availableHandoffs(a, AIRPORT, frequency, radarEnvironment.facilities, radarEnvironment).filter(f => facilityActive(f, radarEnvironment));
    if (!allowed.some(f => f.type === command.frequency && (!command.facilityId || f.id === command.facilityId))) return "Choose the other local controller frequency, Traffic in radar training, or Frequency Change Approved.";
  }
  if (command.type === "atc" && command.action === "guard") {
    if (!a.active || frequency === "atis" || !controlledFrequencies(state).includes(frequency) || command.frequency !== frequency) return "Choose an active controller frequency for the guard warning.";
    return validateInstruction(a, command, frequency, state.aircraft);
  }
  if (trainingMode(state) !== "local") {
    if (!a.radar || !a.active || a.radar.transferred || frequency !== radarControlFrequency(a)) return "Aircraft is not controlled on this training frequency.";
    if (!["vector", "expect-approach", "missed-approach", "route", "speed", "radar-speed", "frequency", "radio", "atc"].includes(command.type)) return "This instruction is unavailable in radar training.";
    if (command.type === "speed" && (command.value < 80 || command.value > 600)) return "Choose a speed from 80 to 600 knots.";
    if (command.type === "frequency" && command.frequency === "atis") return "Transfer to a controller frequency.";
  } else if (["vector", "expect-approach", "missed-approach", "route"].includes(command.type)) return "This instruction requires Approach or Center training.";
  const invalid = validateInstruction(a, command, frequency, state.aircraft); if (invalid) return invalid;
  if (command.type === "radio" && command.message === "unable" && !request) return "Unable is available only as a reply to a pilot message.";
  return null;
}

function readbackText(callsign: string, text: string, instruction?: Instruction): string {
  return pilotReadback(callsign, text, instruction);
}
/** Authoritative session tick only. Client motion prediction never generates radio replies. */

function commandUnableReason(a: Aircraft, command: Message, traffic: Aircraft[]): string | null {
  if (!command.instruction) return null;
  return visualClearanceUnable(a, command.instruction, AIRPORT, radarEnvironment, EXERCISE_WEATHER)
    ?? automaticRadarUnable(a, command.instruction)
    ?? (command.instruction.type === "land" && command.clearanceCircuit !== undefined && command.clearanceCircuit !== (a.circuit ?? 0)
      ? "This landing clearance belongs to a previous circuit."
      : validateAssignment(a, command.instruction, command.frequency, traffic));
}

function autoReadbacks(state: Exercise, now: number, createId: () => string): Exercise {
  if (!state.running) return state;
  let next = state;
  for (const a of next.aircraft.filter(a => state.autoReadback && a.reportAirportInSight && a.frequency && a.frequency !== "atis" && airportSightingReady(a, AIRPORT, state.elapsed))) {
    next = structuredClone(next); delete next.aircraft.find(other => other.id === a.id)!.reportAirportInSight;
    next = applyEnvelope(next, {id: createId(), time: now, action: {kind: "pilot", aircraftId: a.id, text: "", request: {id: "airport-in-sight", runway: a.runway ?? DEFAULT_RUNWAY}}}).state;
  }
  for (const a of state.aircraft.filter(a => a.radar?.report && (state.autoReadback || a.radar.report === "touch-and-go" || a.radar.report === "missed") && !(a.radar.navigation === "missed" && radarArrivalFrequency(a.frequency)) && !a.radar.departure && a.active && a.frequency && a.frequency !== "atis")) {
    next = structuredClone(next);
    delete next.aircraft.find(other => other.id === a.id)!.radar!.report;
    delete next.aircraft.find(other => other.id === a.id)!.radar!.missedReason;
    if (a.radar!.report === "approach-request") {
      next = applyEnvelope(next, {id: createId(), time: now, action: {kind: "pilot", aircraftId: a.id, text: "", request: {id: "request-approach", runway: radarRequestedApproach(a, radarEnvironment)?.runway ?? a.runway ?? DEFAULT_RUNWAY}}}).state;
      continue;
    }
    const intention = a.radar!.report === "intentions";
    const request = intention && (a.radar!.flight || radarRequestedApproach(a, radarEnvironment)) ? {id: a.radar!.flight === "departure" ? "departure-direction" as const : "request-approach" as const, runway: a.runway ?? DEFAULT_RUNWAY, direction: a.radar!.departureDirection} : ["check-in", "touch-and-go"].includes(a.radar!.report!) ? {id: "check-in" as const, runway: a.runway ?? DEFAULT_RUNWAY} : undefined;
    const text = a.radar!.report === "missed" ? `${a.callsign}, executing missed approach` : intention ? `${a.callsign}, ${radarIntentionText(a, AIRPORT, radarEnvironment)}` : checkInTransmission(a, FREQUENCIES[a.frequency ?? "approach"].name);
    next = applyEnvelope(next, {id: createId(), time: now, action: {kind: "pilot", aircraftId: a.id, text, request}}).state;
    if (a.radar!.report === "missed" && a.radar!.missedReason) next.messages.at(-1)!.unableReason = a.radar!.missedReason;
  }
  for (const a of next.aircraft.filter(a => a.conflictRequest || a.selfGoAroundPending && (state.autoReadback || state.conflicts?.some(c => c.kind === "cancel-takeoff" && c.first === a.id)))) {
    next = structuredClone(next);
    const plane = next.aircraft.find(p => p.id === a.id)!;
    const request = plane.conflictRequest; delete plane.conflictRequest;
    const goAround = plane.selfGoAroundPending; delete plane.selfGoAroundPending;
    if (request) next = applyEnvelope(next, {id: createId(), time: now, action: {kind: "pilot", aircraftId: a.id, text: "", request}}).state;
    if (goAround && a.frequency === "tower") next = applyEnvelope(next, {id: createId(), time: now, action: {kind: "pilot", aircraftId: a.id, text: `${a.callsign}, going around`}}).state;
  }
  if (!state.autoReadback) return next;
  for (const a of state.aircraft.filter(a => a.arrivalRequest)) {
    next = structuredClone(next);
    delete next.aircraft.find(other => other.id === a.id)!.arrivalRequest;
    next.revision++;
    const frequency = a.arrivalRequest === "taxi-parking" ? "ground" : "tower";
    if (a.frequency === frequency) {
      if (a.arrivalRequest === "frequency-change") next.aircraft.find(other => other.id === a.id)!.parkingAfterContact = true;
      next = applyEnvelope(next, {id: createId(), time: now, action: {kind: "pilot", aircraftId: a.id,
        text: "", request: {id: a.arrivalRequest === "taxi-parking" ? "taxi-parking" : "frequency-change", runway: a.runway ?? DEFAULT_RUNWAY}}}).state;
    }
  }
  for (const a of next.aircraft.filter(a => a.automaticRequest)) {
    const request = a.automaticRequest!;
    const id = request === "taxi" ? intentionsOf(a).taxi === "parking" ? "taxi-parking" : "taxi-runway" : request === "departure" ? "departure" : request;
    const blockedDeparture = request === "departure" && next.conflicts?.some(c => c.kind === "cancel-takeoff" && c.second === a.id && !["complete", "cancelled"].includes(c.phase));
    const valid = !blockedDeparture && (request === "taxi" ? a.mode === "parked" && a.frequency === "ground" : request === "departure" ? atDepartureHold(a) && a.frequency === "tower" : ["heading", "pattern"].includes(a.mode) && a.frequency === "tower");
    next = structuredClone(next); delete next.aircraft.find(other => other.id === a.id)!.automaticRequest; next.revision++;
    const pending = a.frequency ? pendingPilotMessage(next, a.id, a.frequency) : undefined;
    const instruction = pendingCommands(next, a.id).at(-1)?.instruction;
    const alreadyCleared = request === "taxi" && instruction?.type === "taxi" || request === "departure" && (instruction?.type === "takeoff" || instruction?.type === "lineup");
    if (valid && pending?.request?.id !== id && !alreadyCleared) next = applyEnvelope(next, {id: createId(), time: now, action: {kind: "pilot", aircraftId: a.id, text: "", request: {id, runway: a.departureRunway ?? a.runway ?? DEFAULT_RUNWAY, remainingInPattern: intentionsOf(a).flight === "pattern"}}}).state;
  }
  for (const a of next.aircraft.filter(a => a.selfGoAroundPending)) {
    next = structuredClone(next);
    delete next.aircraft.find(other => other.id === a.id)!.selfGoAroundPending;
    if (a.frequency === "ground" || a.frequency === "tower") next = applyEnvelope(next, {id: createId(), time: now, action: {kind: "pilot", aircraftId: a.id, text: `${a.callsign}, going around`}}).state;
  }
  for (const a of state.aircraft) {
    const command = pendingCommands(next, a.id).at(-1);
    if (!command?.instruction || command.autoReadbackAt === undefined || command.autoReadbackAt > next.elapsed + 1e-8) continue;
    // A manual retune invalidates an old instruction; never execute it on another frequency.
    if (a.frequency !== command.frequency || a.frequency === "atis") {
      next = structuredClone(next);
      delete next.messages.find(m => m.id === command.id)!.autoReadbackAt;
      next.revision++;
      continue;
    }
    const error = commandUnableReason(a, command, next.aircraft);
    const result = applyEnvelope(next, {id: createId(), time: now, action: {
      kind: "pilot", aircraftId: a.id, replyTo: command.id, assign: !error,
      text: error ? `Unable, ${a.callsign}` : readbackText(a.callsign, command.text, command.instruction),
    }});
    next = result.state;
  }
  return next;
}
const NEXT_LEG: Record<Leg, Leg> = {upwind: "crosswind", crosswind: "downwind", downwind: "base", base: "final", final: "upwind"};
// Include roll-in and wind-driven travel when anticipating pattern corners.
const turnLead = (a: Aircraft) => Math.max(.12, bankTurnLead(a.groundSpeed ?? a.speed) * 1.2);
interface SequenceGuidance {extendDownwind: boolean; holdEntry?: boolean; speedLimit?: number}
/** Compare arrival times at the shared final, including traffic on the opposite hand.
 * Wait for the predecessor to turn base: its own downwind may still be extended.
 * Underestimate our turn distance and overestimate theirs to leave a spacing margin. */

function approachSeconds(a: Aircraft, joiningBase = false) {
  const g = runwayGeometry(a.runway ?? DEFAULT_RUNWAY), q = runwayCoordinates(a.position, g);
  const finalDistance = a.leg === "final" ? Math.max(0, -q.along)
    : Math.max(defaultBaseDistance(a), a.patternFinalDistance ?? 0, -q.along + (joiningBase ? turnLead(a) : 0));
  const stages: [number, number][] = [];
  if (a.leg !== "final") {
    const radius = turnLead(a);
    // A joining aircraft still has the downwind-to-base turn ahead of it.
    const base = Math.max(0, Math.abs(q.lateral) + (joiningBase ? Math.PI - 2 : -.4) * radius);
    stages.push([base, a.speedTargets?.base ?? 180]);
  }
  stages.push([Math.max(0, finalDistance - 4.5), a.speedTargets?.final ?? 180],
    [Math.max(0, Math.min(finalDistance, 4.5) - 2), a.speedTargets?.final ?? 160],
    [Math.min(finalDistance, 2), a.speedTargets?.vref ?? 135]);
  let speed = Math.max(1, a.speed), seconds = 0;
  for (const [nm, target] of stages) {
    if (a.speedMode === "manual") {seconds += nm * 3600 / Math.max(1, Math.min(a.speed, a.targetSpeed)); continue;}
    const acceleration = Math.sign(target - speed) * DEFAULTS.acceleration;
    const changing = Math.abs(target - speed) / DEFAULTS.acceleration;
    const changeDistance = (speed + target) / 2 * changing / 3600;
    if (nm < changeDistance && acceleration) {
      const endSpeed = Math.sqrt(Math.max(1, speed ** 2 + 2 * acceleration * nm * 3600));
      seconds += (endSpeed - speed) / acceleration; speed = endSpeed;
    } else {seconds += changing + (nm - changeDistance) * 3600 / Math.max(1, target); speed = target;}
  }
  return seconds;
}


const deniedJoins = new WeakMap<Aircraft,{leader:Aircraft; own:Point; ahead:Point; heading:number; leaderHeading:number; speed:number; leaderSpeed:number}>();
function finalJoinSeparated(a: Aircraft, leader: Aircraft) {
  // Allow for the half-second forecast steps and wind/bank changes before the join.
  const joinMargin = .1;
  const denied=deniedJoins.get(a);
  // Reuse only a denied turn while both aircraft move less than 0.03 NM.
  // This can delay release slightly; it can never approve an unchecked turn.
  if(denied?.leader===leader && distance(a.position,denied.own)<.03 && distance(leader.position,denied.ahead)<.03 && Math.abs(a.heading-denied.heading)<1 && Math.abs(leader.heading-denied.leaderHeading)<1 && Math.abs(a.speed-denied.speed)<1 && Math.abs(leader.speed-denied.leaderSpeed)<1)return false;
  const deny=()=>{deniedJoins.set(a,{leader,own:{...a.position},ahead:{...leader.position},heading:a.heading,leaderHeading:leader.heading,speed:a.speed,leaderSpeed:leader.speed});return false;};
  const own = motionCopy(a), ahead = motionCopy(leader), circuit = ahead.circuit ?? 0;
  const g = runwayGeometry(a.runway ?? DEFAULT_RUNWAY), unlimited = {speedLimit: Infinity, travelLimit: Infinity};
  for (let t = 0; t < 300; t += .5) {
    const ownPrevious = {...own.position, altitude: own.altitude}, aheadPrevious = {...ahead.position, altitude: ahead.altitude};
    move(own, .5, {extendDownwind: false}, unlimited, false, []);
    move(ahead, .5, {extendDownwind: false}, unlimited, false, []);
    if (own.altitude > AIRPORT.elevation + 1) advancePerformance(own, ownPrevious, .5, EXERCISE_WEATHER);
    if (ahead.altitude > AIRPORT.elevation + 1) advancePerformance(ahead, aheadPrevious, .5, EXERCISE_WEATHER);
    const ownAlong = runwayCoordinates(own.position, g).along, leaderAlong = runwayCoordinates(ahead.position, g).along;
    if ((ahead.circuit ?? 0) !== circuit) return ownAlong <= -(DEFAULTS.sequenceDistance + joinMargin) || deny();
    if (own.leg === "final" && leaderAlong - ownAlong < DEFAULTS.sequenceDistance + joinMargin) return deny();
  }
  return deny();
}


function sequenceEntrySeparated(a: Aircraft, following: Aircraft, aircraft: Aircraft[]) {
  // First create a gap on upwind. A speed cap after both aircraft have turned
  // cannot recover side-by-side traffic at equal speeds.
  const margin = DEFAULTS.sequenceDistance + .3;
  if (distance(a.position, following.position) < margin || following.mode !== "pattern"
    || !["downwind", "base", "final"].includes(following.leg) || following.extended) return false;
  const chain = [a, following];
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].patternEntry) return false;
    const leader = followedAircraft(chain[i], aircraft);
    if (leader && !chain.some(p => p.id === leader.id)) chain.push(leader);
  }
  const forecast = chain.map(motionCopy), own = forecast[0], ahead = forecast[1];
  own.leg = own.patternEntry!; delete own.patternEntry;
  // Use the same bank, wind, acceleration and sequencing as real flight. There
  // are no pending entries in this chain, so the forecast cannot recurse here.
  for (let t = 0; t < 120; t += .5) {
    stepTraffic(forecast, .5);
    if (distance(own.position, ahead.position) < margin) return false;
  }
  return true;
}

function sequenceGuidance(a: Aircraft, aircraft: Aircraft[]): SequenceGuidance {
  const following = followedAircraft(a, aircraft);
  if (a.mode !== "pattern" || !following || a.sequence?.departure) return {extendDownwind: false};
  if (a.patternEntry) return {extendDownwind: false, holdEntry: !sequenceEntrySeparated(a, following, aircraft)};
  const established = following.mode === "pattern" && ["base", "final"].includes(following.leg) && !following.extended;
  // Slow an assigned faster follower before it overtakes on downwind, not only
  // after the base turn. Keep the trainer's target speed unchanged.
  const gap = distance(a.position, following.position);
  const ahead = (following.position.x - a.position.x) * Math.sin(a.heading * radians) + (following.position.y - a.position.y) * Math.cos(a.heading * radians);
  const inTrailLimit = a.leg === following.leg && a.hand === following.hand && ahead > 0 && gap < DEFAULTS.sequenceDistance + .3 && Math.abs((a.heading - following.heading + 540) % 360 - 180) < 30
    ? Math.max(radarPerformance(a).min, following.speed - Math.max(0, DEFAULTS.sequenceDistance - gap) * 60) : undefined;
  if (!established) return {extendDownwind: a.leg === "downwind", ...(inTrailLimit === undefined ? {} : {speedLimit: inTrailLimit})};
  const finalSpeed = (a: Aircraft) => a.speedMode === "manual" ? Math.min(a.speed, a.targetSpeed) : a.speedTargets?.vref ?? 135;
  const spacing = Math.max(DEFAULTS.sequenceSeconds, DEFAULTS.sequenceDistance * 3600 / Math.max(1, Math.min(finalSpeed(a), finalSpeed(following))));
  const leaderSeconds = approachSeconds(following);
  if (a.leg === "downwind") {
    const ownSeconds = approachSeconds(a, true);
    if (ownSeconds < leaderSeconds + spacing) return {extendDownwind: true};
    const q = runwayCoordinates(a.position, runwayGeometry(a.runway ?? DEFAULT_RUNWAY));
    return {extendDownwind: -q.along >= defaultBaseDistance(a) - turnLead(a) && !finalJoinSeparated(a, following)};
  }
  if (a.leg === "base" || a.leg === "final") {
    const remaining = Math.max(0, arrivalDistance(a) - (a.leg === "base" ? 2 * turnLead(a) : 0));
    const minimum = radarPerformance(a).min;
    const delay = leaderSeconds + spacing;
    return {extendDownwind: false, speedLimit: approachSeconds(a) >= delay ? undefined : Math.max(minimum, remaining * 3600 / delay)};
  }
  return {extendDownwind: false};
}

function atDepartureHold(a: Aircraft) {
  const hold = a.taxiPath[a.taxiIndex] ?? a.taxiPath.at(-1);
  if (!hold || !departureHoldMatches(a, hold) || a.speed > 1 || a.taxiIndex < a.taxiPath.length - 1 || distance(a.position, hold) >= .005) return false;
  if (hold.hold) return ["taxi", "parked", "lineup"].includes(a.mode) && a.holding;
  // Hand-drawn paths may end without a hold flag. Only a completed runway-taxi
  // route beside the assigned runway counts as ready, never a parking stand.
  const g = runwayGeometry(a.departureRunway ?? a.runway ?? DEFAULT_RUNWAY), q = runwayCoordinates(a.position, g);
  return a.mode === "parked" && a.taxiIndex >= a.taxiPath.length && intentionsOf(a).taxi === "runway"
    && q.along >= 0 && q.along < distance(g.threshold, g.departure) && Math.abs(q.lateral) <= .1;
}

function stepTraffic(aircraft: Aircraft[], dt: number, autoGoAround = false) {
  // Read every aircraft before moving any, so array order cannot affect spacing.
  const guidance = aircraft.map(a => sequenceGuidance(a, aircraft));
  resolveGroundPriorities(aircraft, AIRPORT.elevation);
  const ground = aircraft.map(a => {return groundGuidance(a, aircraft, AIRPORT.elevation);});
  aircraft.forEach((a, index) => {const previous={...a.position,altitude:a.altitude}; move(a, dt, guidance[index], ground[index], autoGoAround, aircraft); if (a.altitude > AIRPORT.elevation + 1) advancePerformance(a, previous, dt, EXERCISE_WEATHER); else {a.groundSpeed = a.speed; a.track = a.heading; a.verticalSpeed = 0;} if(a.altitude>AIRPORT.elevation+1){a.flightSeconds=(a.flightSeconds??0)+dt; if(a.fuel) a.fuel={...a.fuel,enduranceMinutes:Math.max(0,a.fuel.enduranceMinutes-dt/60)};}});
}
const motionCopy = (a: Aircraft): Aircraft => ({...a, ...(a.airportSighting ? {airportSighting: {...a.airportSighting}} : {}), position: {...a.position}, ...(a.routeNavigation ? {routeNavigation: {...a.routeNavigation}} : {}), ...(a.atcManeuver ? {atcManeuver: {...a.atcManeuver, ...(a.atcManeuver.center ? {center: {...a.atcManeuver.center}} : {})}} : {}), ...(a.radar ? {radar: {...a.radar, ...(a.radar.gpsApproach ? {gpsApproach: {...a.radar.gpsApproach}} : {}), ...(a.radar.approachIntercept ? {approachIntercept: {...a.radar.approachIntercept}} : {}), ...(a.radar.departure ? {departure: {...a.radar.departure}} : {}), ...(a.radar.arrival ? {arrival: {...a.radar.arrival}} : {}), ...(a.radar.patternJoin ? {patternJoin: {...a.radar.patternJoin}} : {})}} : {}), ...(a.pushback ? {pushback: {...a.pushback}} : {})});

function advance(state: Exercise, seconds: number): Exercise {
  if (!state.running || !Number.isFinite(seconds) || seconds <= 0) return state;
  // Fixed substeps prevent tab scheduling and frame rate from changing flight behavior.
  const next = {...state, ...(state.conflicts ? {conflicts: state.conflicts.map(c => ({...c}))} : {}), aircraft: state.aircraft.map(motionCopy)};
  let remaining = Math.min(seconds, 5);
  while (remaining > 1e-8) {
    const dt = Math.min(remaining, 0.05);
    // A stopped head-on pair may use an alternate mapped route. A single-lane
    // obstruction with no alternate remains stopped for staff intervention.
    if (Math.floor(next.elapsed + dt) !== Math.floor(next.elapsed)) for (const a of next.aircraft) {
      if (a.mode !== "taxi" || a.holding || a.speed > 1 || intentionsOf(a).taxi !== "runway") continue;
      const blocker = next.aircraft.find(b => b.id !== a.id && b.mode === "taxi" && !b.holding && b.speed <= 1 && distance(a.position, b.position) < GROUND.spacing + .005 && Math.abs((a.heading - b.heading + 540) % 360 - 180) > 150);
      if (!blocker || a.id > blocker.id && a.giveWay?.aircraftId !== blocker.id) continue;
      const route = planTaxiRoute(AIRPORT, a.position, a.departureRunway ?? a.runway ?? DEFAULT_RUNWAY, [blocker.position]);
      if (route.path) {a.taxiPath = route.path; a.taxiIndex = 0; a.releasedHold = null; delete a.groundYield;}
    }
    prepareConflicts(next, AIRPORT, conflictEngine);
    const phases = next.aircraft.map(a => a.mode);
    stepTraffic(next.aircraft, dt, !!state.autoReadback);
    for (const [index, a] of next.aircraft.entries()) {
      advanceAirportSighting(a, AIRPORT, dt, next.elapsed, !!state.autoReadback);
      if (state.autoReadback && phases[index] === "pushback" && a.mode === "parked") a.automaticRequest = "taxi";
      if (a.giveWay) {
        const target = next.aircraft.find(other => other.id === a.giveWay!.aircraftId);
        if (!target || !target.active || target.altitude >= AIRPORT.elevation + 1000 || !groundConflict(a, target) && distance(a.position, target.position) > GROUND.spacing) delete a.giveWay;
      }
      if (state.autoReadback && a.transitionOverheadArmed && a.mode === "heading" && a.frequency === "tower" && distance(a.position, {x: 0, y: 0}) <= (intentionsOf(a).overheadRadius ?? 1)) {
        delete a.transitionOverheadArmed; a.automaticRequest = a.landing === "touch-and-go" ? "inbound-option" : "inbound-land";
      }
    }
    // Frequency changes are authoritative, never made by rendering predictions.
    for (const a of next.aircraft) if (state.autoReadback && a.contactTowerAtHold && atDepartureHold(a)) {
      if (a.frequency === "ground") {a.frequency = "tower"; a.towerCheckInPending = true;}
      delete a.contactTowerAtHold;
    }
    for (const a of next.aircraft) if (state.autoReadback && a.towerCheckInPending && a.frequency === "tower" && atDepartureHold(a)) a.automaticRequest = "departure";
    for (const a of next.aircraft) if (!a.radar?.arrival && a.arrivalExit && !a.runwayExit && ["taxi", "parked"].includes(a.mode) && runwayLateralClear(runwayCoordinates(a.position, runwayGeometry(a.runway ?? DEFAULT_RUNWAY)).lateral, runwayGeometry(a.runway ?? DEFAULT_RUNWAY).clearance)) {
      a.intentions = {...intentionsOf(a), taxi: "parking"};
      if (state.autoReadback && ["parking", "exit-runway"].includes(a.arrivalExit.instruction) && !(a.arrivalExit.followOn && a.holding) && (a.frequency === "tower" || a.frequency === "ground")) {a.frequency = "ground"; a.arrivalRequest = "taxi-parking";}
      else if (state.autoReadback && a.arrivalExit.instruction === "automatic") {if (a.frequency === "tower") a.arrivalRequest = "frequency-change"; else if (a.frequency === "ground") a.arrivalRequest = "taxi-parking";}
      delete a.arrivalExit;
      a.targetSpeed = a.mode === "taxi" ? a.expedited ? 25 : DEFAULTS.taxiSpeed : 0;
    }
    const collisions = trainingMode(next) === "local" ? [] : aircraftCollisionGroups(next.aircraft, AIRPORT.elevation);
    for (const [index, group] of collisions.entries()) {
      const event = {id: `collision:${next.revision}:${(next.elapsed + dt).toFixed(3)}:${index}`, elapsed: next.elapsed + dt,
        aircraft: group.map(a => ({id: a.id, callsign: a.callsign})),
        position: {x: group.reduce((sum, a) => sum + a.position.x, 0) / group.length, y: group.reduce((sum, a) => sum + a.position.y, 0) / group.length}};
      next.collisions = [...(next.collisions ?? []), event].slice(-300);
    }
    if (collisions.length) {
      const removed = new Set(collisions.flat().map(a => a.id));
      next.aircraft = next.aircraft.filter(a => !removed.has(a.id));
    }
    next.elapsed += dt; remaining -= dt;
    for (const a of next.aircraft) if (!a.trail.length || next.elapsed - (a.trail.at(-1)!.time ?? -Infinity) >= DEFAULTS.trailInterval - 1e-8) a.trail = [...a.trail, {...a.position, time: next.elapsed}];
  }
  next.aircraft = next.aircraft.filter(a => a.radar?.arrival?.phase !== "vacated");
  for (const a of next.aircraft) if (next.positions?.length && a.frequency === "approach" && !a.positionId) a.positionId = next.positions[0].id;
  // Stamp each new transmission with its source channel, including transfer readbacks.
  for (const message of next.messages) if (!state.messages.some(m => m.id === message.id)) {
    const old = state.aircraft.find(a => a.id === message.aircraftId), current = next.aircraft.find(a => a.id === message.aircraftId);
    const command = next.messages.find(m => m.id === message.commandId);
    const source = command?.positionId ?? (current && aircraftPosition(next, current)) ?? (old && aircraftPosition(state, old));
    if (source) message.positionId = source;
  }
  retireRetunedCommands(next, state.aircraft);
  next.revision++;
  for (const a of next.aircraft) a.trail = a.trail.filter(p => p.time !== undefined && p.time >= next.elapsed - DEFAULTS.radarSeconds - 1e-8).slice(-120);
  reconcileSequences(next.aircraft);
  return next;
}

function move(a: Aircraft, dt: number, guidance: SequenceGuidance, ground: GroundGuidance, autoGoAround: boolean, traffic: Aircraft[]) {
  if (moveReference(a, dt)) return;
  if (["parked", "pushback", "taxi", "lineup", "rollout"].includes(a.mode) || a.mode === "takeoff" && a.altitude <= AIRPORT.elevation + 1) a.bankAngle = 0;
  if (!a.active) return;
  // Resume old full-stop snapshots using the same mapped exits as new arrivals.
  if (a.radar?.arrival?.phase === "stopped") {
    automaticSpeed(a);
    if (a.radar.arrival.phase === "stopped") return;
  }
  if (a.radar && !a.radar.arrival && (!a.radar.patternJoin || a.radar.patternJoin.status === "unable")) {moveRadar(a, dt, AIRPORT, radarEnvironment, traffic, autoGoAround, EXERCISE_WEATHER); return;}
  const g = runwayGeometry(a.runway ?? DEFAULT_RUNWAY);
  let target: Point | null = null;
  if (a.mode === "parked") return;
  if (a.conflictMotion?.holdDeparture && a.mode === "takeoff" && a.altitude <= AIRPORT.elevation + 1) {a.speed = 0; a.targetSpeed = 0; return;}
  if (a.mode === "pushback") {
    if (a.holding) {a.speed = 0; return;}
    const waypoint = a.pushback?.path[a.pushback.index];
    if (!waypoint) {a.mode = "parked"; a.groundReady = true; a.enginesRunning = true; a.speed = 0; a.targetSpeed = 0; a.pushback = undefined; return;}
    a.pushback!.index = moveGround(a, a.pushback!.path, a.pushback!.index, dt, a.pushback!.pullFrom === undefined || a.pushback!.index < a.pushback!.pullFrom, ground).index;
    a.altitude = AIRPORT.elevation; return;
  }
  if (a.mode === "taxi" || a.mode === "lineup") {
    const liningUp = a.mode === "lineup";
    if (a.holding) {a.speed = 0; return;}
    const waypoint = a.taxiPath[a.taxiIndex];
    if (!waypoint) {
      if (!liningUp || a.lineupWait) {a.speed = 0; a.targetSpeed = 0;}
      if (!liningUp) {a.mode = "parked"; a.groundReady = intentionsOf(a).taxi !== "parking"; return;}
      const angle = ((g.heading - a.heading + 540) % 360) - 180;
      a.heading = normalizeHeading(a.heading + Math.sign(angle) * Math.min(Math.abs(angle), GROUND.turnRate * dt));
      a.targetHeading = g.heading;
      if (Math.abs(angle) < (a.lineupWait ? 1 : 5)) {a.heading = g.heading; if (!a.lineupWait) {a.holding = false; a.mode = "takeoff"; a.targetSpeed = DEFAULTS.airSpeed;} else a.holding = true;}
      return;
    }
    if (a.expedited && a.targetSpeed > 0 && !a.holding) a.targetSpeed = Math.max(a.targetSpeed, 25);
    const moved = moveGround(a, a.taxiPath, a.taxiIndex, dt, false, {...ground, speedLimit: Math.min(ground.speedLimit, a.conflictMotion?.speedLimit ?? Infinity)});
    if (a.releasedHold !== null && moved.index > a.releasedHold) a.releasedHold = null;
    a.taxiIndex = moved.index;
    if (moved.held) {a.holding = true; a.targetSpeed = 0;}
    if (a.taxiIndex >= a.taxiPath.length && !liningUp) {a.mode = "parked"; a.speed = 0; a.targetSpeed = 0; if (a.backTaxi) {const back = a.backTaxi; delete a.backTaxi; if (back.contactGround) {a.frequency = "ground"; a.arrivalRequest = "taxi-parking";} if (back.lineup) {a.mode = "lineup"; a.lineupWait = true; a.taxiPath = [];}}}
    a.altitude = AIRPORT.elevation;
    if (a.radar?.arrival && runwayLateralClear(runwayCoordinates(a.position, g).lateral, g.clearance)) {
      a.radar.arrival.phase = "vacated"; a.active = false; a.mode = "parked"; a.speed = 0; a.targetSpeed = 0;
      delete a.arrivalExit; delete a.runwayExit;
    }
    return;
  } else if (a.mode === "pattern") {
    if (a.patternEntry && !guidance.holdEntry) {a.leg = a.patternEntry; delete a.patternEntry;}
    const finalAlong = runwayCoordinates(a.position, g).along;
    if (a.leg === "final" && finalAlong >= -.65 && finalAlong < .1 && a.clearedToLand
      && runwayGoAroundDue(a.altitude, AIRPORT.elevation, finalAlong)
      && runwayOccupied(AIRPORT, a.runway ?? DEFAULT_RUNWAY, traffic, a.id)) {
      instruct(a, {type: "go-around"}); a.selfGoAroundPending = true;
      move(a, dt, guidance, ground, false, traffic); return;
    }
    if (a.radar?.patternJoin && radarArrivalFrequency(a.frequency)) {a.clearedToLand = true; a.clearedForOption = a.landing === "touch-and-go";}
    if (a.leg === "downwind") {
      // Move the base turn with the extension instead of steering back toward the
      // original corner. Keep this geometry through base/final and across reloads.
      a.patternFinalDistance = Math.max(defaultBaseDistance(a), a.patternFinalDistance ?? 0, -runwayCoordinates(a.position, g).along + turnLead(a));
    }
    if (a.patternEntry || a.extended || a.leg === "upwind" && a.conflictMotion?.upwind || a.leg === "downwind" && (guidance.extendDownwind || !!a.conflictMotion?.extendDownwind) && -runwayCoordinates(a.position, g).along >= defaultBaseDistance(a) - turnLead(a)) a.targetHeading = normalizeHeading(g.heading + (a.leg === "downwind" ? 180 : 0));
    else {
      const points = patternTargets(a);
      const previous: Record<Leg, Point> = {upwind: g.threshold, crosswind: points.upwind, downwind: points.crosswind, base: points.downwind, final: points.base};
      let start = previous[a.leg], end = points[a.leg];
      const coordinates = (from: Point, to: Point) => {
        const length = distance(from, to), vector = {x: (to.x - from.x) / length, y: (to.y - from.y) / length};
        return {length, vector, along: (a.position.x - from.x) * vector.x + (a.position.y - from.y) * vector.y};
      };
      let segment = coordinates(start, end);
      const lead = turnLead(a);
      const crossedThreshold = a.leg === "final" && segment.along >= segment.length - .002;
      const permitted = a.clearedToLand, option = !!a.clearedForOption, optionHand = a.optionHand;
      if (crossedThreshold) newCircuit(a);
      if (crossedThreshold && permitted && Math.abs(runwayCoordinates(a.position, g).lateral) < .012 && a.altitude <= AIRPORT.elevation + 80) {
        if (a.radar) {touchdownRadar(a, AIRPORT, a.runway ?? DEFAULT_RUNWAY); return;}
        if (!option) a.landing = "full-stop";
        a.optionHand = optionHand;
        a.taxiPath = []; a.taxiIndex = 0; a.releasedHold = null; a.flightPlan = [];
        a.mode = "rollout"; a.bankAngle = 0; a.altitude = AIRPORT.elevation; a.targetSpeed = a.landing === "touch-and-go" ? DEFAULTS.airSpeed : 0; a.targetHeading = g.heading; a.heading = g.heading;
        a.position = add(g.threshold, g.vector, Math.max(0, runwayCoordinates(a.position, g).along));
      } else if (crossedThreshold && (permitted || autoGoAround)) {
        a.mode = "go-around"; a.leg = "upwind"; a.extended = false; a.targetHeading = g.heading; a.selfGoAroundPending = true;
      } else if (crossedThreshold || (a.leg !== "final" && segment.along >= segment.length - lead - 1e-8)) {
        // Crossing the end plane, rather than chasing a point, prevents circling
        // an unreachable waypoint and keeps final parallel to the runway centerline.
        a.leg = NEXT_LEG[a.leg]; start = previous[a.leg]; end = points[a.leg]; segment = coordinates(start, end);
      }
      if (a.mode === "pattern") {
        // Allow a full roll-out interval while acquiring the next straight leg.
        const lookahead = a.leg === "final" ? Math.max(.25, lead * .8) : Math.max(.25, lead * 1.3 + a.speed / 3600 * DEFAULTS.bankAngle / DEFAULTS.bankRate);
        target = add(start, segment.vector, Math.max(0, segment.along) + lookahead);
        a.targetHeading = bearing(a.position, target);
        if (a.radar?.patternJoin?.status === "joining") {
          const lateral = Math.abs((a.position.x - start.x) * -segment.vector.y + (a.position.y - start.y) * segment.vector.x);
          const heading = Math.abs(((bearing(start, end) - a.heading + 540) % 360) - 180);
          if (lateral <= .25 && heading <= 20 && segment.along >= 0 && segment.along <= segment.length) a.radar.patternJoin.status = "established";
        }
      }
    }
    // Follow the approach profile before clearance; permission is checked at touchdown.
    const height = ["base", "final"].includes(a.leg) ? Math.min(DEFAULTS.patternHeight, (a.leg === "base" ? a.patternFinalDistance ?? defaultBaseDistance(a) : Math.max(0, -runwayCoordinates(a.position, g).along)) * 6076 * Math.tan(3 * radians)) : DEFAULTS.patternHeight;
    if (a.mode === "pattern") a.altitude = approach(a.altitude, AIRPORT.elevation + height, (a.altitude > AIRPORT.elevation + height ? descentRate(a) : climbRate(a)) / 60 * dt);
  } else if (a.mode === "go-around") {
    a.targetHeading = g.heading;
    a.altitude = approach(a.altitude, AIRPORT.elevation + DEFAULTS.patternHeight, (a.altitude > AIRPORT.elevation + DEFAULTS.patternHeight ? descentRate(a) : climbRate(a)) / 60 * dt);
    const along = (a.position.x - g.departure.x) * g.vector.x + (a.position.y - g.departure.y) * g.vector.y;
    if (!a.goAroundRunwayHeading && !a.conflictMotion?.upwind && along >= DEFAULTS.upwindLength && a.altitude >= AIRPORT.elevation + DEFAULTS.patternHeight) {a.mode = "pattern"; a.leg = "crosswind";}
  } else if (a.mode === "takeoff") {
    a.targetHeading = g.heading;
    a.targetSpeed = DEFAULTS.airSpeed;
    if (a.altitude <= AIRPORT.elevation + 1) {
      a.position = add(g.threshold, g.vector, Math.max(0, runwayCoordinates(a.position, g).along));
      a.heading = g.heading;
      const remaining = distance(g.threshold, g.departure) - runwayCoordinates(a.position, g).along;
      const stopping = a.speed ** 2 / (2 * acceleration(a) * 3600);
      const rotation = Math.max(0, rotationSpeed(a) ** 2 - a.speed ** 2) / (2 * acceleration(a) * 3600);
      // Keep the existing performance limits. If rotation cannot be reached,
      // reject at the last stopping margin; a late/fast roll can still overrun.
      if (a.takeoffOutcome || remaining <= 0 || a.speed < rotationSpeed(a) && rotation + .05 > remaining && remaining <= stopping + .05) {
        a.takeoffOutcome ??= "rejected";
        a.taxiPath = []; a.taxiIndex = 0;
        delete a.takeoffPattern; delete a.transitionAltitude; delete a.automaticRequest;
        brakeRejectedTakeoff(a, dt, g); return;
      }
    }
    if (a.speed >= rotationSpeed(a)) a.altitude += climbRate(a) / 60 * dt;
    if (a.altitude >= AIRPORT.elevation + 300) {a.mode = a.takeoffPattern === false ? "heading" : "pattern"; a.leavingCircuit = a.takeoffPattern === false; a.leg = "upwind"; a.extended = false; if (a.takeoffPattern !== false) delete a.takeoffPattern;}
  } else if (a.mode === "rollout") {
    a.targetHeading = g.heading;
    if (a.holding) {a.speed = 0; return;}
    if (!a.radar?.arrival && !a.runwayExit && a.landing === "touch-and-go") {a.mode = "takeoff"; a.takeoffPattern = true; a.targetSpeed = DEFAULTS.airSpeed; if (a.optionHand) a.hand = a.optionHand; a.optionHand = undefined; a.leg = "upwind";}
    else {
      if (!a.runwayExit || a.conflictMotion?.slowExit && a.arrivalExit?.instruction === "automatic" && a.arrivalExit.braking === undefined) queueRunwayExit(a, "any", "automatic");
      else if (!a.arrivalExit) a.arrivalExit = {instruction: "exit-runway", speed: 15}; // Legacy assigned exits.
      const along = runwayCoordinates(a.position, g).along;
      const turn = a.runwayExit ? runwayTurn(a, a.runwayExit) : undefined;
      const entry = turn?.position, entryAlong = entry ? runwayCoordinates(entry, g).along : Infinity;
      if (entry && entryAlong < along - .001) {
        delete a.runwayExit; delete a.arrivalExit; return;
      }
      const exitSpeed = turn?.speed ?? 0;
      const stopAlong = Math.max(along, distance(g.threshold, g.departure) - .02);
      const remaining = Math.max(.00001, (entry ? entryAlong : stopAlong) - along);
      // Spread braking over the distance to the chosen connector instead of
      // reaching taxi speed early and crawling down the rest of the runway.
      const required = Math.max(.0001, (a.speed ** 2 - exitSpeed ** 2) / (2 * remaining * 3600));
      const paced = a.arrivalExit?.instruction === "automatic" ? a.conflictMotion?.speedLimit : undefined;
      const targetSpeed = Math.min(paced ?? exitSpeed, Math.sqrt((acceleration(a) * dt) ** 2 + exitSpeed ** 2 + 2 * acceleration(a) * remaining * 3600) - acceleration(a) * dt);
      const braking = paced === undefined && a.speed > exitSpeed ? required : Math.max(acceleration(a), required);
      const previousSpeed = a.speed;
      a.targetSpeed = targetSpeed;
      a.speed = approach(a.speed, targetSpeed, braking * dt);
      a.heading = g.heading;
      const nextAlong = along + (previousSpeed + a.speed) / 7200 * dt;
      a.position = add(g.threshold, g.vector, Math.min(nextAlong, entry ? entryAlong : stopAlong));
      if (entry && nextAlong >= entryAlong - 1e-8) {
        a.speed = Math.min(a.speed, exitSpeed);
        a.position = {...entry}; a.taxiPath = a.runwayExit!; delete a.runwayExit;
        a.taxiIndex = 1; a.mode = "taxi"; a.releasedHold = null;
        a.targetSpeed = a.arrivalExit?.speed ?? 15;
        if (a.radar?.arrival) a.radar.arrival.phase = "vacating";
      } else if (!entry && (a.speed === 0 || nextAlong >= stopAlong)) {
        if (a.radar?.arrival) a.radar.arrival.phase = "stopped";
        a.mode = "parked"; a.holding = true; a.speed = a.targetSpeed = 0;
        delete a.arrivalExit;
      }

      return;
    }
  }
  if (a.mode === "heading" && a.takeoffPattern === false) {a.altitude = approach(a.altitude, AIRPORT.elevation + DEFAULTS.patternHeight, (a.altitude > AIRPORT.elevation + DEFAULTS.patternHeight ? descentRate(a) : climbRate(a)) / 60 * dt); if (a.altitude >= AIRPORT.elevation + DEFAULTS.patternHeight) delete a.takeoffPattern;}
  if (a.mode === "heading" && a.transitionAltitude !== undefined && a.altitude < a.transitionAltitude) a.altitude = approach(a.altitude, a.transitionAltitude, climbRate(a) / 60 * dt);
  automaticSpeed(a);
  const final = runwayCoordinates(a.position, g);
  const finalDistance = a.leg === "final" && final.along < 0 && Math.abs(final.lateral) <= .5 && Math.abs((a.heading - g.heading + 540) % 360 - 180) <= 30 ? -final.along : undefined;
  updateRadarSpeed(a, traffic, finalDistance, a.targetSpeed, EXERCISE_WEATHER);
  moveOwnRoute(a);
  const conflictSpeed = a.mode === "pattern" && a.leg === "final" ? a.conflictMotion?.speedTarget : undefined;
  a.speed = approach(a.speed, Math.min(conflictSpeed ?? a.targetSpeed, guidance.speedLimit ?? Infinity, a.conflictMotion?.speedLimit ?? Infinity), acceleration(a) * dt);
  if (a.altitude > AIRPORT.elevation + 1) {if (a.mode === "pattern") a.targetHeading = headingForGroundTrack(a.targetHeading, a, EXERCISE_WEATHER); turnAircraft(a, dt);}
  else a.bankAngle = 0;
  const stride = a.speed / 3600 * dt;
  a.position = {x: a.position.x + Math.sin(a.heading * radians) * stride, y: a.position.y + Math.cos(a.heading * radians) * stride};
}
/** Rendering prediction uses the same kinematics as the authoritative engine. */

function predictAircraft(aircraft: Aircraft[], seconds: number, autoGoAround = false): Aircraft[] {
  const next = aircraft.map(motionCopy);
  let remaining = Math.max(0, Math.min(seconds, 1.5));
  while (remaining > 1e-8) {const dt = Math.min(remaining, .05); stepTraffic(next, dt, autoGoAround); remaining -= dt;}
  return next;
}

function projectedPath(aircraft: Aircraft, seconds = 120, traffic: Aircraft[] = [aircraft], autoGoAround = false): Point[] {
  // Ground predictions include traffic obstacles; airborne predictions need only
  // the selected aircraft and its arrival predecessor chain.
  const chain = [aircraft, ...traffic.filter(a => a.id !== aircraft.id && ["pushback", "taxi", "lineup"].includes(aircraft.mode))];
  for (let i = 0; i < chain.length; i++) {const leader = followedAircraft(chain[i], traffic); if (leader && !chain.some(a => a.id === leader.id)) chain.push(leader);}
  const next = chain.map(motionCopy), a = next[0];
  const points = [{...a.position}];
  for (let t = 0; t < seconds; t += .25) {stepTraffic(next, Math.min(.25, seconds - t), autoGoAround); if (t % 2 === 0) points.push({...a.position});}
  return points;
}
/** Straight-line velocity projection; historical reference exposure is recorded in docs/simulator-sources.md. */

function headingProjection(a: Pick<Aircraft, "position" | "heading" | "speed" | "groundSpeed" | "track">): Point[] {
  const heading = a.track ?? a.heading, speed = a.groundSpeed ?? a.speed;
  return [a.position, add(a.position, {x: Math.sin(heading * radians), y: Math.cos(heading * radians)}, speed * DEFAULTS.radarSeconds / 3600)];
}

function patternOutline(a: Pick<Aircraft, "runway" | "hand" | "patternFinalDistance" | "speedTargets">): Point[] {
  const p = patternTargets(a); return [p.final, p.upwind, p.crosswind, p.downwind, p.base, p.final];
}

const weatherSummary = {metar: METAR, wind: `${EXERCISE_WEATHER.windDirection}° at ${EXERCISE_WEATHER.windSpeed}KT`, visibility: `${EXERCISE_WEATHER.visibilityKm}km (simulated)`, frequencies: FREQUENCIES};

return {normalizeHeading, distance, bearing, runwayGeometry, speedProfile, patternTargets, newAircraft, initialExercise, restoreExercise, followedAircraft, sequenceStatus, arrivalNumber, validateInstruction, validateAssignment, departureRoute, runwayExitRoute, atisText, applyEnvelope, AUTO_READBACK_DELAY, validateControllerMessage, readbackText, autoReadbacks, advance, predictAircraft, projectedPath, headingProjection, patternOutline, weatherSummary};
}
const engines = new WeakMap<Airport, Map<string, ReturnType<typeof createAirportEngine>>>();
export function engineFor(selection: AirportSelection = {}) {
  const airport = getAirport(selection);
  const specimens=(selection as AirportSelection & {aircraft?: ({destination?:Aircraft["destination"]}|{seed:{destination?:Aircraft["destination"]}})[]}).aircraft;
  const traffic=specimens?.map(a=>"seed" in a?a.seed:a) ?? selection.traffic;
  let variants = engines.get(airport);
  if (!variants) {variants = new Map(); engines.set(airport, variants);}
  const key = `${selection.trainingStation ?? "local"}:${JSON.stringify(selection.radarEnvironment ?? null)}:${JSON.stringify(selection.weather ?? null)}:${JSON.stringify(traffic?.map(a=>a.destination?.name))}`;
  let engine = variants.get(key);
  if (!engine) {engine = createAirportEngine(airport, {...selection,traffic}); if (variants.size >= 32) variants.delete(variants.keys().next().value!); variants.set(key, engine);}
  return engine;
}
export const AIRPORT = defaultAirport;
const legacyEngine = engineFor();
export const {normalizeHeading, distance, bearing, runwayGeometry, speedProfile, patternTargets, newAircraft, initialExercise, followedAircraft, sequenceStatus, arrivalNumber, validateInstruction, validateAssignment, departureRoute, runwayExitRoute, atisText, AUTO_READBACK_DELAY, readbackText, predictAircraft, projectedPath, headingProjection, patternOutline, weatherSummary} = legacyEngine;
export const advance: typeof legacyEngine.advance = (state, ...args) => engineFor(state).advance(state, ...args);
export const applyEnvelope: typeof legacyEngine.applyEnvelope = (state, ...args) => engineFor(state).applyEnvelope(state, ...args);
export const autoReadbacks: typeof legacyEngine.autoReadbacks = (state, ...args) => engineFor(state).autoReadbacks(state, ...args);
export const restoreExercise: typeof legacyEngine.restoreExercise = (state, ...args) => engineFor(state).restoreExercise(state, ...args);
export const validateControllerMessage: typeof legacyEngine.validateControllerMessage = (state, ...args) => engineFor(state).validateControllerMessage(state, ...args);
