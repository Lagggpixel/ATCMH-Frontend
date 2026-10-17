import {REFERENCE_ACTIONS} from "./reference-commands";
import {DEFAULTS, MAX_TAXI_POINTS, type Exercise} from "./model";
import {z} from "zod";
import {REQUEST_IDS} from "./catalog";
import {AIRPORT_IDS, getAirport, trainingStation, trainingMode, runwayReferenceError} from "./airports";
import {validAltitude, radarEnvironmentFor} from "./radar";
import {validRadarSpeed} from "./radar-speed";
const bounded = (min: number, max: number) => z.number().finite().min(min).max(max);
const text = z.string().max(2000);
const id = z.string().min(1).max(100);
export const frequencySchema = z.enum(["ground", "tower", "atis", "approach", "center"]);
const frequency = frequencySchema;
export const runwaySchema = z.string().regex(/^(?:0[1-9]|[12][0-9]|3[0-6])[LRC]?$/);
const runway = runwaySchema;
const pilotRequest = z.object({id: z.enum(REQUEST_IDS), runway, direction: z.enum(["north", "east", "south", "west"]).optional(), remainingInPattern: z.boolean().optional(), includeRunway: z.boolean().optional()});
const point = z.object({x: bounded(-2000, 2000), y: bounded(-2000, 2000)});
const taxiPoint = point.extend({hold: z.boolean().optional(), runway: runway.optional()});
const hand = z.enum(["left", "right"]);
export const altitudeSchema = z.object({unit: z.enum(["feet", "flight-level"]), value: bounded(1, 60000).int()}).strict().refine(validAltitude, "Choose a listed altitude.");
const radarSpeedObject = z.object({type: z.literal("radar-speed"), mode: z.enum(["maintain", "approach", "discretion", "slowest", "best-forward", "follow", "present"]), unit: z.enum(["knots", "mach"]).optional(), value: bounded(0, 600).optional(), relation: z.enum(["exact", "minimum", "maximum"]).optional(), until: bounded(0, 20).optional()}).strict();
export const radarSpeedSchema = radarSpeedObject.refine(validRadarSpeed, "Choose a listed speed instruction.");
export const radarEnvironmentSchema = z.object({version: z.literal(1), name: z.string().min(1).max(100), airportName: z.string().max(100).optional(), range: bounded(10, 500), boundary: z.array(point).min(3).max(100), fixes: z.array(z.object({id: z.string().min(1).max(32), point})).max(200), approaches: z.array(z.object({id, type: z.enum(["ils", "gps", "visual"]), runway, finalDistance: bounded(3, 50), captureWidth: bounded(.05, 2), glideAngle: bounded(1, 6), missedHeading: bounded(0, 360)})).max(150)}).superRefine((e, ctx) => {
  if (new Set(e.approaches.map(p => p.id)).size !== e.approaches.length || new Set(e.fixes.map(p => p.id)).size !== e.fixes.length) ctx.addIssue({code: z.ZodIssueCode.custom, message: "Approach and fix IDs must be unique."});
});
// Historical flight targets and radio records retain the previous 500-foot grid.
const savedAltitudeSchema = z.object({unit: z.enum(["feet", "flight-level"]), value: bounded(1, 60000).int()}).strict().refine(a => validAltitude(a) || a.unit === "feet" && a.value >= 1000 && a.value <= 17500 && a.value % 500 === 0);
export const radarStateSchema = z.object({station: z.enum(["approach", "center"]), navigation: z.enum(["heading", "route", "approach", "missed"]), routeIndex: bounded(0, 200).int(), expected: id.optional(), cleared: id.optional(), captured: z.boolean().optional(), localizer: z.boolean().optional(), clearanceAltitudeChecked: z.boolean().optional(), targetAltitude: savedAltitudeSchema.optional(), altitudeAssignedFrom: bounded(0, 65000).optional(), speed: radarSpeedSchema.optional(), guidance: z.literal("vectors").optional(), transferred: z.boolean().optional(), report: z.enum(["check-in", "missed", "intentions"]).optional()});
const phaseSpeed = bounded(1, 600).int().nullable().optional();

