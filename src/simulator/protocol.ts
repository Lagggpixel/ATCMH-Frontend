import {z} from "zod";
import {REQUEST_IDS} from "./catalog";
const bounded = (min: number, max: number) => z.number().finite().min(min).max(max);
const text = z.string().max(2000);
const id = z.string().min(1).max(100);
const frequency = z.enum(["ground", "tower", "atis"]);
const runway = z.enum(["06", "24"]);
const pilotRequest = z.object({id: z.enum(REQUEST_IDS), runway, direction: z.enum(["north", "east", "south", "west"]).optional(), remainingInPattern: z.boolean().optional(), includeRunway: z.boolean().optional()});
const point = z.object({x: bounded(-2000, 2000), y: bounded(-2000, 2000)});
const taxiPoint = point.extend({hold: z.boolean().optional()});
const hand = z.enum(["left", "right"]);
const phaseSpeed = bounded(1, 600).int().nullable().optional();

export const speedTargetsSchema = z.object({inbound: phaseSpeed, "upwind-downwind": phaseSpeed, base: phaseSpeed, final: phaseSpeed, vref: phaseSpeed}).strict();
const sequence = z.object({number: bounded(1, 8).int(), traffic: text.optional(), followingId: id.optional(), departure: z.boolean().optional(), runway: runway.optional(), circuit: bounded(0, 1e12).int().optional(), followingCircuit: bounded(0, 1e12).int().optional()});
const atis = z.object({letter: z.string().max(20), departures: z.array(runway).max(2), arrivals: z.array(runway).max(2), expectations: z.array(text).max(10), remarks: z.array(text).max(20), notams: z.array(text).max(10), procedures: z.array(text).max(30)});

export const intentionsSchema = z.object({flight: z.enum(["pattern", "departure"]), taxi: z.enum(["runway", "parking"]), parkingStand: id.optional(), afterTransition: z.enum(["continue", "touch-and-go"]), overheadRadius: bounded(.1, 5).optional()}).strict();

export const aircraftSchema = z.object({id, callsign: z.string().min(1).max(80), type: z.string().min(1).max(12), position: point,
  heading: bounded(0, 360), targetHeading: bounded(0, 360), speed: bounded(0, 600), targetSpeed: bounded(0, 600), altitude: bounded(0, 60000),
  speedMode: z.enum(["auto", "manual"]).optional(),
  speedTargets: speedTargetsSchema.optional(),
  frequency: frequency.nullable(), runway: runway.nullable(), lastRunway: runway.nullable(), hand: z.enum(["left", "right"]), leg: z.enum(["upwind", "crosswind", "downwind", "base", "final"]),
  mode: z.enum(["parked", "pushback", "taxi", "lineup", "takeoff", "go-around", "pattern", "heading", "rollout"]), extended: z.boolean(), landing: z.enum(["full-stop", "touch-and-go"]), clearedToLand: z.boolean(),
  clearedForOption: z.boolean().optional(), goAroundRunwayHeading: z.boolean().optional(), selfGoAroundPending: z.boolean().optional(),
  taxiPath: z.array(taxiPoint).max(200), taxiIndex: bounded(0, 200).int(), holding: z.boolean(), releasedHold: bounded(0, 200).int().nullable(),
  contactTowerAtHold: z.boolean().optional(),
  groundYield: z.object({aircraftId: id, point}).optional(),
  intentions: intentionsSchema.optional(), giveWay: z.object({aircraftId: id, description: z.string().min(1).max(150)}).optional(),
  automaticRequest: z.enum(["taxi", "departure", "inbound-option"]).optional(), parkingAfterContact: z.boolean().optional(), transitionOverheadArmed: z.boolean().optional(), departureRunway: runway.optional(), takeoffPattern: z.boolean().optional(),
  arrivalExit: z.object({instruction: z.enum(["automatic", "exit-runway", "parking"]), speed: z.union([z.literal(15), z.literal(35)])}).optional(),
  arrivalRequest: z.enum(["frequency-change", "taxi-parking"]).optional(),
  lineupWait: z.boolean().optional(), transitionAltitude: bounded(500, 10000).multipleOf(500).optional(), leavingCircuit: z.boolean().optional(), runwayExit: z.array(taxiPoint).min(2).max(200).optional(),
  flightPlan: z.array(point).max(200), trail: z.array(point.extend({time: bounded(0, 1e12).optional()})).max(120), pending: bounded(0, 100000).int(), active: z.boolean(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  tag: z.enum(["auto", "default", "left", "right"]), reminderAt: bounded(0, 1e12).nullable(), sequence: sequence.optional(), optionHand: hand.optional(), circuit: bounded(0, 1e12).int().optional(), patternFinalDistance: bounded(3, 2000).optional(), pushback: z.object({path: z.array(point).min(2).max(10), index: bounded(0, 10).int()}).optional()});

export const instructionSchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("radio"), message: z.enum(["say-intentions", "standby", "correction-standby", "disregard", "unable", "misc"]), text: z.string().min(1).max(300).optional()}),
  z.object({type: z.literal("transition"), altitude: bounded(500, 10000).multipleOf(500)}),
  z.object({type: z.literal("departure"), direction: z.enum(["north", "east", "south", "west"])}),
  z.object({type: z.literal("exit-runway"), side: z.enum(["left", "right", "any"]), expedite: z.boolean().optional(), traffic: z.enum(["final", "base"]).optional()}),
  z.object({type: z.literal("lineup"), runway: runway.optional()}),
  z.object({type: z.literal("pushback"), tail: z.enum(["north", "east", "south", "west"])}),
  z.object({type: z.literal("taxi"), runway: runway.optional(), destination: z.enum(["runway", "parking", "continue"]).optional()}),
  z.object({type: z.literal("takeoff"), hand: hand.optional(), runway: runway.optional()}),
  z.object({type: z.literal("give-way"), aircraftId: id, description: z.string().min(1).max(150)}),
  z.object({type: z.literal("stop")}),
  z.object({type: z.enum(["hold-short", "cross"]), runway: runway.optional()}),
  z.object({type: z.literal("land"), runway: runway.optional(), hand: hand.optional(), option: z.boolean().optional(), number: bounded(1, 8).int().optional(), followingId: id.optional()}),
  z.object({type: z.literal("go-around"), hand: hand.optional(), runway: runway.optional(), runwayHeading: z.boolean().optional()}),
  z.object({type: z.literal("cancel-landing")}),
  z.object({type: z.literal("pattern"), leg: z.enum(["upwind", "crosswind", "downwind", "base", "final"]), hand: hand.optional(), runway: runway.optional(), sequence: sequence.optional()}),
  sequence.extend({type: z.literal("sequence")}),
  z.object({type: z.literal("extend"), leg: z.enum(["upwind", "downwind"])}),
  z.object({type: z.literal("heading"), value: bounded(0, 360)}), z.object({type: z.literal("speed"), value: bounded(0, 600)}),
  z.object({type: z.literal("runway"), runway}), z.object({type: z.literal("frequency"), frequency: frequency.nullable(), whenReady: z.boolean().optional()}),
  z.object({type: z.literal("outcome"), outcome: z.enum(["full-stop", "touch-and-go"])})]).refine(c => c.type !== "radio" || c.message !== "misc" || !!c.text?.trim(), {message: "Misc messages require text."});
