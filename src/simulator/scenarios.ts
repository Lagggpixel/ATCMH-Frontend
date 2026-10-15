import {REQUEST_IDS} from "./catalog";
import {z} from "zod";
import {aircraftSchema, instructionSchema, runwaySchema, radarEnvironmentSchema, frequencySchema} from "./protocol";
import {radarEnvironmentFor} from "./radar";
import {engineFor} from "./engine";
import {buildTaxiGraph} from "./taxi-routing";
import {AIRPORT_IDS, defaultAirport, getAirport, airportSelection, trainingStation, trainingMode, runwayReferenceError, type AirportSelection} from "./airports";
import type {Aircraft, Airport, Exercise, Point} from "./model";
const key = z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/);
const seconds = z.number().finite().min(0).max(86400);
const point = z.object({x: z.number().finite().min(-2000).max(2000), y: z.number().finite().min(-2000).max(2000)});

export const seedSchema = aircraftSchema.omit({id: true, lastRunway: true, taxiIndex: true, holding: true, releasedHold: true, trail: true, pending: true, reminderAt: true, sequence: true, circuit: true, patternFinalDistance: true, pushback: true, selfGoAroundPending: true, giveWay: true, groundYield: true, automaticRequest: true, parkingAfterContact: true, transitionOverheadArmed: true, departureRunway: true, takeoffPattern: true, contactTowerAtHold: true, arrivalExit: true, arrivalRequest: true, runwayExit: true, transitionAltitude: true, leavingCircuit: true, lineupWait: true})
  .refine(seed => seed.mode !== "pushback", "Start aircraft parked and schedule a pushback manoeuvre instead.");

export const conditionSchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("frequency"), aircraftKey: key, frequency: frequencySchema}),
  z.object({type: z.literal("altitude"), aircraftKey: key, altitude: z.number().min(1000).max(60000)}),
  z.object({type: z.literal("radar"), aircraftKey: key, state: z.enum(["captured", "missed", "transferred", "route-complete"])}),
  z.object({type: z.literal("leg"), aircraftKey: key, leg: z.enum(["upwind", "crosswind", "downwind", "base", "final"])}),
  z.object({type: z.literal("hold"), aircraftKey: key}),
  z.object({type: z.literal("position"), aircraftKey: key, point, radius: z.number().min(.01).max(10)}),
  z.object({type: z.literal("overhead"), aircraftKey: key, radius: z.number().min(.1).max(5)}),
  z.object({type: z.literal("event"), eventId: key}),
]);

export const eventActionSchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("spawn"), aircraftKey: key}),
  z.object({type: z.literal("request"), aircraftKey: key, requestId: z.enum(REQUEST_IDS).optional(), label: z.string().min(1).max(80).optional(), runway: runwaySchema, direction: z.enum(["north", "east", "south", "west"]).optional(), includeRunway: z.boolean().optional(), remainingInPattern: z.boolean().optional()}),
  z.object({type: z.literal("transmission"), aircraftKey: key, text: z.string().trim().min(1).max(1000)}),
  z.object({type: z.literal("maneuver"), aircraftKey: key, instruction: instructionSchema}),
  z.object({type: z.literal("remove"), aircraftKey: key}),
  z.object({type: z.literal("note"), text: z.string().trim().min(1).max(2000)}),
]);

export const eventSchema = z.object({id: key, title: z.string().trim().min(1).max(100), trigger: z.discriminatedUnion("type", [
  z.object({type: z.literal("time"), at: seconds}),
  z.object({type: z.literal("manual")}),
  z.object({type: z.literal("condition"), condition: conditionSchema, delay: seconds}),
]), actions: z.array(eventActionSchema).min(1).max(10)});