export const speedTargetsSchema = z.object({inbound: phaseSpeed, "upwind-downwind": phaseSpeed, base: phaseSpeed, final: phaseSpeed, vref: phaseSpeed}).strict();
const sequence = z.object({number: bounded(1, 8).int(), traffic: text.optional(), followingId: id.optional(), departure: z.boolean().optional(), runway: runway.optional(), circuit: bounded(0, 1e12).int().optional(), followingCircuit: bounded(0, 1e12).int().optional()});
const atis = z.object({letter: z.string().max(20), departures: z.array(runway).max(24), arrivals: z.array(runway).max(24), expectations: z.array(text).max(10), remarks: z.array(text).max(20), notams: z.array(text).max(10), procedures: z.array(text).max(30)});

export const intentionsSchema = z.object({flight: z.enum(["pattern", "departure"]), taxi: z.enum(["runway", "parking"]), parkingStand: id.optional(), afterTransition: z.enum(["continue", "touch-and-go"]), overheadRadius: bounded(.1, 5).optional()}).strict();

export const aircraftSchema = z.object({id, callsign: z.string().min(1).max(80), type: z.string().min(1).max(12), position: point,
  heading: bounded(0, 360), targetHeading: bounded(0, 360), bankAngle: bounded(-DEFAULTS.bankAngle, DEFAULTS.bankAngle).optional(), speed: bounded(0, 600), targetSpeed: bounded(0, 600), altitude: bounded(0, 60000),
  speedMode: z.enum(["auto", "manual"]).optional(),
  speedTargets: speedTargetsSchema.optional(),
  radar: radarStateSchema.optional(),
  frequency: frequency.nullable(), runway: runway.nullable(), lastRunway: runway.nullable(), hand: z.enum(["left", "right"]), leg: z.enum(["upwind", "crosswind", "downwind", "base", "final"]),
  mode: z.enum(["parked", "pushback", "taxi", "lineup", "takeoff", "go-around", "pattern", "heading", "rollout"]), extended: z.boolean(), landing: z.enum(["full-stop", "touch-and-go"]), clearedToLand: z.boolean(),
  clearedForOption: z.boolean().optional(), goAroundRunwayHeading: z.boolean().optional(), selfGoAroundPending: z.boolean().optional(),
  taxiPath: z.array(taxiPoint).max(MAX_TAXI_POINTS), taxiIndex: bounded(0, MAX_TAXI_POINTS).int(), holding: z.boolean(), releasedHold: bounded(0, MAX_TAXI_POINTS).int().nullable(),
  contactTowerAtHold: z.boolean().optional(),
  groundYield: z.object({aircraftId: id, point}).optional(),
  intentions: intentionsSchema.optional(), giveWay: z.object({aircraftId: id, description: z.string().min(1).max(150)}).optional(),
  automaticRequest: z.enum(["taxi", "departure", "inbound-option", "inbound-land"]).optional(), towerCheckInPending: z.boolean().optional(), parkingAfterContact: z.boolean().optional(), transitionOverheadArmed: z.boolean().optional(), departureRunway: runway.optional(), takeoffPattern: z.boolean().optional(),
  arrivalExit: z.object({instruction: z.enum(["automatic", "exit-runway", "parking"]), speed: z.union([z.literal(15), z.literal(25), z.literal(35)]), followOn: z.boolean().optional()}).optional(),
  arrivalRequest: z.enum(["frequency-change", "taxi-parking"]).optional(),
  lineupWait: z.boolean().optional(), transitionAltitude: bounded(500, 10000).multipleOf(500).optional(), leavingCircuit: z.boolean().optional(), runwayExit: z.array(taxiPoint).min(2).max(MAX_TAXI_POINTS).optional(),
  flightPlan: z.array(point.extend({altitude: bounded(1000, 60000).refine(value => validAltitude(value >= 18000 ? {unit: "flight-level", value: value / 100} : {unit: "feet", value})).optional(), speed: bounded(80, 600).optional()})).max(200), trail: z.array(point.extend({time: bounded(0, 1e12).optional()})).max(120), pending: bounded(0, 100000).int(), active: z.boolean(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  tag: z.enum(["auto", "default", "left", "right"]), tagAngle: bounded(0, 360).optional(), reminderAt: bounded(0, 1e12).nullable(), sequence: sequence.optional(), atcManeuver: z.object({kind: z.enum(["circle", "hold"]), hand, remaining: bounded(-360, 720), heading: bounded(0, 360), previousMode: z.enum(["parked", "pushback", "taxi", "lineup", "takeoff", "go-around", "pattern", "heading", "rollout"]), previousLeg: z.enum(["upwind", "crosswind", "downwind", "base", "final"]), altitude: bounded(0, 65000), center: point.optional(), inbound: bounded(0, 360).optional(), phase: z.enum(["entry", "turn-outbound", "outbound", "turn-inbound", "inbound"]).optional(), timer: bounded(0, 120).optional(), turnRemaining: bounded(-10, 540).optional()}).optional(), backTaxi: z.object({lineup: z.boolean(), contactGround: z.boolean()}).optional(), arrivalProcedure: z.string().min(1).max(100).optional(),
  destination: z.object({name: z.string().min(1).max(100), point}).nullable().optional(), diversionDestination: z.object({name: z.string().min(1).max(100), point}).nullable().optional(),
  routeNavigation: z.object({index: bounded(0, 200).int(), descending: z.boolean().optional()}).optional(), starDescent: z.boolean().optional(), reportAirportInSight: z.boolean().optional(), speedInstruction: radarSpeedSchema.optional(), expedited: z.boolean().optional(), followGroundId: id.optional(), optionHand: hand.optional(), circuit: bounded(0, 1e12).int().optional(), patternFinalDistance: bounded(3, 2000).optional(), pushback: z.object({path: z.array(point).min(2).max(10), index: bounded(0, 10).int(), tail: z.enum(["north", "east", "south", "west"]).optional()}).optional()});


function makeInstructionSchema(saved = false) {
  const commandAltitudeSchema = saved ? savedAltitudeSchema : altitudeSchema;
  return z.discriminatedUnion("type", [
  radarSpeedObject,
  z.object({type: z.literal("atc"), action: z.enum(REFERENCE_ACTIONS), variant: z.string().max(100).optional(), runway: runway.optional(), hand: hand.optional(), altitude: commandAltitudeSchema.optional(), index: bounded(0, 199).int().optional(), expedite: z.boolean().optional(), contactGround: z.boolean().optional(), lineup: z.boolean().optional(), frequency: frequency.optional(), text: z.string().max(1000).optional(), name: z.string().max(100).optional()}),
  z.object({type: z.literal("vector"), heading: bounded(0, 360).optional(), altitude: commandAltitudeSchema.optional(), approachId: id.optional(), standalone: z.boolean().optional(), interceptAltitude: bounded(0, 60000).optional()}),
  z.object({type: z.literal("expect-approach"), approachId: id.nullable(), vectors: z.boolean().optional(), navigation: z.enum(["filed", "vectors"]).optional(), runway: runway.optional()}),
  z.object({type: z.literal("missed-approach"), altitude: commandAltitudeSchema, heading: bounded(0, 360).optional(), fromAltitude: bounded(0, 60000).optional()}),
  z.object({type: z.literal("route"), index: bounded(0, 199).int(), altitude: commandAltitudeSchema.optional(), name: z.string().max(100).optional()}),
  z.object({type: z.literal("radio"), message: z.enum(["say-intentions", "standby", "correction-standby", "disregard", "unable", "misc", "roger", "wilco"]), text: z.string().min(1).max(300).optional()}),
  z.object({type: z.literal("transition"), altitude: bounded(saved ? 500 : 1000, 60000).int()}),
  z.object({type: z.literal("departure"), direction: z.enum(["north", "east", "south", "west"])}),
  z.object({type: z.literal("exit-runway"), side: z.enum(["left", "right", "any"]), expedite: z.boolean().optional(), traffic: z.enum(["final", "base"]).optional(), crossRunway: runway.optional(), holdShort: runway.optional()}),
  z.object({type: z.literal("lineup"), runway: runway.optional()}),
  z.object({type: z.literal("pushback"), tail: z.enum(["north", "east", "south", "west"]).optional(), runway: runway.optional()}),
  z.object({type: z.literal("taxi"), runway: runway.optional(), destination: z.enum(["runway", "parking", "continue"]).optional(), contactTowerWhenReady: z.boolean().optional()}),
  z.object({type: z.literal("takeoff"), hand: hand.optional(), runway: runway.optional(), immediate: z.boolean().optional(), straightOut: bounded(500, 60000).optional(), unablePattern: z.boolean().optional()}),
  z.object({type: z.literal("give-way"), aircraftId: id.optional(), description: z.string().min(1).max(150)}),
  z.object({type: z.literal("stop")}),
  z.object({type: z.enum(["hold-short", "cross"]), runway: runway.optional(), expedite: z.boolean().optional(), ground: z.boolean().optional(), departure: z.boolean().optional()}),
  z.object({type: z.literal("land"), runway: runway.optional(), hand: hand.optional(), option: z.boolean().optional(), number: bounded(1, 8).int().optional(), followingId: id.optional()}),
  z.object({type: z.literal("go-around"), hand: hand.optional(), runway: runway.optional(), runwayHeading: z.boolean().optional(), response: z.boolean().optional()}),
  z.object({type: z.literal("cancel-landing")}),
  z.object({type: z.literal("pattern"), leg: z.enum(["upwind", "crosswind", "downwind", "base", "final"]), hand: hand.optional(), runway: runway.optional(), sequence: sequence.optional()}),
  sequence.extend({type: z.literal("sequence"), pattern: z.boolean().optional(), cancelLanding: z.boolean().optional()}),
  z.object({type: z.literal("extend"), leg: z.enum(["upwind", "downwind"])}),
  z.object({type: z.literal("heading"), value: bounded(0, 360)}), z.object({type: z.literal("speed"), value: bounded(0, 600)}),
  z.object({type: z.literal("runway"), runway}), z.object({type: z.literal("frequency"), frequency: frequency.nullable(), whenReady: z.boolean().optional(), from: frequency.optional()}),
  z.object({type: z.literal("outcome"), outcome: z.enum(["full-stop", "touch-and-go"])})]).refine(c => c.type !== "radio" || c.message !== "misc" || !!c.text?.trim(), {message: "Misc messages require text."}).refine(c => c.type !== "radar-speed" || validRadarSpeed(c), {message: "Choose a listed speed instruction."});
}
export const instructionSchema = makeInstructionSchema();
const savedInstructionSchema = makeInstructionSchema(true);

const action = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("auto-readback"), enabled: z.boolean()}),
  z.object({kind: z.literal("all-full-stop")}),
  z.object({kind: z.literal("report-position"), aircraftId: id}),
  z.object({kind: z.enum(["play", "pause", "reset"])}), z.object({kind: z.literal("spawn"), aircraft: aircraftSchema}),
  z.object({kind: z.literal("edit"), aircraftId: id, patch: aircraftSchema.omit({routeNavigation: true, starDescent: true, reportAirportInSight: true, speedInstruction: true, expedited: true, followGroundId: true, atcManeuver: true, backTaxi: true, bankAngle: true, id: true, pending: true, trail: true, mode: true, leg: true, extended: true, releasedHold: true, lastRunway: true, sequence: true, circuit: true, patternFinalDistance: true, contactTowerAtHold: true, towerCheckInPending: true, giveWay: true, groundYield: true, automaticRequest: true, parkingAfterContact: true, transitionOverheadArmed: true, departureRunway: true, takeoffPattern: true, arrivalExit: true, arrivalRequest: true, lineupWait: true, transitionAltitude: true, leavingCircuit: true, runwayExit: true, goAroundRunwayHeading: true, selfGoAroundPending: true, clearedForOption: true}).partial().strict()}),
  z.object({kind: z.literal("remove"), aircraftId: id}), z.object({kind: z.literal("read"), aircraftId: id, frequency: frequency.optional()}), z.object({kind: z.literal("atis"), draft: atis}), z.object({kind: z.literal("publish-atis")}),
  z.object({kind: z.literal("taxi-path"), aircraftId: id, path: z.array(taxiPoint).min(1).max(MAX_TAXI_POINTS), edit: z.object({kind: z.enum(["insert", "move"]), index: bounded(0, MAX_TAXI_POINTS - 1).int(), point})}),
  z.object({kind: z.literal("pilot"), aircraftId: id, text, replyTo: id.optional(), assign: z.boolean().optional(), request: pilotRequest.optional()}),
  z.object({kind: z.literal("command"), aircraftId: id, command: instructionSchema, frequency, text, replyTo: id.optional(), resendOf: id.optional()}),
  z.object({kind: z.literal("maneuver"), aircraftId: id, command: instructionSchema})]);

