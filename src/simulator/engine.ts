import {planTaxiRoute, planParkingRoute} from "./taxi-routing";
import {GROUND, groundGuidance, groundConflict, resolveGroundPriorities, moveGround, planPushback, type GroundGuidance} from "./ground-movement";
import {currentAtisOptions} from "./atis-options";
import {applyTaxiPathEdit} from "./taxi-path-editing";
import {pilotRequests, pilotRequestText, resolvePilotRequest} from "./catalog";
import egph from "./data/egph.json";
import {DEFAULTS, intentionsOf, FREQUENCIES, METAR, EXERCISE_WEATHER, emptyAtis, pendingCommands, pendingPilotMessage, patternLegLabel, unreadMessages, type Aircraft, type Airport, type Atis, type Envelope, type Exercise, type Frequency, type Instruction, type Leg, type Point, type Runway, type SpeedPhase} from "./model";

export const AIRPORT: Airport = egph;
const radians = Math.PI / 180;
// Begin the base/final turn one base-speed turn radius beyond the desired join.
// Otherwise turn anticipation establishes final almost a mile too close in.
const defaultBaseDistance = (a: Pick<Aircraft, "speedTargets">) => DEFAULTS.finalLength + (a.speedTargets?.base ?? 180) / 3600 / (DEFAULTS.turnRate * radians);

export const normalizeHeading = (heading: number) => (heading % 360 + 360) % 360;

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export const bearing = (a: Point, b: Point) => normalizeHeading(Math.atan2(b.x - a.x, b.y - a.y) / radians);
const add = (p: Point, vector: Point, scale: number): Point => ({x: p.x + vector.x * scale, y: p.y + vector.y * scale});
const approach = (value: number, target: number, rate: number) => value + Math.sign(target - value) * Math.min(Math.abs(target - value), rate);

export function runwayGeometry(runway: Runway = "24") {
  const threshold = AIRPORT.runway.ends.find(end => end.id === runway)!;
  const departure = AIRPORT.runway.ends.find(end => end.id !== runway)!;
  const heading = bearing(threshold.point, departure.point);
  return {threshold: threshold.point, departure: departure.point, heading, vector: {x: Math.sin(heading * radians), y: Math.cos(heading * radians)}};
}
/** IAS targets; ground movement keeps its separate taxi/rollout speeds. */

export function speedProfile(a: Aircraft): {segment: SpeedPhase; minimum: number; maximum: number; target: number} {
  let profile: ReturnType<typeof speedProfile>;
  if (a.mode === "takeoff" || a.mode === "go-around") profile = {segment: "upwind-downwind", minimum: 210, maximum: 230, target: 220};
  else if (a.mode !== "pattern" || a.leavingCircuit) profile = {segment: "inbound", minimum: 250, maximum: 250, target: 250};
  else if (["upwind", "crosswind", "downwind"].includes(a.leg)) profile = {segment: "upwind-downwind", minimum: 210, maximum: 230, target: 220};
  else if (a.leg === "base") profile = {segment: "base", minimum: 180, maximum: 200, target: 180};
  else {
    const finalDistance = -runwayCoordinates(a.position, runwayGeometry(a.runway ?? "24")).along;
    profile = finalDistance <= 2 + 1e-8 ? {segment: "vref", minimum: 135, maximum: 135, target: 135}
      : {segment: "final", minimum: 140, maximum: 180, target: finalDistance <= 4.5 + 1e-8 ? 160 : 180};
  }
  const fixed = a.speedTargets?.[profile.segment];
  return fixed == null ? profile : {...profile, target: fixed, minimum: fixed, maximum: fixed};
}

function automaticSpeed(a: Aircraft) {
  if (a.speedMode !== "manual" && ["pattern", "heading", "go-around", "takeoff"].includes(a.mode)) a.targetSpeed = speedProfile(a).target;
}

export function patternTargets(aircraft: Pick<Aircraft, "runway" | "hand" | "patternFinalDistance" | "speedTargets">): Record<Leg, Point> {
  const {threshold, departure, vector} = runwayGeometry(aircraft.runway ?? "24");
  const side = aircraft.hand === "left" ? {x: -vector.y, y: vector.x} : {x: vector.y, y: -vector.x};
  const upwind = add(departure, vector, DEFAULTS.upwindLength);
  const final = add(threshold, vector, -Math.max(defaultBaseDistance(aircraft), aircraft.patternFinalDistance ?? 0));
  return {upwind, crosswind: add(upwind, side, DEFAULTS.patternWidth), downwind: add(final, side, DEFAULTS.patternWidth), base: final, final: threshold};
}

export function newAircraft(id: string, airborne: boolean): Aircraft {
  const geometry = runwayGeometry();
  return {id, callsign: airborne ? "Speedbird 124" : "Easy 571", type: "A320", position: airborne ? add(geometry.threshold, geometry.vector, -5) : {x: 0.5, y: -0.25},
    heading: geometry.heading, targetHeading: geometry.heading, speed: airborne ? DEFAULTS.airSpeed : 0, targetSpeed: airborne ? DEFAULTS.airSpeed : 0,
    altitude: AIRPORT.elevation + (airborne ? DEFAULTS.patternHeight : 0), frequency: airborne ? "tower" : "ground", runway: "24", lastRunway: null,
    hand: "left", leg: "final", mode: airborne ? "pattern" : "parked", extended: false, landing: "touch-and-go", clearedToLand: false,
    taxiPath: [], taxiIndex: 0, holding: false, releasedHold: null, flightPlan: [], trail: [], pending: 0, active: true, color: null, tag: "auto", reminderAt: null};
}

export function initialExercise(id = "egph-local"): Exercise {
  const first = newAircraft("demo-air", true);
  first.flightPlan = [{x: 5, y: 7}, {x: 3, y: 3}, {x: 2, y: 1}, runwayGeometry().threshold];
  const second = newAircraft("demo-ground", false);
  const taxiway = AIRPORT.features.find(f => f.kind === "taxiway" && f.points.length >= 3);
  if (taxiway) { second.position = {...taxiway.points[0]}; second.taxiPath = taxiway.points.map((p, i) => ({...p, hold: i === taxiway.points.length - 2})); }
  return {schema: 1, id, revision: 0, elapsed: 0, running: false, pausedByStaff: false, autoReadback: false, aircraft: [first, second], messages: [], processed: [], atis: emptyAtis(), publishedAtis: "ATIS UNAVAILABLE", publishedDraft: null};
}
/** Upgrade old snapshots once: the last pending pilot messages were the only unread ones. */