export const scenarioSchema = z.object({schema: z.union([z.literal(1), z.literal(2)]), airport: z.enum(AIRPORT_IDS), airportDataDate: z.string().max(30), airportDataVersion: z.string().max(100).optional(), trainingStation: z.string().max(100).optional(),
  radarEnvironment: radarEnvironmentSchema.optional(),
  title: z.string().trim().min(1).max(80), instructorNotes: z.string().max(6000),
  aircraft: z.array(z.object({key, initial: z.boolean(), seed: seedSchema, gateId: z.string().optional()})).max(50), events: z.array(eventSchema).max(200),
}).superRefine((value, ctx) => {
  const keys = new Set(value.aircraft.map(a => a.key)), events = new Set(value.events.map(e => e.id));
  const error = (message: string) => ctx.addIssue({code: z.ZodIssueCode.custom, message});
  let airport: Airport;
  try {
    airport = getAirport(value); trainingStation(value);
    if (value.schema === 1 && value.airport !== "EGPH") throw new Error("Legacy scenarios use EGPH.");
    if (value.schema === 2 && (!value.airportDataVersion || !value.trainingStation)) throw new Error("Airport and training frequency are required.");
    if (value.airportDataDate !== airport.sourceDate) throw new Error("Airport source date does not match the pinned dataset.");
    const invalid = runwayReferenceError(value, airport); if (invalid) throw new Error(invalid);
  } catch (reason) {error((reason as Error).message); return;}
  if (trainingMode(value) !== "local") {
    const environment = value.radarEnvironment ?? radarEnvironmentFor(airport);
    for (const a of value.aircraft) {
      if (isGroundSpawn(a.seed, airport) || a.seed.mode !== "heading" || !a.seed.radar || a.seed.radar.station !== trainingMode(value)) error(`${a.seed.callsign}: radar exercises require airborne radar traffic.`);
      for (const id of [a.seed.radar?.expected, a.seed.radar?.cleared]) if (id && !environment.approaches.some(p => p.id === id)) error(`${a.seed.callsign}: approach is missing from the training environment.`);
    }
  }
  else if (value.aircraft.some(a => a.seed.radar)) error("Ground & Tower traffic cannot use radar guidance.");
  if (keys.size !== value.aircraft.length || events.size !== value.events.length) error("Aircraft and event identifiers must be unique.");
  for (const a of value.aircraft) if (a.gateId && !standPlacement(a.gateId, false, airport)) error(`${a.seed.callsign}: choose a mapped gate.`);
  const spawns = new Set(value.aircraft.filter(a => a.initial).map(a => a.key));
  for (const event of value.events) {
    for (const action of event.actions) {
      if (action.type === "request" && !action.requestId && !action.label) error(`${event.title}: choose a pilot request.`);
      if ("aircraftKey" in action && !keys.has(action.aircraftKey)) error(`${event.title}: aircraft is missing.`);
      if (action.type === "spawn") {if (spawns.has(action.aircraftKey)) error(`${event.title}: aircraft is spawned more than once.`); spawns.add(action.aircraftKey);}
    }
    if (event.trigger.type === "condition") {
      const condition = event.trigger.condition;
      if ("aircraftKey" in condition && !keys.has(condition.aircraftKey)) error(`${event.title}: condition aircraft is missing.`);
      if (condition.type === "event" && (!events.has(condition.eventId) || condition.eventId === event.id)) error(`${event.title}: invalid event dependency.`);
    }
  }
  for (const a of value.aircraft) if (!spawns.has(a.key)) error(`${a.seed.callsign}: add a spawn event or include it at Start.`);
  // Event dependencies must form a directed acyclic graph.
  const visiting = new Set<string>(), done = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (done.has(id)) return true;
    visiting.add(id);
    const trigger = value.events.find(e => e.id === id)?.trigger;
    if (trigger?.type === "condition" && trigger.condition.type === "event" && !visit(trigger.condition.eventId)) return false;
    visiting.delete(id); done.add(id); return true;
  };
  if (value.events.some(e => !visit(e.id))) error("Event dependencies contain a cycle.");
});

export type ScenarioDefinition = z.infer<typeof scenarioSchema>;

export type ScenarioEvent = z.infer<typeof eventSchema>;

export type ScenarioAction = z.infer<typeof eventActionSchema>;