export const envelopeSchema = z.object({id, time: bounded(0, 1e15), action});

const exerciseObject = z.object({schema: z.union([z.literal(1), z.literal(2)]), airport: z.enum(AIRPORT_IDS).optional(), airportDataVersion: z.string().max(100).optional(), trainingStation: z.string().max(100).optional(), id, revision: bounded(0, 1e12).int(), elapsed: bounded(0, 1e12), running: z.boolean(), pausedByStaff: z.boolean().optional(),
  autoReadback: z.boolean().optional(),
  bookmarks: z.array(z.object({id, elapsed: bounded(0, 1e12), aircraftId: id, label: z.string().max(256)})).max(1000).optional(),
  radarEnvironment: radarEnvironmentSchema.optional(),
  collisions: z.array(z.object({id, elapsed: bounded(0, 1e12), aircraft: z.array(z.object({id, callsign: z.string().min(1).max(80)})).min(2).max(50), position: point})).max(300).optional(),
  aircraft: z.array(aircraftSchema).max(50), messages: z.array(z.object({id, aircraftId: id, time: bounded(0, 1e15), frequency, sender: z.enum(["controller", "pilot"]), text, unableReason: z.string().max(1000).optional(), commandId: id.optional(), instruction: savedInstructionSchema.optional(), read: z.boolean().optional(), autoReadbackAt: bounded(0, 1e12).optional(), replyTo: id.optional(), retractedBy: id.optional(), acknowledged: z.boolean().optional(), clearanceCircuit: bounded(0, 1e12).int().optional(), request: pilotRequest.optional(), requestCircuit: bounded(0, 1e12).int().optional()})).max(300),
  processed: z.array(id).max(512), atis, publishedAtis: z.string().max(20000), publishedDraft: atis.nullable()});
