import {profileForType, performanceFor} from "./aircraft-performance";
import {getAirport, runwayEnds, trainingMode, type AirportSelection} from "./airports";
import {callsignConflict} from "./callsigns";
import {engineFor} from "./engine";
import {magneticToTrue} from "./magnetic-headings";
import {aircraftSchema} from "./protocol";
import {gatesFor, normalizeScenarioAircraft, seedFromAircraft, standPlacement, type ScenarioDefinition} from "./scenarios";
import {MAX_AIRCRAFT, type Aircraft, type Leg, type Point} from "./model";

export type LocalPlacement = "ground" | "gate" | "final" | "circuit" | "custom";
export interface LocalAircraftOptions {
  placement: LocalPlacement; callsign: string; type: string; runway: string; gateId?: string;
  distance: number; leg: Leg; hand: Aircraft["hand"]; height: number; speed: number | "auto"; heading: number; position?: Point;
  landing: Aircraft["landing"]; flight: "pattern" | "departure"; frequency: "ground" | "tower" | null;
}

export function availableLocalGate(selection: AirportSelection, aircraft: readonly Pick<Aircraft, "active" | "position" | "altitude">[]) {
  const airport = getAirport(selection);
  return gatesFor(airport).find(gate => {
    const point = standPlacement(gate.id, false, airport)!.position;
    return !aircraft.some(a => a.active && a.altitude <= airport.elevation + 20 && Math.hypot(a.position.x - point.x, a.position.y - point.y) < .04);
  });
}

/** Build fresh training traffic, with the same runway-relative geometry in live sessions and scenarios. */
export function createLocalAircraft(selection: AirportSelection, id: string, options: LocalAircraftOptions, existingCallsigns: readonly string[] = []): Aircraft {
  if (trainingMode(selection) !== "local") throw new Error("Choose a Ground & Tower session.");
  const airport = getAirport(selection), engine = engineFor(selection);
  if (!runwayEnds(airport).some(end => end.id === options.runway)) throw new Error("Choose a runway at this airport.");
  const callsign = options.callsign.trim(), type = options.type.trim();
  if (!callsign || !type) throw new Error("Enter an aircraft callsign and type.");
  const conflict = callsignConflict(callsign, existingCallsigns); if (conflict) throw new Error(conflict);
  const a = engine.newAircraft(id, options.placement !== "gate");
  Object.assign(a, {callsign, type, ...(profileForType(type)?{performanceProfile:profileForType(type)}:{}), runway: options.runway, landing: options.landing, hand: options.hand, frequency: options.frequency,
    intentions: {flight: options.flight, taxi: "runway", afterTransition: "continue"}});
  const bounded = (value: number, min: number, max: number, label: string) => {
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
    return value;
  };
  if (options.placement === "ground") {
    if (!options.position || !Number.isFinite(options.position.x) || !Number.isFinite(options.position.y) || Math.max(Math.abs(options.position.x), Math.abs(options.position.y)) > 2000) throw new Error("Choose a valid ground position.");
    Object.assign(a, {position: {...options.position}, altitude: airport.elevation, speed: 0, targetSpeed: 0, mode: "parked", groundReady: true, heading: magneticToTrue(bounded(options.heading, 0, 360, "Heading"), airport)});
    a.targetHeading = a.heading;
  } else if (options.placement === "gate") {
    if (!gatesFor(airport).some(gate => gate.id === options.gateId)) throw new Error("Choose a mapped gate.");
    const placement = standPlacement(options.gateId!, false, airport)!;
    Object.assign(a, placement, {targetHeading: placement.heading, groundReady: false});
  } else {
    a.altitude = airport.elevation + bounded(options.height, 1, 60000 - airport.elevation, "Height above airport (ft)");
    if (options.speed !== "auto") {a.speed = a.targetSpeed = bounded(options.speed, performanceFor(a)?.min ?? 80, performanceFor(a)?.max ?? 600, "Speed (kt)"); a.speedMode = "manual";}
    const geometry = engine.runwayGeometry(options.runway);
    if (options.placement === "final") {
      const distance = bounded(options.distance, 1, 25, "Final distance (NM)");
      a.position = {x: geometry.threshold.x - geometry.vector.x * distance, y: geometry.threshold.y - geometry.vector.y * distance};
      a.heading = a.targetHeading = geometry.heading; a.mode = "pattern"; a.leg = "final";
    } else if (options.placement === "circuit") {
      const targets = engine.patternTargets(a);
      const previous = {upwind: geometry.threshold, crosswind: targets.upwind, downwind: targets.crosswind, base: targets.downwind, final: targets.base};
      const start = previous[options.leg], end = targets[options.leg];
      a.position = {x: (start.x + end.x) / 2, y: (start.y + end.y) / 2};
      a.heading = a.targetHeading = engine.bearing(start, end); a.mode = "pattern"; a.leg = options.leg;
    } else {
      a.mode = "heading";
      a.position = options.position ? {...options.position} : {x: geometry.threshold.x - geometry.vector.x * 5, y: geometry.threshold.y - geometry.vector.y * 5};
      a.heading = a.targetHeading = magneticToTrue(bounded(options.heading, 0, 360, "Heading"), airport);
    }
    if (options.speed === "auto") {a.speedMode = "auto"; a.speed = a.targetSpeed = engine.speedProfile(a).target;}
  }
  const performance=performanceFor(a);
  if(performance && a.altitude>performance.ceiling)throw new Error(`${performance.name} ceiling is ${performance.ceiling.toLocaleString()} ft.`);
  return aircraftSchema.parse(a);
}

/** Add the aircraft and its optional spawn event together, without resetting existing traffic. */
export function addLocalScenarioAircraft(definition: ScenarioDefinition, aircraft: Aircraft, gateId: string | undefined, at: number): ScenarioDefinition {
  if (definition.aircraft.length >= MAX_AIRCRAFT) throw new Error(`A scenario can contain up to ${MAX_AIRCRAFT} aircraft.`);
  if (!Number.isFinite(at) || at < 0 || at > 86400) throw new Error("Spawn time must be between 0 and 86400 seconds.");
  if (at > 0 && definition.events.length >= 200) throw new Error("The scenario already has 200 events.");
  const conflict = callsignConflict(aircraft.callsign, definition.aircraft.map(a => a.seed.callsign)); if (conflict) throw new Error(conflict);
  const spec = normalizeScenarioAircraft({key: aircraft.id, initial: at === 0, gateId, seed: seedFromAircraft(aircraft)}, getAirport(definition));
  return {...definition, aircraft: [...definition.aircraft, spec], events: at === 0 ? definition.events : [...definition.events,
    {id: `spawn-${aircraft.id}`.slice(0, 32), title: `Spawn ${aircraft.callsign}`, trigger: {type: "time", at}, actions: [{type: "spawn", aircraftKey: aircraft.id}]}]};
}