const action = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("auto-readback"), enabled: z.boolean()}),
  z.object({kind: z.enum(["play", "pause", "reset"])}), z.object({kind: z.literal("spawn"), aircraft: aircraftSchema}),
  z.object({kind: z.literal("edit"), aircraftId: id, patch: aircraftSchema.omit({id: true, pending: true, trail: true, mode: true, leg: true, extended: true, releasedHold: true, lastRunway: true, sequence: true, circuit: true, patternFinalDistance: true, contactTowerAtHold: true, giveWay: true, groundYield: true, automaticRequest: true, parkingAfterContact: true, transitionOverheadArmed: true, departureRunway: true, takeoffPattern: true, arrivalExit: true, arrivalRequest: true, lineupWait: true, transitionAltitude: true, leavingCircuit: true, runwayExit: true, goAroundRunwayHeading: true, selfGoAroundPending: true, clearedForOption: true}).partial().strict()}),
  z.object({kind: z.literal("remove"), aircraftId: id}), z.object({kind: z.literal("read"), aircraftId: id, frequency: frequency.optional()}), z.object({kind: z.literal("atis"), draft: atis}), z.object({kind: z.literal("publish-atis")}),
  z.object({kind: z.literal("taxi-path"), aircraftId: id, path: z.array(taxiPoint).min(1).max(200), edit: z.object({kind: z.enum(["insert", "move"]), index: bounded(0, 199).int(), point})}),
  z.object({kind: z.literal("pilot"), aircraftId: id, text, replyTo: id.optional(), assign: z.boolean().optional(), request: pilotRequest.optional()}),
  z.object({kind: z.literal("command"), aircraftId: id, command: instructionSchema, frequency, text, replyTo: id.optional()}),
  z.object({kind: z.literal("maneuver"), aircraftId: id, command: instructionSchema})]);

export const envelopeSchema = z.object({id, time: bounded(0, 1e15), action});

export const exerciseSchema = z.object({schema: z.literal(1), id, revision: bounded(0, 1e12).int(), elapsed: bounded(0, 1e12), running: z.boolean(), pausedByStaff: z.boolean().optional(),
  autoReadback: z.boolean().optional(),
  aircraft: z.array(aircraftSchema).max(50), messages: z.array(z.object({id, aircraftId: id, time: bounded(0, 1e15), frequency, sender: z.enum(["controller", "pilot"]), text, commandId: id.optional(), instruction: instructionSchema.optional(), read: z.boolean().optional(), autoReadbackAt: bounded(0, 1e12).optional(), replyTo: id.optional(), retractedBy: id.optional(), acknowledged: z.boolean().optional(), clearanceCircuit: bounded(0, 1e12).int().optional(), request: pilotRequest.optional(), requestCircuit: bounded(0, 1e12).int().optional()})).max(300),
  processed: z.array(id).max(512), atis, publishedAtis: z.string().max(20000), publishedDraft: atis.nullable()});
// Motion frames omit immutable message/history data; full snapshots remain the recovery format.

export const motionSchema = exerciseSchema.pick({id: true, revision: true, elapsed: true, aircraft: true, running: true});

export function menteeActionAllowed(value: z.infer<typeof action>) {
  if (value.kind === "command" && ["heading", "speed", "runway", "outcome"].includes(value.command.type)) return false;
  if (["command", "read", "atis", "publish-atis"].includes(value.kind)) return true;
  return value.kind === "edit" && Object.keys(value.patch).every(key => ["color", "tag", "reminderAt"].includes(key));
}