// Motion frames omit immutable message/history data; full snapshots remain the recovery format.

export const exerciseSchema = exerciseObject.superRefine((value, ctx) => {
  try {
    if (value.schema === 2 && (!value.airport || !value.airportDataVersion || !value.trainingStation)) throw new Error("Airport and training frequency are required.");
    if (value.schema === 1 && value.airport && value.airport !== "EGPH") throw new Error("Legacy exercises use EGPH.");
    const airport = getAirport(value); trainingStation(value);
    const error = runwayReferenceError(value, airport); if (error) throw new Error(error);
    const mode = trainingMode(value);
    if (mode !== "local" && value.aircraft.some(a => !a.radar || a.radar.station !== mode || a.mode !== "heading")) throw new Error("Radar exercises require matching airborne radar traffic.");
    if (mode === "local" && value.aircraft.some(a => a.radar)) throw new Error("Ground & Tower traffic cannot use radar guidance.");
    if (mode !== "local") {
      const environment = value.radarEnvironment ?? radarEnvironmentFor(airport);
      for (const a of value.aircraft) {
        for (const id of [a.radar?.expected, a.radar?.cleared]) if (id && !environment.approaches.some(p => p.id === id)) throw new Error("Aircraft approach is missing from the training environment.");
        if (a.radar?.cleared && a.radar.cleared !== a.radar.expected) throw new Error("Approach clearance must match the expected approach.");
      }
    }
  } catch (reason) {ctx.addIssue({code: z.ZodIssueCode.custom, message: (reason as Error).message});}
});
export const motionSchema = exerciseObject.pick({id: true, revision: true, elapsed: true, aircraft: true, running: true, collisions: true});

export function menteeActionAllowed(value: z.infer<typeof action>, exercise?: Exercise) {
  if (value.kind === "command" && exercise && trainingMode(exercise) !== "local") {
    const station = trainingMode(exercise);
    return value.frequency === station && exercise.aircraft.some(a => a.id === value.aircraftId && a.radar?.station === station && a.frequency === station && !a.radar.transferred) && ["vector", "expect-approach", "missed-approach", "route", "speed", "radar-speed", "frequency", "radio", "atc"].includes(value.command.type);
  }
  if (value.kind === "command" && ["vector", "expect-approach", "missed-approach", "route"].includes(value.command.type)) return false;
  if (value.kind === "command" && ["heading", "speed", "runway", "outcome"].includes(value.command.type)) return false;
  if (["command", "read", "atis", "publish-atis"].includes(value.kind)) return true;
  return value.kind === "edit" && Object.keys(value.patch).every(key => ["color", "tag", "tagAngle", "reminderAt"].includes(key));
}