export type EventState = {status: "scheduled" | "waiting" | "completed" | "blocked" | "skipped"; conditionAt?: number; completedAt?: number; error?: string};

export interface ScenarioRuntime {
  definition: ScenarioDefinition; generation: string; aircraftIds: Record<string, string>; events: Record<string, EventState>;
  started: boolean; finished: boolean; feedback?: string; attemptId?: string; scenarioId?: string; revision?: number;
}

export const scenarioRuntimeSchema = z.object({definition: scenarioSchema, generation: z.string().uuid(), aircraftIds: z.record(z.string()),
  events: z.record(z.object({status: z.enum(["scheduled", "waiting", "completed", "blocked", "skipped"]), conditionAt: z.number().finite().min(0).max(1e12).optional(), completedAt: z.number().finite().min(0).max(1e12).optional(), error: z.string().optional()})),
  started: z.boolean(), finished: z.boolean(), feedback: z.string().max(6000).optional(), attemptId: z.string().uuid().optional(), scenarioId: z.string().uuid().optional(), revision: z.number().int().positive().optional()});

export interface ScenarioRecord {id: string; ownerId: string; ownerName?: string; version: number; publishedRevision: number; updatedAt: number; draft: ScenarioDefinition; published?: {title: string} & AirportSelection}

export interface ScenarioStaffView {title: string; instructorNotes: string; attemptId?: string; finished: boolean; events: (ScenarioEvent & EventState)[]}

export const scenarioStaffView = (runtime: ScenarioRuntime): ScenarioStaffView => ({title: runtime.definition.title, instructorNotes: runtime.definition.instructorNotes,
  attemptId: runtime.attemptId, finished: runtime.finished, events: runtime.definition.events.map(e => ({...e, ...runtime.events[e.id]}))});

export function seedFromAircraft(a: Aircraft) {return seedSchema.parse(a);}

export function scenarioFromExercise(exercise: Exercise, title: string): ScenarioDefinition {
  const airport = getAirport(exercise);
  return {schema: 2, ...airportSelection(airport), trainingStation: exercise.trainingStation ?? `${airport.icao}:ground`, ...(exercise.radarEnvironment ? {radarEnvironment: structuredClone(exercise.radarEnvironment)} : {}), airportDataDate: airport.sourceDate, title, instructorNotes: "", aircraft: exercise.aircraft.map((a, i) => ({key: `aircraft-${i + 1}`, initial: true, seed: seedFromAircraft({...a, taxiPath: [a.position, ...a.taxiPath.slice(a.taxiIndex)], ...(a.mode === "pushback" ? {mode: "parked", speed: 0, targetSpeed: 0} : {})})})), events: []};
}

export const blankScenario = (selection: AirportSelection = {}): ScenarioDefinition => scenarioFromExercise({...engineFor(selection).initialExercise(), ...(selection.trainingStation ? {trainingStation: selection.trainingStation} : {}), aircraft: []}, "Untitled scenario");

export function createScenarioExercise(definition: ScenarioDefinition, sessionId: string, generation: string): {exercise: Exercise; runtime: ScenarioRuntime} {
  const runtime: ScenarioRuntime = {definition: structuredClone(definition), generation, aircraftIds: Object.fromEntries(definition.aircraft.map(a => [a.key, `${generation}:${a.key}`])), events: Object.fromEntries(definition.events.map(e => [e.id, {status: e.trigger.type === "manual" ? "waiting" : "scheduled"}])), started: false, finished: false};
  const exercise = {...engineFor(definition).initialExercise(sessionId), trainingStation: definition.trainingStation ?? `${definition.airport}:ground`, aircraft: definition.aircraft.filter(a => a.initial).map(a => materializeAircraft(runtime, a.key))};
  return {exercise, runtime};
}

export function materializeAircraft(runtime: ScenarioRuntime, key: string): Aircraft {
  const spec = runtime.definition.aircraft.find(a => a.key === key);
  if (!spec) throw new Error("Aircraft definition is missing.");
  return {...engineFor(runtime.definition).newAircraft(runtime.aircraftIds[key], false), ...structuredClone(normalizeScenarioAircraft(spec, getAirport(runtime.definition)).seed), id: runtime.aircraftIds[key]};
}