export function restoreExercise(saved: Exercise): Exercise {
  const state = structuredClone(saved);
  for (const a of state.aircraft) {
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
const arrivalTraffic = (a: Aircraft) => a.active && !a.leavingCircuit && a.frequency === "tower" && ["pattern", "heading", "go-around"].includes(a.mode);
const departureTraffic = (a: Aircraft) => a.active && a.frequency === "tower" && ["parked", "taxi", "lineup"].includes(a.mode);
/** Remaining circuit distance orders arrivals for one runway, across both pattern hands. */

function arrivalDistance(a: Aircraft): number {
  const p = patternTargets(a), g = runwayGeometry(a.runway ?? "24");
  if (a.leg === "final") return Math.max(0, -runwayCoordinates(a.position, g).along);
  const legs: Leg[] = ["upwind", "crosswind", "downwind", "base", "final"];
  const index = legs.indexOf(a.leg);
  let remaining = distance(a.position, p[a.leg]);
  for (let i = index; i < legs.length - 1; i++) remaining += distance(p[legs[i]], p[legs[i + 1]]);
  return remaining;
}

function assignSequence(aircraft: Aircraft[], a: Aircraft, instruction: Instruction) {
  const requested = instruction.type === "sequence" ? instruction : instruction.type === "pattern" ? instruction.sequence : undefined;
  if (!requested) return;
  const runway = instruction.type === "pattern" ? instruction.runway ?? a.runway : a.runway;
  const queue = aircraft.filter(other => other.id !== a.id && other.runway === runway && (requested.departure
    ? departureTraffic(other)
    : arrivalTraffic(other))).sort((x, y) => (requested.departure ? distance(x.position, runwayGeometry(runway ?? "24").threshold) - distance(y.position, runwayGeometry(runway ?? "24").threshold) : arrivalDistance(x) - arrivalDistance(y)) || x.id.localeCompare(y.id));
  const following = queue[requested.number - 2];
  // A clearance number or an arbitrary aircraft id cannot manufacture a sequence.
  a.sequence = following && (requested.departure || patternLegLabel(following).toLowerCase() === requested.traffic?.toLowerCase())
    ? {number: requested.number, traffic: requested.traffic, departure: requested.departure, followingId: following.id, runway: runway ?? undefined, circuit: a.circuit ?? 0, followingCircuit: following.circuit ?? 0}
    : undefined;
}

export function followedAircraft(a: Aircraft, aircraft: Aircraft[]): Aircraft | undefined {
  const s = a.sequence;
  if (!s?.followingId || s.number < 2 || s.runway !== a.runway || s.circuit !== (a.circuit ?? 0)) return;
  const target = aircraft.find(other => other.id === s.followingId);
  if (!target || target.id === a.id || target.runway !== a.runway || (target.circuit ?? 0) !== s.followingCircuit) return;
  return (s.departure ? departureTraffic(a) && departureTraffic(target) : arrivalTraffic(a) && arrivalTraffic(target)) ? target : undefined;
}

function reconcileSequences(aircraft: Aircraft[]) {
  for (const a of aircraft) if (a.sequence && !followedAircraft(a, aircraft)) a.sequence = undefined;
}

export function sequenceStatus(a: Aircraft, aircraft: Aircraft[]): string {
  const following = followedAircraft(a, aircraft);
  if (following) return `Following ${following.callsign}${a.mode === "pattern" && a.leg === "downwind" && !a.extended && sequenceGuidance(a, aircraft).extendDownwind && -runwayCoordinates(a.position, runwayGeometry(a.runway ?? "24")).along >= defaultBaseDistance(a) - turnLead(a) ? " · Extending downwind for spacing" : ""} · Runway ${a.runway}`;
  if (!arrivalTraffic(a)) return "";
  return arrivalNumber(a, aircraft) > 1 ? "Sequence required for this circuit" : "First for this runway · no sequence required";
}
/** Instructor arrival expectations use the same runway/circuit ordering as spacing. */

export function arrivalNumber(a: Aircraft, aircraft: Aircraft[], runway = a.runway): number {
  const arrival = {...a, runway};
  return 1 + aircraft.filter(other => other.id !== a.id && other.runway === runway && arrivalTraffic(other) && (arrivalDistance(other) < arrivalDistance(arrival) || arrivalDistance(other) === arrivalDistance(arrival) && other.id < a.id)).length;
}

function clearLanding(a: Aircraft) {a.clearedToLand = false; a.clearedForOption = false; a.optionHand = undefined;}

function newCircuit(a: Aircraft) {a.circuit = (a.circuit ?? 0) + 1; a.sequence = undefined; a.patternFinalDistance = undefined; delete a.arrivalExit; delete a.arrivalRequest; clearLanding(a);}
/** Sending a clearance never depends on a pilot request or an aircraft's position.
 * Physical prerequisites are checked separately when staff chooses to assign it. */

export function validateInstruction(a: Aircraft, command: Instruction, frequency?: string): string | null {
  if (frequency && a.frequency !== frequency) return "Aircraft is not on this frequency.";
  if (frequency === "atis") return "ATIS cannot issue aircraft instructions.";
  if ((command.type === "heading" || command.type === "speed") && (!Number.isFinite(command.value) || command.value < 0 || command.value > (command.type === "heading" ? 360 : 600))) return "Enter a valid heading (0–360) or speed (0–600 knots).";
  if (command.type === "transition" && (!Number.isFinite(command.altitude) || command.altitude < 500 || command.altitude > 10000 || command.altitude % 500 !== 0)) return "Choose a transition altitude from 500 to 10000 feet in 500-foot intervals.";
  if (command.type === "radio" && command.message === "misc" && (!command.text?.trim() || command.text.length > 300)) return "Enter a Misc message of 1–300 characters.";
  return null;
}

export function validateAssignment(a: Aircraft, command: Instruction, frequency?: string, traffic: Aircraft[] = []): string | null {
  if (command.type === "radio") return "Radio messages do not assign aircraft movement.";
  const invalid = validateInstruction(a, command, frequency); if (invalid) return invalid;
  const ground = a.mode === "pushback" || a.mode === "parked" || a.mode === "taxi" || a.mode === "lineup" || a.mode === "rollout";
  if (command.type === "frequency" && command.whenReady && (command.frequency !== "tower" || !ground)) return "Contact Tower when ready requires ground traffic and Tower as the destination.";
  if (["give-way", "pushback", "taxi", "stop", "hold-short", "cross", "takeoff", "lineup", "exit-runway"].includes(command.type) && !ground) return "This instruction requires ground traffic.";
  if (["land", "cancel-landing", "go-around", "pattern", "extend", "heading", "transition", "departure"].includes(command.type) && (ground || a.mode === "takeoff" && a.altitude <= AIRPORT.elevation + 1)) return "This instruction requires airborne traffic.";
  if (command.type === "pushback" && a.mode !== "parked") return "Stop the aircraft before assigning pushback.";
  if (command.type === "pushback") return planPushback(AIRPORT, a, command.tail).error ?? null;
  if (command.type === "taxi" && command.runway) return planTaxiRoute(AIRPORT, a.position, command.runway).error ?? null;
  if (command.type === "taxi" && command.destination === "parking" && (a.mode === "rollout" || a.arrivalExit)) return a.runwayExit || a.arrivalExit ? null : runwayExitRoute(a, "any").error ?? null;
  if (command.type === "taxi" && command.destination === "parking" && a.frequency === "tower") return null;
  if (command.type === "taxi" && command.destination === "parking") return planParkingRoute(AIRPORT, a.position, intentionsOf(a).parkingStand, traffic.filter(other => other.id !== a.id && other.active && other.altitude < 1000).map(other => other.position)).error ?? null;
  if (["taxi", "cross"].includes(command.type) && (a.taxiPath.length < 2 || a.taxiIndex >= a.taxiPath.length)) return "Staff must configure a taxi path first.";
  if (command.type === "hold-short" && !a.taxiPath.slice(a.taxiIndex).some(p => p.hold)) return "The taxi path has no upcoming hold-short point.";
  if (command.type === "cross" && (!a.holding || !a.taxiPath[a.taxiIndex]?.hold)) return "Aircraft is not holding at a runway crossing.";
  if (command.type === "takeoff" || command.type === "lineup") {
    const route = departureRoute(a, command.runway ?? a.runway ?? "24");
    if (route.error) return route.error;
  }
  if (command.type === "exit-runway") return runwayExitRoute(a, command.side).error ?? null;
  return null;
}

export function departureRoute(a: Aircraft, runway: Runway) {
  const g = runwayGeometry(runway), q = runwayCoordinates(a.position, g);
  if (Math.abs(q.lateral) < .012 && q.along >= -.02 && q.along <= distance(g.threshold, g.departure)) {
    // This prototype uses full-length departures. Back-taxi an intersection
    // placement before accelerating, rather than rotating beyond the runway end.
    return {path: [a.position, add(g.threshold, g.vector, Math.max(0, q.along)), g.threshold]};
  }
  // A cleared departure may enter from a nearby mapped hold-short point, or taxi
  // there along A*. It never starts its takeoff roll from a stand or taxiway.
  const route = planTaxiRoute(AIRPORT, a.position, runway);
  if (route.error && !(distance(a.position, g.threshold) < .21 && Math.abs(q.lateral) <= .06)) return {error: route.error};
  const points = route.path ?? [a.position];
  const entry = runwayCoordinates(points[points.length - 1], g);
  return {path: [...points.map(p => ({x: p.x, y: p.y})), add(g.threshold, g.vector, Math.max(0, entry.along)), g.threshold]};
}

function runwayCoordinates(p: Point, g: ReturnType<typeof runwayGeometry>) {
  return {along: (p.x - g.threshold.x) * g.vector.x + (p.y - g.threshold.y) * g.vector.y, lateral: (p.x - g.threshold.x) * -g.vector.y + (p.y - g.threshold.y) * g.vector.x};
}
/** Follow a mapped runway connector to a point beyond the protected runway area.
 * Exit selection allows enough runway distance to decelerate before turning. */

export function runwayExitRoute(a: Aircraft, side: "left" | "right" | "any"): {path?: Point[]; speed?: 15 | 35; error?: string} {
  const g = runwayGeometry(a.runway ?? "24"), q = runwayCoordinates(a.position, g), length = distance(g.threshold, g.departure);
  if (Math.abs(q.lateral) > .015 || q.along < -.02 || q.along > length + .02) return {error: "Aircraft must be on the runway before assigning an exit."};
  const candidates: {along: number; path: Point[]; speed: 15 | 35}[] = [];
  const taxiways = AIRPORT.features.filter(f => f.kind === "taxiway");
  const trace = (path: Point[], points: Point[], visited: Set<string>): Point[][] => {
    for (const next of points) {
      const previous = path.at(-1)!, prior = runwayCoordinates(previous, g).lateral, lateral = runwayCoordinates(next, g).lateral;
      if (Math.abs(lateral) < 1e-7) continue;
      if (side !== "any" && side !== (lateral > 0 ? "left" : "right") || prior * lateral < -1e-8 || Math.abs(lateral) + .0001 < Math.abs(prior)) return [];
      if (Math.abs(lateral) >= .06) {
        const t = (Math.sign(lateral) * .06 - prior) / (lateral - prior);
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
      // OSM runway joins can stop a few metres short of the rounded centerline.
      if (intersection < 0 && (i !== 1 || Math.abs(u.lateral) > .002) || intersection > 1 && (i !== feature.points.length - 1 || Math.abs(v.lateral) > .002)) continue;
      const fraction = Math.max(0, Math.min(1, intersection));
      const along = u.along + (v.along - u.along) * fraction, entry = add(g.threshold, g.vector, along);
      if (along < q.along + .015 || along > length) continue;
      for (const direction of [-1, 1]) {
        const points = direction === 1 ? feature.points.slice(i) : feature.points.slice(0, i).reverse();
        for (const path of trace([entry], points, new Set([feature.id]))) {
          // Infer forward oblique connectors from mapped geometry (within 60°).
          // Measure near the runway, before a connector joins a perpendicular taxiway.
          const departure = runwayCoordinates(path.find(p => Math.abs(runwayCoordinates(p, g).lateral) >= .015) ?? path.at(-1)!, g);
          const speed = departure.along - along >= Math.abs(departure.lateral) / Math.sqrt(3) ? 35 : 15;
          const brakingDistance = Math.max(0, (a.speed ** 2 - speed ** 2) / (2 * DEFAULTS.acceleration * 3600));
          if (along >= q.along + brakingDistance + .015) candidates.push({along, path: [{...a.position}, ...path], speed});
        }
      }
    }
  }
  return candidates.sort((x, y) => x.along - y.along)[0] ?? {error: `No reachable mapped ${side === "any" ? "" : side + " "}exit ahead. Slow down or reposition before assigning an exit.`};
}

function queueRunwayExit(a: Aircraft, side: "left" | "right" | "any", instruction: NonNullable<Aircraft["arrivalExit"]>["instruction"]) {
  const route = runwayExitRoute(a, side);
  if (!route.path || !route.speed) return;
  a.runwayExit = route.path; a.arrivalExit = {instruction, speed: route.speed};
  a.targetSpeed = route.speed;
}

function instruct(a: Aircraft, c: Instruction, traffic: Aircraft[] = []) {
  if (c.type === "radio") return;
  if (["heading", "transition", "departure", "pattern", "go-around"].includes(c.type)) delete a.takeoffPattern;
  if (!["give-way", "stop", "speed", "frequency", "outcome", "sequence"].includes(c.type)) delete a.giveWay;
  if (["taxi", "pushback", "give-way", "takeoff", "lineup", "exit-runway"].includes(c.type)) delete a.groundYield;
  if (!["frequency", "speed", "sequence", "outcome", "give-way"].includes(c.type)) delete a.automaticRequest;
  if (!["transition", "frequency", "speed", "outcome", "sequence"].includes(c.type)) delete a.transitionOverheadArmed;
  if (["transition", "departure", "exit-runway"].includes(c.type)) clearLanding(a);
  if ("runway" in c && c.runway && c.runway !== a.runway) clearLanding(a);
  if (["pattern", "heading", "departure", "transition", "takeoff", "lineup"].includes(c.type)) delete a.goAroundRunwayHeading;
  if (["pushback", "cross", "takeoff", "lineup", "exit-runway", "frequency", "runway"].includes(c.type) || c.type === "taxi" && c.destination === "parking") delete a.contactTowerAtHold;
  const arrivalParking = c.type === "taxi" && c.destination === "parking" && (a.mode === "rollout" || !!a.arrivalExit);
  if (!arrivalParking && !["speed", "frequency", "runway", "outcome", "sequence", "stop"].includes(c.type)) {delete a.transitionAltitude; delete a.runwayExit; delete a.lineupWait; delete a.arrivalExit; delete a.arrivalRequest;}
  if (["pattern", "land", "go-around", "takeoff", "lineup"].includes(c.type)) delete a.leavingCircuit;
  if ("runway" in c && c.runway && c.runway !== a.runway || "hand" in c && c.hand && c.hand !== a.hand) a.patternFinalDistance = undefined;
  if ("runway" in c && c.runway) {a.lastRunway = a.runway ?? a.lastRunway; a.runway = c.runway;}
  if (c.type !== "pushback" && !["stop", "speed", "frequency", "runway", "outcome"].includes(c.type)) a.pushback = undefined;
  switch (c.type) {
    case "pushback": {
      a.pushback = {path: planPushback(AIRPORT, a, c.tail).path!, index: 0};
      a.mode = "pushback"; a.holding = false; a.targetSpeed = GROUND.pushbackSpeed; break;
    }
    case "give-way": a.giveWay = {aircraftId: c.aircraftId, description: c.description}; break;
    case "taxi":
      if (arrivalParking) {
        if (a.arrivalExit) a.arrivalExit = {...a.arrivalExit, instruction: "parking"};
        else if (a.runwayExit) a.arrivalExit = {instruction: "parking", speed: 15};
        else queueRunwayExit(a, "any", "parking");
        a.landing = "full-stop"; a.clearedToLand = false; a.sequence = undefined;
        a.holding = false; a.targetSpeed = a.arrivalExit!.speed; break;
      }
      if (c.destination === "parking" && a.frequency === "tower") {a.frequency = "ground"; a.arrivalRequest = "taxi-parking"; break;}
      if (c.destination === "parking") {
        const route = planParkingRoute(AIRPORT, a.position, intentionsOf(a).parkingStand, traffic.filter(other => other.id !== a.id && other.active && other.altitude < 1000).map(other => other.position));
        if (route.path) {a.taxiPath = route.path; a.taxiIndex = 0; a.releasedHold = null;}
        a.intentions = {...intentionsOf(a), taxi: "parking"};
      }
      if (c.runway) {a.intentions = {...intentionsOf(a), taxi: "runway"}; a.departureRunway = c.runway; const route = planTaxiRoute(AIRPORT, a.position, c.runway); if (route.path) {a.taxiPath = route.path; a.taxiIndex = 0; a.releasedHold = null; a.lastRunway = a.runway; a.runway = c.runway;}} a.mode = "taxi"; a.holding = false; a.targetSpeed = DEFAULTS.taxiSpeed; break;
    case "stop": a.holding = true; a.targetSpeed = 0; break;
    case "hold-short": a.mode = "taxi"; a.holding = false; a.targetSpeed = DEFAULTS.taxiSpeed; break;
    case "cross": a.releasedHold = a.taxiIndex; a.holding = false; a.mode = "taxi"; a.targetSpeed = DEFAULTS.taxiSpeed; break;
    case "lineup":
    case "takeoff": {const route = departureRoute(a, a.runway ?? "24"); a.sequence = undefined; if (c.type === "takeoff") {a.takeoffPattern = !!c.hand || intentionsOf(a).flight === "pattern"; if (c.hand) a.hand = c.hand;} a.lineupWait = c.type === "lineup"; a.mode = "lineup"; a.taxiPath = route.path ?? []; a.taxiIndex = 1; a.holding = false; a.releasedHold = null; a.targetSpeed = DEFAULTS.taxiSpeed; a.leg = "upwind"; a.extended = false; break;}
    case "exit-runway": {queueRunwayExit(a, c.side, "exit-runway"); a.landing = "full-stop"; a.clearedToLand = false; a.mode = "rollout"; a.holding = false; a.sequence = undefined; break;}
    case "transition": a.transitionOverheadArmed = intentionsOf(a).afterTransition === "touch-and-go"; a.mode = "heading"; a.targetHeading = a.heading; a.transitionAltitude = c.altitude; a.leavingCircuit = true; a.clearedToLand = false; a.extended = false; a.sequence = undefined; break;
    case "departure": a.mode = "heading"; a.targetHeading = {north: 0, east: 90, south: 180, west: 270}[c.direction]; a.leavingCircuit = true; a.clearedToLand = false; a.extended = false; a.sequence = undefined; break;
    case "land": a.clearedToLand = true; a.clearedForOption = !!c.option; if (!c.option) a.landing = "full-stop"; a.optionHand = c.option ? c.hand : undefined; if (c.number === 1) a.sequence = undefined; break;
    case "cancel-landing": clearLanding(a); break;
    case "go-around": if (a.mode !== "go-around") newCircuit(a); else clearLanding(a); a.mode = "go-around"; a.goAroundRunwayHeading = !!c.runwayHeading; a.leg = "upwind"; a.extended = false; a.targetSpeed = DEFAULTS.airSpeed; if (c.hand) a.hand = c.hand; a.targetHeading = runwayGeometry(a.runway ?? "24").heading; break;
    case "pattern": if (a.leg === "final" && c.leg === "upwind") newCircuit(a); a.mode = "pattern"; a.leg = c.leg; a.extended = false; if (c.hand) a.hand = c.hand; if (c.leg === "base") a.patternFinalDistance = Math.max(defaultBaseDistance(a), -runwayCoordinates(a.position, runwayGeometry(a.runway ?? "24")).along); break;
    case "sequence": break;
    case "extend": a.mode = "pattern"; a.leg = c.leg; a.extended = true; break;
    case "heading": a.mode = "heading"; a.extended = false; a.targetHeading = normalizeHeading(c.value); break;
    case "speed": a.targetSpeed = c.value; a.speedMode = "manual"; break;
    case "runway": break;
    case "frequency":
      if (c.whenReady) a.contactTowerAtHold = true;
      else {
        a.frequency = c.frequency;
        if (c.frequency === "ground" && a.parkingAfterContact) {a.arrivalRequest = "taxi-parking"; delete a.parkingAfterContact;}
        if (c.frequency === "tower" && atDepartureHold(a)) a.automaticRequest = "departure";
      }
      break;
    case "outcome": a.landing = c.outcome; break;
  }
  automaticSpeed(a);
}

export function atisText(draft: Atis): string {
  return [`Edinburgh information ${draft.letter}.`, `Simulated weather. Wind ${EXERCISE_WEATHER.windDirection} degrees at ${EXERCISE_WEATHER.windSpeed} knots. Visibility ${EXERCISE_WEATHER.visibilityKm} kilometres. QNH ${EXERCISE_WEATHER.qnh}.`,
    `Departing runway ${draft.departures.join(" and ") || "none"}. Landing runway ${draft.arrivals.join(" and ") || "none"}.`,
    ...draft.expectations.map(x => `Expect ${x}.`), ...draft.remarks, ...draft.notams, ...draft.procedures,
    `Advise on initial contact you have information ${draft.letter}.`].join(" ");
}

export function applyEnvelope(state: Exercise, envelope: Envelope): {state: Exercise; error?: string} {
  if (state.processed.includes(envelope.id)) return {state};
  const next = structuredClone(state);
  const action = envelope.action;
  const aircraft = "aircraftId" in action ? next.aircraft.find(a => a.id === action.aircraftId) : undefined;
  if ("aircraftId" in action && !aircraft) return {state, error: "Aircraft no longer exists."};
  if ((action.kind === "command" || action.kind === "maneuver") && action.command.type === "give-way") {
    const targetId = action.command.aircraftId;
    const target = next.aircraft.find(a => a.id === targetId);
    if (!target || !target.active || target.id === aircraft!.id || target.altitude >= 1000 || !["parked", "pushback", "taxi", "lineup", "rollout"].includes(target.mode)) return {state, error: "Choose another active ground aircraft to give way to."};
    let leader: Aircraft | undefined = target;
    const visited = new Set([aircraft!.id]);
    while (leader) {
      if (visited.has(leader.id)) return {state, error: "This would create a circular Give way instruction. Cancel the previous yield with Continue Taxi first."};
      visited.add(leader.id); const nextId: string | undefined = leader.giveWay?.aircraftId; leader = next.aircraft.find(a => a.id === nextId);
    }
  }
  if (action.kind === "command" || action.kind === "maneuver") {
    const error = action.kind === "command" ? validateControllerMessage(next, aircraft!, action.command, action.frequency, action.replyTo) : validateAssignment(aircraft!, action.command, undefined, next.aircraft);
    if (error) return {state, error};
    if (action.kind === "maneuver") {
      instruct(aircraft!, action.command, next.aircraft);
      assignSequence(next.aircraft, aircraft!, action.command);
      if (action.command.type !== "frequency") aircraft!.lastRunway = aircraft!.runway ?? aircraft!.lastRunway;
    }
  }
  switch (action.kind) {
    case "reset": {const reset = initialExercise(state.id); reset.autoReadback = state.autoReadback ?? false; reset.revision = state.revision + 1; reset.processed = [...state.processed.slice(-511), envelope.id]; return {state: reset};}
    case "play": next.running = true; next.pausedByStaff = false; break;
    case "pause": next.running = false; next.pausedByStaff = true; break;
    case "auto-readback": {
      next.autoReadback = action.enabled;
      for (const m of next.messages) delete m.autoReadbackAt;
      if (action.enabled) for (const a of next.aircraft) {
        const command = pendingCommands(next, a.id).at(-1);
        if (command) command.autoReadbackAt = next.elapsed + AUTO_READBACK_DELAY;
      }
      break;
    }
    case "spawn": if (next.aircraft.length >= 50) return {state, error: "This exercise supports up to 50 aircraft."}; if (next.aircraft.some(a => a.id === action.aircraft.id)) return {state, error: "Aircraft already exists."}; next.aircraft.push(action.aircraft); break;
    case "remove": next.aircraft = next.aircraft.filter(a => a.id !== action.aircraftId); break;
    case "taxi-path": {const error = applyTaxiPathEdit(aircraft!, action.path, action.edit); if (error) return {state, error}; break;}
    case "edit":
      if (["frequency", "runway", "position", "taxiPath", "taxiIndex"].some(key => key in action.patch)) delete aircraft!.arrivalRequest;
      if (["runway", "position", "taxiPath", "taxiIndex"].some(key => key in action.patch)) {delete aircraft!.arrivalExit; delete aircraft!.runwayExit;}
      if (action.patch.clearedToLand === false || action.patch.runway && action.patch.runway !== aircraft!.runway) clearLanding(aircraft!); if (["frequency", "runway", "position", "taxiPath", "taxiIndex"].some(key => key in action.patch)) delete aircraft!.contactTowerAtHold; if (action.patch.runway && action.patch.runway !== aircraft!.runway || action.patch.hand && action.patch.hand !== aircraft!.hand) aircraft!.patternFinalDistance = undefined; if (["frequency", "runway", "position", "taxiPath", "taxiIndex"].some(key => key in action.patch)) {delete aircraft!.groundYield; delete aircraft!.giveWay; delete aircraft!.automaticRequest; delete aircraft!.parkingAfterContact;}
      Object.assign(aircraft!, action.patch);
      if (action.patch.intentions && aircraft!.transitionAltitude !== undefined) aircraft!.transitionOverheadArmed = intentionsOf(aircraft!).afterTransition === "touch-and-go"; if (action.patch.targetSpeed !== undefined && action.patch.speedMode === undefined) aircraft!.speedMode = "manual"; if (action.patch.runway && action.patch.runway !== state.aircraft.find(a => a.id === action.aircraftId)?.runway) aircraft!.lastRunway = state.aircraft.find(a => a.id === action.aircraftId)?.runway ?? aircraft!.lastRunway; break;
    case "read": for (const m of next.messages) if (m.aircraftId === aircraft!.id && m.sender === "pilot" && (!action.frequency || m.frequency === action.frequency)) m.read = true; aircraft!.reminderAt = null; break;
    case "atis": next.atis = currentAtisOptions(action.draft); break;
    case "publish-atis": next.atis = currentAtisOptions(next.atis); next.publishedAtis = atisText(next.atis); next.publishedDraft = structuredClone(next.atis); break;
    case "pilot": {
      if (!aircraft!.frequency || aircraft!.frequency === "atis") return {state, error: "Tune the aircraft to Ground or Tower first."};
      let pilotText = action.text;
      if (action.request) {
        if (action.replyTo || action.assign) return {state, error: "A pilot request cannot also answer a controller command."};
        const request = resolvePilotRequest({requestId: action.request.id});
        if (!request || !pilotRequests(aircraft!).some(r => r.id === request.id)) return {state, error: "This pilot request is unavailable for the aircraft's phase or frequency."};
        pilotText = pilotRequestText(aircraft!, request, action.request.runway, action.request.remainingInPattern, {...action.request, exercise: next});
        if (request.id === "departure") {aircraft!.intentions = {...intentionsOf(aircraft!), taxi: "runway", flight: action.request.remainingInPattern ? "pattern" : "departure"}; delete aircraft!.automaticRequest;}
        if (request.id === "taxi-parking") aircraft!.intentions = {...intentionsOf(aircraft!), taxi: "parking"};
        if (request.id === "taxi-runway") aircraft!.intentions = {...intentionsOf(aircraft!), taxi: "runway"};
        if (request.id === "go-around") instruct(aircraft!, {type: "go-around"});
      }
      if (action.replyTo && pendingCommands(next, aircraft!.id).at(-1)?.id !== action.replyTo) return {state, error: "This command has already been answered or superseded. Only the latest command can be answered."};
      const command = next.messages.find(m => m.id === action.replyTo);
      if (action.assign) {
        if (!command?.instruction) return {state, error: "This message has no pending instruction to assign."};
        if (command.instruction.type === "land" && command.clearanceCircuit !== undefined && command.clearanceCircuit !== (aircraft!.circuit ?? 0)) return {state, error: "This landing clearance belongs to a previous circuit."};
        const error = validateAssignment(aircraft!, command.instruction, command.frequency, next.aircraft);
        if (error) return {state, error};
        const previousRunway = aircraft!.runway, previousCircuit = aircraft!.circuit;
        instruct(aircraft!, command.instruction, next.aircraft);
        if (command.instruction.type === "pattern" && command.instruction.sequence && (aircraft!.runway !== previousRunway || aircraft!.circuit !== previousCircuit)) assignSequence(next.aircraft, aircraft!, command.instruction);
        if (command.instruction.type !== "frequency") aircraft!.lastRunway = aircraft!.runway ?? aircraft!.lastRunway;
      }
      if (command?.instruction?.type === "frequency" && command.instruction.frequency === null && !/^Unable/i.test(pilotText)) {command.acknowledged = true; break;}
      next.messages.push({id: envelope.id, aircraftId: aircraft!.id, time: envelope.time, frequency: command?.frequency ?? aircraft!.frequency!, sender: "pilot", text: pilotText, commandId: action.replyTo, read: false, ...(action.request ? {request: action.request, requestCircuit: aircraft!.circuit ?? 0} : {})}); break;
    }
    case "command": {
      const c = action.command;
      if (c.type === "radio" && ["correction-standby", "disregard"].includes(c.message)) {
        const previous = c.message === "correction-standby" ? pendingCommands(next, aircraft!.id).filter(m => m.frequency === action.frequency).at(-1) : next.messages.filter(m => m.aircraftId === aircraft!.id && m.sender === "controller" && m.frequency === action.frequency).at(-1);
        if (previous) {previous.retractedBy = envelope.id; delete previous.autoReadbackAt;}
      }
      // Sequence commands identify actual traffic immediately; readbacks never re-resolve it.
      assignSequence(next.aircraft, aircraft!, c);
      if (c.type === "land" && c.number === 1) aircraft!.sequence = undefined;
      next.messages.push({id: envelope.id, aircraftId: aircraft!.id, time: envelope.time, frequency: action.frequency, sender: "controller", text: action.text, instruction: c, ...(c.type === "land" ? {clearanceCircuit: aircraft!.circuit ?? 0} : {}), ...(action.replyTo ? {replyTo: action.replyTo} : {}), ...(next.autoReadback && c.type !== "radio" ? {autoReadbackAt: next.elapsed + AUTO_READBACK_DELAY} : {})}); break;
    }
  }
  next.messages = next.messages.slice(-300);
  reconcileSequences(next.aircraft);
  for (const a of next.aircraft) a.pending = unreadMessages(next, a.id);
  if (action.kind === "edit") automaticSpeed(aircraft!);
  next.processed = [...next.processed.slice(-511), envelope.id];
  next.revision++;
  return {state: next};
}

export const AUTO_READBACK_DELAY = 1.5;

export function validateControllerMessage(state: Exercise, a: Aircraft, command: Instruction, frequency: Frequency, replyTo?: string): string | null {
  const invalid = validateInstruction(a, command, frequency); if (invalid) return invalid;
  if (replyTo && pendingPilotMessage(state, a.id, frequency)?.id !== replyTo) return "This pilot message has already been answered or superseded.";
  if (command.type === "radio" && command.message === "unable" && !replyTo) return "Unable is available only as a reply to a pilot message.";
  if (command.type === "radio" && command.message === "disregard" && !state.messages.some(m => m.aircraftId === a.id && m.sender === "controller" && m.frequency === frequency)) return "There is no previous controller message to disregard on this frequency.";
  return null;
}

export function readbackText(callsign: string, text: string, instruction?: Instruction): string {
  let phrase = (text.startsWith(`${callsign}, `) ? text.slice(callsign.length + 2) : text).replace(/\.$/, "");
  if (instruction?.type === "cross") phrase = phrase.replace(/^cross /i, "Crossing ");
  if (instruction?.type === "hold-short") phrase = phrase.replace(/^hold short(?: of)? /i, "Holding short ");
  if (instruction?.type === "give-way") phrase = phrase.replace(/^give way to /i, "Giving way to ").replace(/on your /gi, "on my ");
  if (instruction?.type === "taxi" && instruction.destination === "parking") phrase = phrase.replace(/at your discretion/i, "at my discretion");
  if (instruction?.type === "frequency" && instruction.frequency && !instruction.whenReady) phrase = phrase.replace(/^contact /i, "Contacting ");
  return `${phrase}, ${callsign}`;
}
/** Authoritative session tick only. Client motion prediction never generates radio replies. */

export function autoReadbacks(state: Exercise, now: number, createId: () => string): Exercise {
  if (!state.running || !state.autoReadback) return state;
  let next = state;
  for (const a of state.aircraft.filter(a => a.arrivalRequest)) {
    next = structuredClone(next);
    delete next.aircraft.find(other => other.id === a.id)!.arrivalRequest;
    next.revision++;
    const frequency = a.arrivalRequest === "taxi-parking" ? "ground" : "tower";
    if (a.frequency === frequency) {
      if (a.arrivalRequest === "frequency-change") next.aircraft.find(other => other.id === a.id)!.parkingAfterContact = true;
      next = applyEnvelope(next, {id: createId(), time: now, action: {kind: "pilot", aircraftId: a.id,
        text: "", request: {id: a.arrivalRequest === "taxi-parking" ? "taxi-parking" : "frequency-change", runway: a.runway ?? "24"}}}).state;
    }
  }
  for (const a of next.aircraft.filter(a => a.automaticRequest)) {
    const request = a.automaticRequest;
    const id = request === "taxi" ? intentionsOf(a).taxi === "parking" ? "taxi-parking" : "taxi-runway" : request === "departure" ? "departure" : "inbound-option";
    const valid = request === "taxi" ? a.mode === "parked" && a.frequency === "ground" : request === "departure" ? atDepartureHold(a) && a.frequency === "tower" : a.mode === "heading" && a.frequency === "tower";
    next = structuredClone(next); delete next.aircraft.find(other => other.id === a.id)!.automaticRequest; next.revision++;
    const pending = a.frequency ? pendingPilotMessage(next, a.id, a.frequency) : undefined;
    const instruction = pendingCommands(next, a.id).at(-1)?.instruction;
    const alreadyCleared = request === "taxi" && instruction?.type === "taxi" || request === "departure" && (instruction?.type === "takeoff" || instruction?.type === "lineup");
    if (valid && pending?.request?.id !== id && !alreadyCleared) next = applyEnvelope(next, {id: createId(), time: now, action: {kind: "pilot", aircraftId: a.id, text: "", request: {id, runway: a.departureRunway ?? a.runway ?? "24", remainingInPattern: intentionsOf(a).flight === "pattern"}}}).state;
  }
  for (const a of state.aircraft.filter(a => a.selfGoAroundPending)) {
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
    const error = command.instruction.type === "land" && command.clearanceCircuit !== undefined && command.clearanceCircuit !== (a.circuit ?? 0) ? "This landing clearance belongs to a previous circuit." : validateAssignment(a, command.instruction, command.frequency, next.aircraft);
    const result = applyEnvelope(next, {id: createId(), time: now, action: {
      kind: "pilot", aircraftId: a.id, replyTo: command.id, assign: !error,
      text: error ? `Unable, ${error} ${a.callsign}` : readbackText(a.callsign, command.text, command.instruction),
    }});
    next = result.state;
  }
  return next;
}
const NEXT_LEG: Record<Leg, Leg> = {upwind: "crosswind", crosswind: "downwind", downwind: "base", base: "final", final: "upwind"};
const turnLead = (a: Aircraft) => Math.max(.12, a.speed / 3600 / (DEFAULTS.turnRate * radians));
interface SequenceGuidance {extendDownwind: boolean; speedLimit?: number}
/** Compare arrival times at the shared final, including traffic on the opposite hand.
 * Wait for the predecessor to turn base: its own downwind may still be extended.
 * Underestimate our turn distance and overestimate theirs to leave a spacing margin. */

function sequenceGuidance(a: Aircraft, aircraft: Aircraft[]): SequenceGuidance {
  const following = followedAircraft(a, aircraft);
  if (a.mode !== "pattern" || !following || a.sequence?.departure) return {extendDownwind: false};
  const established = following.mode === "pattern" && ["base", "final"].includes(following.leg) && !following.extended;
  if (!established) return {extendDownwind: a.leg === "downwind"};
  const leaderSpeed = Math.max(1, Math.min(following.speed, following.targetSpeed));
  const spacing = Math.max(DEFAULTS.sequenceSeconds, DEFAULTS.sequenceDistance * 3600 / leaderSpeed);
  const leaderSeconds = arrivalDistance(following) * 3600 / leaderSpeed;
  if (a.leg === "downwind") {
    const finalDistance = Math.max(defaultBaseDistance(a), a.patternFinalDistance ?? 0, -runwayCoordinates(a.position, runwayGeometry(a.runway ?? "24")).along + turnLead(a));
    const remaining = Math.max(0, DEFAULTS.patternWidth + finalDistance - 2 * turnLead(a));
    const ownSeconds = remaining * 3600 / Math.max(1, a.speed, a.targetSpeed);
    return {extendDownwind: ownSeconds < leaderSeconds + spacing};
  }
  if (a.leg === "base" || a.leg === "final") {
    const remaining = Math.max(0, arrivalDistance(a) - (a.leg === "base" ? 2 * turnLead(a) : 0));
    const minimum = a.speedMode === "manual" ? DEFAULTS.minimumPatternSpeed : speedProfile(a).minimum;
    return {extendDownwind: false, speedLimit: Math.max(minimum, remaining * 3600 / (leaderSeconds + spacing))};
  }
  return {extendDownwind: false};
}

function atDepartureHold(a: Aircraft) {
  return a.mode === "taxi" && a.holding && a.taxiIndex === a.taxiPath.length - 1 && !!a.taxiPath[a.taxiIndex]?.hold && distance(a.position, a.taxiPath[a.taxiIndex]) < 1e-7;
}

function stepTraffic(aircraft: Aircraft[], dt: number, autoGoAround = false) {
  // Read every aircraft before moving any, so array order cannot affect spacing.
  const guidance = aircraft.map(a => sequenceGuidance(a, aircraft));
  resolveGroundPriorities(aircraft);
  const ground = aircraft.map(a => groundGuidance(a, aircraft));
  aircraft.forEach((a, index) => move(a, dt, guidance[index], ground[index], autoGoAround));
}
const motionCopy = (a: Aircraft): Aircraft => ({...a, position: {...a.position}, ...(a.pushback ? {pushback: {...a.pushback}} : {})});

export function advance(state: Exercise, seconds: number): Exercise {
  if (!state.running || !Number.isFinite(seconds) || seconds <= 0) return state;
  // Fixed substeps prevent tab scheduling and frame rate from changing flight behavior.
  const next = {...state, aircraft: state.aircraft.map(motionCopy)};
  let remaining = Math.min(seconds, 5);
  while (remaining > 1e-8) {
    const dt = Math.min(remaining, 0.05);
    // A stopped head-on pair may use an alternate mapped route. A single-lane
    // obstruction with no alternate remains stopped for staff intervention.
    if (Math.floor(next.elapsed + dt) !== Math.floor(next.elapsed)) for (const a of next.aircraft) {
      if (a.mode !== "taxi" || a.holding || a.speed > 1 || intentionsOf(a).taxi !== "runway") continue;
      const blocker = next.aircraft.find(b => b.id !== a.id && b.mode === "taxi" && !b.holding && b.speed <= 1 && distance(a.position, b.position) < GROUND.spacing + .005 && Math.abs((a.heading - b.heading + 540) % 360 - 180) > 150);
      if (!blocker || a.id > blocker.id && a.giveWay?.aircraftId !== blocker.id) continue;
      const route = planTaxiRoute(AIRPORT, a.position, a.departureRunway ?? a.runway ?? "24", [blocker.position]);
      if (route.path) {a.taxiPath = route.path; a.taxiIndex = 0; a.releasedHold = null; delete a.groundYield;}
    }
    const phases = next.aircraft.map(a => a.mode);
    stepTraffic(next.aircraft, dt, !!state.autoReadback);
    for (const [index, a] of next.aircraft.entries()) {
      if (state.autoReadback && phases[index] === "pushback" && a.mode === "parked") a.automaticRequest = "taxi";
      if (a.giveWay) {
        const target = next.aircraft.find(other => other.id === a.giveWay!.aircraftId);
        if (!target || !target.active || target.altitude >= 1000 || !groundConflict(a, target) && distance(a.position, target.position) > GROUND.spacing) delete a.giveWay;
      }
      if (state.autoReadback && a.transitionOverheadArmed && a.mode === "heading" && a.frequency === "tower" && distance(a.position, {x: 0, y: 0}) <= (intentionsOf(a).overheadRadius ?? 1)) {
        delete a.transitionOverheadArmed; a.landing = "touch-and-go"; a.automaticRequest = "inbound-option";
      }
    }
    // Frequency changes are authoritative, never made by rendering predictions.
    for (const a of next.aircraft) if (state.autoReadback && a.contactTowerAtHold && atDepartureHold(a)) {
      if (a.frequency === "ground") {a.frequency = "tower"; a.automaticRequest = "departure";}
      delete a.contactTowerAtHold;
    }
    for (const a of next.aircraft) if (a.arrivalExit && !a.runwayExit && ["taxi", "parked"].includes(a.mode) && Math.abs(runwayCoordinates(a.position, runwayGeometry(a.runway ?? "24")).lateral) >= .06 - 1e-7) {
      a.intentions = {...intentionsOf(a), taxi: "parking"};
      if (state.autoReadback && ["parking", "exit-runway"].includes(a.arrivalExit.instruction) && (a.frequency === "tower" || a.frequency === "ground")) {a.frequency = "ground"; a.arrivalRequest = "taxi-parking";}
      else if (state.autoReadback && a.arrivalExit.instruction === "automatic") {if (a.frequency === "tower") a.arrivalRequest = "frequency-change"; else if (a.frequency === "ground") a.arrivalRequest = "taxi-parking";}
      delete a.arrivalExit;
      a.targetSpeed = a.mode === "taxi" ? DEFAULTS.taxiSpeed : 0;
    }
    next.elapsed += dt; remaining -= dt;
    for (const a of next.aircraft) if (!a.trail.length || next.elapsed - (a.trail.at(-1)!.time ?? -Infinity) >= DEFAULTS.trailInterval - 1e-8) a.trail = [...a.trail, {...a.position, time: next.elapsed}];
  }
  next.revision++;
  for (const a of next.aircraft) a.trail = a.trail.filter(p => p.time !== undefined && p.time >= next.elapsed - DEFAULTS.radarSeconds - 1e-8).slice(-120);
  reconcileSequences(next.aircraft);
  return next;
}

function move(a: Aircraft, dt: number, guidance: SequenceGuidance, ground: GroundGuidance, autoGoAround: boolean) {
  const g = runwayGeometry(a.runway ?? "24");
  let target: Point | null = null;
  if (a.mode === "parked") return;
  if (a.mode === "pushback") {
    if (a.holding) {a.speed = 0; return;}
    const waypoint = a.pushback?.path[a.pushback.index];
    if (!waypoint) {a.mode = "parked"; a.speed = 0; a.targetSpeed = 0; a.pushback = undefined; return;}
    a.pushback!.index = moveGround(a, a.pushback!.path, a.pushback!.index, dt, true, ground).index;
    a.altitude = AIRPORT.elevation; return;
  }
  if (a.mode === "taxi" || a.mode === "lineup") {
    const liningUp = a.mode === "lineup";
    if (a.holding) {a.speed = 0; return;}
    const waypoint = a.taxiPath[a.taxiIndex];
    if (!waypoint) {
      a.speed = 0; a.targetSpeed = 0;
      if (!liningUp) {a.mode = "parked"; return;}
      const angle = ((g.heading - a.heading + 540) % 360) - 180;
      a.heading = normalizeHeading(a.heading + Math.sign(angle) * Math.min(Math.abs(angle), GROUND.turnRate * dt));
      a.targetHeading = g.heading;
      if (Math.abs(angle) < 1) {a.heading = g.heading; if (!a.lineupWait) {a.mode = "takeoff"; a.targetSpeed = DEFAULTS.airSpeed;} else a.holding = true;}
      return;
    }
    const moved = moveGround(a, a.taxiPath, a.taxiIndex, dt, false, ground);
    if (moved.index !== a.taxiIndex) a.releasedHold = null;
    a.taxiIndex = moved.index;
    if (moved.held) {a.holding = true; a.targetSpeed = 0;}
    if (a.taxiIndex >= a.taxiPath.length && !liningUp) {a.mode = "parked"; a.speed = 0; a.targetSpeed = 0;}
    a.altitude = AIRPORT.elevation;
    return;
  } else if (a.mode === "pattern") {
    if (a.leg === "downwind") {
      // Move the base turn with the extension instead of steering back toward the
      // original corner. Keep this geometry through base/final and across reloads.
      a.patternFinalDistance = Math.max(defaultBaseDistance(a), a.patternFinalDistance ?? 0, -runwayCoordinates(a.position, g).along + turnLead(a));
    }
    if (a.extended || a.leg === "downwind" && guidance.extendDownwind && -runwayCoordinates(a.position, g).along >= defaultBaseDistance(a) - turnLead(a)) a.targetHeading = normalizeHeading(g.heading + (a.leg === "downwind" ? 180 : 0));
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
        if (!option) a.landing = "full-stop";
        a.optionHand = optionHand;
        a.mode = "rollout"; a.altitude = AIRPORT.elevation; a.targetSpeed = a.landing === "touch-and-go" ? DEFAULTS.airSpeed : 0; a.targetHeading = g.heading; a.heading = g.heading;
        a.position = add(g.threshold, g.vector, Math.max(0, runwayCoordinates(a.position, g).along));
      } else if (crossedThreshold && !permitted && autoGoAround) {
        a.mode = "go-around"; a.leg = "upwind"; a.extended = false; a.targetHeading = g.heading; a.selfGoAroundPending = true;
      } else if (crossedThreshold || (a.leg !== "final" && segment.along >= segment.length - lead - 1e-8)) {
        // Crossing the end plane, rather than chasing a point, prevents circling
        // an unreachable waypoint and keeps final parallel to the runway centerline.
        a.leg = NEXT_LEG[a.leg]; start = previous[a.leg]; end = points[a.leg]; segment = coordinates(start, end);
      }
      if (a.mode === "pattern") {
        const lookahead = Math.max(.25, lead * 1.3);
        target = add(start, segment.vector, Math.max(0, segment.along) + lookahead);
        a.targetHeading = bearing(a.position, target);
      }
    }
    const height = a.clearedToLand && ["base", "final"].includes(a.leg) ? Math.min(DEFAULTS.patternHeight, (a.leg === "base" ? a.patternFinalDistance ?? defaultBaseDistance(a) : Math.max(0, -runwayCoordinates(a.position, g).along)) * 6076 * Math.tan(3 * radians)) : DEFAULTS.patternHeight;
    if (a.mode === "pattern") a.altitude = approach(a.altitude, AIRPORT.elevation + height, DEFAULTS.climbRate / 60 * dt);
  } else if (a.mode === "go-around") {
    a.targetHeading = g.heading;
    a.altitude = approach(a.altitude, AIRPORT.elevation + DEFAULTS.patternHeight, DEFAULTS.climbRate / 60 * dt);
    const along = (a.position.x - g.departure.x) * g.vector.x + (a.position.y - g.departure.y) * g.vector.y;
    if (!a.goAroundRunwayHeading && along >= DEFAULTS.upwindLength && a.altitude >= AIRPORT.elevation + DEFAULTS.patternHeight) {a.mode = "pattern"; a.leg = "crosswind";}
  } else if (a.mode === "takeoff") {
    a.targetHeading = g.heading;
    if (a.altitude <= AIRPORT.elevation + 1) {
      a.position = add(g.threshold, g.vector, Math.max(0, runwayCoordinates(a.position, g).along));
      a.heading = g.heading;
    }
    if (a.speed >= DEFAULTS.rotationSpeed) a.altitude += DEFAULTS.climbRate / 60 * dt;
    if (a.altitude >= AIRPORT.elevation + 300) {a.mode = a.takeoffPattern === false ? "heading" : "pattern"; a.leavingCircuit = a.takeoffPattern === false; a.leg = "upwind"; a.extended = false; if (a.takeoffPattern !== false) delete a.takeoffPattern;}
  } else if (a.mode === "rollout") {
    a.targetHeading = g.heading;
    if (a.holding) {a.speed = 0; return;}
    if (!a.runwayExit && a.landing === "touch-and-go") {a.mode = "takeoff"; a.takeoffPattern = true; a.targetSpeed = DEFAULTS.airSpeed; if (a.optionHand) a.hand = a.optionHand; a.optionHand = undefined; a.leg = "upwind";}
    else {
      if (!a.runwayExit) queueRunwayExit(a, "any", "automatic");
      else if (!a.arrivalExit) a.arrivalExit = {instruction: "exit-runway", speed: 15}; // Legacy assigned exits.
      a.targetSpeed = a.arrivalExit?.speed ?? 0;
      a.speed = approach(a.speed, a.targetSpeed, DEFAULTS.acceleration * dt);
      a.heading = g.heading;
      const along = runwayCoordinates(a.position, g).along;
      const entry = a.runwayExit?.[1], entryAlong = entry ? runwayCoordinates(entry, g).along : Infinity;
      const nextAlong = Math.min(entryAlong, along + a.speed / 3600 * dt);
      a.position = add(g.threshold, g.vector, nextAlong);
      if (entry && nextAlong >= entryAlong - 1e-8 && a.speed <= a.targetSpeed + 1e-8) {
        a.position = {...entry}; a.taxiPath = a.runwayExit!; delete a.runwayExit;
        a.taxiIndex = 2; a.mode = "taxi"; a.releasedHold = null;
      } else if (!entry && a.speed < 1) {a.mode = "parked"; a.speed = 0;}
      return;
    }
  }
  if (a.mode === "heading" && a.takeoffPattern === false) {a.altitude = approach(a.altitude, AIRPORT.elevation + DEFAULTS.patternHeight, DEFAULTS.climbRate / 60 * dt); if (a.altitude >= AIRPORT.elevation + DEFAULTS.patternHeight) delete a.takeoffPattern;}
  if (a.mode === "heading" && a.transitionAltitude !== undefined && a.altitude < a.transitionAltitude) a.altitude = approach(a.altitude, a.transitionAltitude, DEFAULTS.climbRate / 60 * dt);
  automaticSpeed(a);
  const angle = ((a.targetHeading - a.heading + 540) % 360) - 180;
  a.heading = normalizeHeading(a.heading + Math.sign(angle) * Math.min(Math.abs(angle), DEFAULTS.turnRate * dt));
  a.speed = approach(a.speed, Math.min(a.targetSpeed, guidance.speedLimit ?? Infinity), DEFAULTS.acceleration * dt);
  const stride = a.speed / 3600 * dt;
  a.position = {x: a.position.x + Math.sin(a.heading * radians) * stride, y: a.position.y + Math.cos(a.heading * radians) * stride};
}
/** Rendering prediction uses the same kinematics as the authoritative engine. */

export function predictAircraft(aircraft: Aircraft[], seconds: number, autoGoAround = false): Aircraft[] {
  const next = aircraft.map(motionCopy);
  let remaining = Math.max(0, Math.min(seconds, 1.5));
  while (remaining > 1e-8) {const dt = Math.min(remaining, .05); stepTraffic(next, dt, autoGoAround); remaining -= dt;}
  return next;
}

export function projectedPath(aircraft: Aircraft, seconds = 120, traffic: Aircraft[] = [aircraft], autoGoAround = false): Point[] {
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

export function headingProjection(a: Pick<Aircraft, "position" | "heading" | "speed">): Point[] {
  return [a.position, add(a.position, {x: Math.sin(a.heading * radians), y: Math.cos(a.heading * radians)}, a.speed * DEFAULTS.radarSeconds / 3600)];
}

export function patternOutline(a: Pick<Aircraft, "runway" | "hand" | "patternFinalDistance" | "speedTargets">): Point[] {
  const p = patternTargets(a); return [p.final, p.upwind, p.crosswind, p.downwind, p.base, p.final];
}

export const weatherSummary = {metar: METAR, wind: `${EXERCISE_WEATHER.windDirection}° at ${EXERCISE_WEATHER.windSpeed}KT`, visibility: `${EXERCISE_WEATHER.visibilityKm}km (simulated)`, frequencies: FREQUENCIES};