const gateCache = new WeakMap<Airport, Airport["features"]>();
/** Offer stands connected to a mapped runway hold; never invent apron connections. */
export function gatesFor(airport: Airport) {
  const cached = gateCache.get(airport); if (cached) return cached;
  const graph = buildTaxiGraph(airport), reachable = new Set(graph.holds), queue = [...reachable];
  for (let i = 0; i < queue.length; i++) for (const edge of graph.edges[queue[i]]) if (!reachable.has(edge.to)) {reachable.add(edge.to); queue.push(edge.to);}
  const points = new Set([...reachable].map(i => `${graph.points[i].x.toFixed(6)},${graph.points[i].y.toFixed(6)}`));
  const gates = airport.features.filter(f => f.kind === "parking_position" && f.points.length >= 2 && points.has(`${f.points.at(-1)!.x.toFixed(6)},${f.points.at(-1)!.y.toFixed(6)}`));
  gateCache.set(airport, gates); return gates;
}
export const scenarioGates = gatesFor(defaultAirport);

export const isGroundSpawn = (seed: z.infer<typeof seedSchema>, airport: Airport = defaultAirport) => ["parked", "taxi", "lineup", "rollout"].includes(seed.mode) || seed.altitude <= airport.elevation;
/** Legacy surface positions become gate spawns without invalidating saved schema-1 scenarios. */

export function normalizeScenarioAircraft(spec: ScenarioDefinition["aircraft"][number], AIRPORT: Airport = defaultAirport): ScenarioDefinition["aircraft"][number] {
  if (spec.seed.radar) return {...spec, gateId: undefined, seed: {...spec.seed, radar: {...spec.seed.radar, transferred: spec.seed.frequency !== spec.seed.radar.station}}};
  if (!isGroundSpawn(spec.seed, AIRPORT)) return {...spec, gateId: undefined};
  const scenarioGates = gatesFor(AIRPORT);
  if (!scenarioGates.length) throw new Error("No mapped gates are available at this airport.");
  const nearest = scenarioGates.reduce((best, gate) => {
    const p = standPlacement(gate.id, false, AIRPORT)!.position, b = standPlacement(best.id, false, AIRPORT)!.position;
    return Math.hypot(p.x - spec.seed.position.x, p.y - spec.seed.position.y) < Math.hypot(b.x - spec.seed.position.x, b.y - spec.seed.position.y) ? gate : best;
  });
  const gateId = spec.gateId && standPlacement(spec.gateId, false, AIRPORT) ? spec.gateId : nearest.id;
  const placement = standPlacement(gateId, false, AIRPORT)!;
  const moved = Math.hypot(placement.position.x - spec.seed.position.x, placement.position.y - spec.seed.position.y) > .000001;
  return {...spec, gateId, seed: {...spec.seed, position: placement.position, ...(moved ? {heading: placement.heading, targetHeading: placement.heading} : {}), mode: "parked", speed: 0, targetSpeed: 0, altitude: AIRPORT.elevation}};
}

export const normalizeScenario = (definition: ScenarioDefinition): ScenarioDefinition => ({...definition, aircraft: definition.aircraft.map(a => normalizeScenarioAircraft(a, getAirport(definition)))});
// OSM parking centerlines do not establish which endpoint is the parked nose.
// The author must inspect and confirm the endpoint/orientation before publication.

export function standPlacement(id: string, reverse = false, AIRPORT: Airport = defaultAirport): {position: Point; heading: number} | undefined {
  const stand = AIRPORT.features.find(f => f.id === id && f.kind === "parking_position");
  if (!stand || stand.points.length < 2) return;
  const [a, b] = reverse ? [stand.points.at(-1)!, stand.points[0]] : [stand.points[0], stand.points.at(-1)!];
  return {position: {...b}, heading: (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360};
}

export const timeLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
