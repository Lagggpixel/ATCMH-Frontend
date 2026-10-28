import type {ReferenceInstruction, AtcManeuver} from "./reference-commands";
export const MAX_AIRCRAFT = 100;
export const MAX_TAXI_POINTS = 600;
export const ILS_CAPTURE_DISTANCE_NM = 25;
export type Frequency = "ground" | "tower" | "atis" | "approach" | "center" | "departure" | "unicom";
export type Altitude = {unit: "feet" | "flight-level"; value: number};
export type ApproachType = "ils" | "gps" | "visual";
export interface RadarSpeedInstruction {type: "radar-speed"; mode: "maintain" | "approach" | "discretion" | "slowest" | "best-forward" | "follow" | "present"; unit?: "knots" | "mach"; value?: number; relation?: "exact" | "minimum" | "maximum"; until?: number}
/** missedHeading is a true course, preserving existing scenario geometry. */
export interface RadarApproach {glideslope?:boolean;airportIcao?: string; airportName?: string; elevation?: number; threshold?: Point; departure?: Point; id: string; type: ApproachType; runway: string; finalDistance: number; captureWidth: number; glideAngle: number; missedHeading: number}
export interface RadarEnvironment {controllerPositions?: import("./positions").PositionPresence[]; facilityDefaultActive?: boolean; facilityActivity?: Record<string,boolean>; facilities?: import("./aviation").RadioFacility[]; airportName?: string; version: 1; name: string; range: number; boundary: Point[]; fixes: {id: string; point: Point; waypointType?:string; vorType?:string; slavedVariation?:number}[]; approaches: RadarApproach[]}
export interface RadarState {station: "approach" | "center"; navigation: "heading" | "route" | "approach" | "missed"; routeIndex: number; expected?: string; cleared?: string; captured?: boolean; localizer?: boolean; glideslope?: boolean; clearanceAltitudeChecked?: boolean; missedReason?: string; missedApproach?: boolean; localizerIntercept?: {along: number; lateral: number; angle: number}; targetAltitude?: Altitude; altitudeFromRoute?: boolean; altitudeAssignedFrom?: number; speed?: RadarSpeedInstruction; guidance?: "vectors"; transferred?: boolean; report?: "check-in" | "missed" | "intentions" | "approach-request" | "touch-and-go";
  approachIntercept?: {seconds: number; entered: boolean};
  gpsApproach?: {fafIndex: number; joined: boolean; point: Point; index: number; vectorHeading?: number};
  climbUntilAssigned?: boolean; // Continue departure climb until an altitude is assigned.
  inboundSpeed?: number; // Initial/profile speed, separate from a persistent ATC instruction.
  finalSpeedProfile?: boolean; // A distance-limited speed has released on aligned final.
  routeSpeed?: number;
  returningToApproach?: boolean;
  flight?: "departure" | "return"; requestedApproach?: string; departureDirection?: Direction;
  departure?: {runway: Runway; phase: "roll" | "climb"; touchAndGo?: boolean};
  arrival?: {runway: Runway; phase: "rollout" | "stopped" | "vacating" | "vacated"};
  patternJoin?: {status: "joining" | "established" | "unable"; reason?: string; notified?: boolean};
}
/** The exercise station stays pinned; touch-and-go returns are worked on Approach. */
export const radarControlFrequency = (a: Pick<Aircraft, "radar">) => a.radar?.returningToApproach ? "approach" : a.radar?.station;
export type Point = {x: number; y: number}; // Nautical miles east/north of the airport.
/** Published hold courses use true north, like the simulator's local map geometry. */
export interface PublishedHold {inbound: number; hand: "left" | "right"; maxSpeed?: number; legSeconds?: number}
export type RoutePoint = Point & {altitude?: number; speed?: number; fixId?: string; name?: string; waypointType?: string; vorType?: string; slavedVariation?: number; hold?: PublishedHold; finalApproachFix?: boolean; procedure?: RouteProcedure};
/** Marks fixes added together from one published procedure; `key` tells two copies of the same procedure apart. */
export type RouteProcedure = {key: string; type: "SID" | "STAR" | "Approach"; name: string; transition?: string};
export type TrailPoint = Point & {time?: number}; // Exercise seconds; absent only in legacy snapshots.
export type Runway = string; // Validated against the exercise's pinned airport at API boundaries.
export type Leg = "upwind" | "crosswind" | "downwind" | "base" | "final";
export type SpeedPhase = "inbound" | "upwind-downwind" | "base" | "final" | "vref";
export type SpeedTargets = Partial<Record<SpeedPhase, number | null>>;
export const SPEED_PHASES: {id: SpeedPhase; label: string; defaultTarget: number}[] = [
  {id: "inbound", label: "Inbound", defaultTarget: 250},
  {id: "upwind-downwind", label: "Upwind / Downwind / Crosswind", defaultTarget: 220},
  {id: "base", label: "Base", defaultTarget: 180},
  {id: "final", label: "Final", defaultTarget: 160},
  {id: "vref", label: "Vref", defaultTarget: 135},
];
export type Mode = "parked" | "pushback" | "taxi" | "lineup" | "takeoff" | "go-around" | "pattern" | "heading" | "rollout";
export interface TrafficSequence {number: number; traffic?: string; followingId?: string; departure?: boolean; runway?: Runway; circuit?: number; followingCircuit?: number}
export type TaxiPoint = Point & {hold?: boolean; runway?: Runway; name?: string};
export type GroundRouteDestination = {type: "point" | "runway" | "parking"; id?: string};
export interface GroundRoute {airport: string; kind: "taxi" | "pushback"; controls: Point[]; destination: GroundRouteDestination; points: TaxiPoint[]; controlIndices: number[]}
/** call: what an airborne aircraft first asks Tower for (default inbound per its landing). afterTransition: what a transiting aircraft does overhead. */
export interface Intentions {flight: "pattern" | "departure"; taxi: "runway" | "parking"; parkingStand?: string; call?: "inbound" | "transition" | "quiet"; afterTransition: "continue" | "touch-and-go" | "land"; overheadRadius?: number}
export const intentionsOf = (a: Pick<Aircraft, "intentions">): Intentions => ({flight: "pattern", taxi: "runway", afterTransition: "continue", ...a.intentions});
export interface Airport {
  icao: string; name: string; elevation: number; sourceDate: string;
  origin: {lat: number; lon: number}; osmAttribution: string;
  runway: {lengthFeet: number; ends: {id: string; heading: number; point: Point}[]};
  runways?: {id: string; lengthFeet: number; widthFeet?: number; exitClearanceFeet?: number; taxiHoldClearanceFeet?: number; ends: {id: string; heading: number; point: Point}[]}[];
  dataVersion?: string;
  features: {id: string; kind: string; name: string; points: Point[]}[];
}
export interface Aircraft {
  originDeparture?: {icao: string; runway: string; elevation: number; threshold: Point; departure: Point; phase: "roll" | "climb" | "overhead" | "directed" | "complete"; callPending?: boolean};
  positionId?: string;
  performanceProfile?: "C172" | "C208" | "TBM9" | "DH8D" | "A320" | "B738" | "B77W"; groundSpeed?: number; track?: number; verticalSpeed?: number; facilityId?: string; flightSeconds?: number;
  fuel?: {state: "unknown" | "normal" | "minimum" | "emergency"; enduranceMinutes: number; declared?: "minimum" | "emergency"};
  assigned?: import("./controller-state").ControllerAssignments;
  groundReady?: boolean;
  enginesRunning?: boolean; // Optional simulated engine state; legacy scenarios use ground readiness.
  conflictMotion?: import("./training-conflicts").ConflictMotion;
  conflictRequest?: PilotRequestSelection;
  navigationSource?: {revision: string; procedureId?: string; routeId?: string};
  id: string; callsign: string; type: string; position: Point;
  /** True headings for map motion and saved snapshots; controller headings are magnetic. */
  heading: number; targetHeading: number; speed: number; targetSpeed: number; altitude: number;
  bankAngle?: number; // Signed degrees, positive right; absent legacy state is wings level.
  speedMode?: "auto" | "manual"; // IAS profile by default; explicit trainer overrides persist across legs.
  speedTargets?: SpeedTargets; // Filled phases hold a fixed IAS; null/absent phases use automatic defaults.
  frequency: Frequency | null; runway: Runway | null; lastRunway: Runway | null;
  hand: "left" | "right"; leg: Leg; mode: Mode; extended: boolean;
  landing: "full-stop" | "touch-and-go"; clearedToLand: boolean;
  clearedForOption?: boolean;
  goAroundRunwayHeading?: boolean;
  selfGoAroundPending?: boolean; // Authoritative tick emits this announcement once.
  taxiPath: TaxiPoint[]; taxiIndex: number; holding: boolean; releasedHold: number | null;
  contactTowerAtHold?: boolean; towerCheckInPending?: boolean; // Deferred Contact Tower when ready; absent in legacy snapshots.
  requestedPatternDeparture?: boolean; // The pilot's actual departure request on this frequency.
  intentions?: Intentions;
  giveWay?: {aircraftId: string; description: string};
  groundYield?: {aircraftId: string; point: Point};
  automaticRequest?: "taxi" | "departure" | "inbound-option" | "inbound-land" | "transition";
  parkingAfterContact?: boolean;
  transitionOverheadArmed?: boolean;
  departureRunway?: Runway;
  takeoffPattern?: boolean;
  takeoffOutcome?: "rejected" | "overrun"; // Silent braking outcome; retained in motion, recovery and replay.
  lineupWait?: boolean; // Legacy lineups continue to takeoff unless explicitly waiting.
  transitionAltitude?: number; // Minimum altitude for a straight-through transition, feet MSL.
  leavingCircuit?: boolean; // Departures/transitions are not arrival sequencing targets.
  runwayExit?: TaxiPoint[]; // Mapped exit, entered after slowing on the runway.
  arrivalExit?: {instruction: "automatic" | "exit-runway" | "parking"; speed: 15 | 25 | 35; braking?: number; skippedExit?: boolean; followOn?: boolean};
  arrivalRequest?: "frequency-change" | "taxi-parking"; // Delivered once by the authoritative radio tick.
  flightPlan: RoutePoint[]; trail: TrailPoint[]; pending: number; active: boolean;
  /** Flight-label text color; independent of the aircraft symbol color. */
  color: string | null; tag: "auto" | "default" | "left" | "right"; tagAngle?: number;
  reminderAt: number | null;
  sequence?: TrafficSequence; optionHand?: "left" | "right"; circuit?: number;
  pushback?: {path: Point[]; index: number; pullFrom?: number; tail?: "north" | "east" | "south" | "west"};
  patternFinalDistance?: number; // Extended base/final geometry for this circuit, in NM.
  patternEntry?: "crosswind" | "downwind"; // Sequenced entry awaiting space while continuing upwind.
  radar?: RadarState;
  atcManeuver?: AtcManeuver;
  backTaxi?: {lineup: boolean; contactGround: boolean};
  arrivalProcedure?: string;
  destination?: {name: string; point: Point} | null;
  diversionDestination?: {name: string; point: Point} | null;
  routeNavigation?: {index: number; descending?: boolean};
  starDescent?: boolean;
  followRouteAltitudes?: boolean;
  reportAirportInSight?: boolean;
  airportSighting?: {target: string; seconds: number; terrain?: {position: Point; altitude: number; checkedAt: number; targetElevation?: number; status: "clear" | "blocked" | "unavailable"}};
  speedInstruction?: RadarSpeedInstruction;
  expedited?: boolean;
  followGroundId?: string;
}
export interface Message {
  positionId?: string; actorId?: string; actorName?: string;
  id: string; aircraftId: string; time: number; frequency: Frequency;
  sender: "controller" | "pilot"; text: string;
  unableReason?: string; // Mentor-only explanation; never part of the radio transmission.
  commandId?: string; instruction?: Instruction; read?: boolean;
  autoReadbackAt?: number; // Exercise seconds; freezes while paused.
  replyTo?: string; retractedBy?: string; // Controller reply / withdrawn controller transmission.
  clearanceCircuit?: number;
  acknowledged?: boolean; // Silent frequency-release acknowledgement.
  request?: PilotRequestSelection;
  requestCircuit?: number;
  demonstrated?: boolean; // Sent by the mentor while demonstrating from the controller seat.
}
export interface ExerciseWeather {windDirection: number; windSpeed: number; windGust?: number; variableWind?: boolean; visibilityKm: number; qnh: number; temperature?: number; dewpoint?: number; reference: string; observedAt?: string; rawMetar?: string; source?: string}
export interface Atis {
  frequencyAssignments?: {facilityId: string; directions: import("./atis-options").AtisDirection[]}[];
  weather?:ExerciseWeather;
  publicText?: string; publicSource?: string; observedAt?: string;
  letter: string; departures: Runway[]; arrivals: Runway[];
  expectations: string[]; remarks: string[]; notams: string[]; procedures: string[];
}
export interface Exercise {
  positions?: import("./positions").ControllerPosition[];
  positionFeedback?: Record<string, string>;
  positionPresence?: import("./positions").PositionPresence[];
  weather?: ExerciseWeather;
  conflicts?: import("./training-conflicts").TrainingConflict[];
  callsignReservations?: {id: string; callsign: string}[]; // Includes scheduled and previously removed traffic.
  schema: 1 | 2; airport?: string; airportDataVersion?: string; trainingStation?: string;
  id: string; revision: number; elapsed: number; running: boolean; pausedByStaff?: boolean; pauseVisibility?: "hidden" | "visible";
  // Staff, or a spectator who took over (`spectator`, held while `until` is renewed), hold the controller seat; the mentee watches a live mirror.
  demonstration?: {startedAt: number; by?: string; byId?: string; spectator?: boolean; until?: number; positionId?: string};
  autoReadback?: boolean;
  fullStopAll?: Record<string, Aircraft["landing"]>; // Landing intentions to restore when staff cancel All full stop.
  bookmarks?: {id: string; elapsed: number; aircraftId: string; label: string}[];
  radarEnvironment?: RadarEnvironment;
  terrainStatus?: "checking" | "available" | "unavailable";
  collisions?: {kind?: "aircraft" | "terrain"; id: string; elapsed: number; aircraft: {id: string; callsign: string}[]; position: Point}[];
  aircraft: Aircraft[]; messages: Message[]; processed: string[];
  atis: Atis; publishedAtis: string; publishedDraft: Atis | null;
}
export type Action =
  | {kind:"facilities";activity:Record<string,boolean>}
  | {kind: "all-full-stop"; enabled?: boolean}
  | {kind: "report-position"; aircraftId: string}
  | {kind: "weather"; weather: ExerciseWeather}
  | {kind: "conflict"; conflict: import("./training-conflicts").ConflictKind; aircraftId: string; otherId: string}
  | {kind: "cancel-conflict"; conflictId: string}
  | {kind: "play" | "reset"}
  | {kind: "pause"; visibility?: "hidden" | "visible"}
  | {kind: "auto-readback"; enabled: boolean}
  | {kind: "demonstrate"; enabled: boolean; positionId?: string}
  | {kind: "spawn"; aircraft: Aircraft}
  | {kind: "edit"; aircraftId: string; patch: Partial<Aircraft>}
  | {kind: "taxi-path"; aircraftId: string; path: TaxiPoint[]; edit: import("./taxi-path-editing").TaxiPathEdit}
  | {kind: "remove"; aircraftId: string}
  | {kind: "read"; aircraftId: string; frequency?: Frequency}
  | {kind: "atis"; draft: Atis}
  | {kind: "publish-atis"}
  | {kind: "pilot"; aircraftId: string; text: string; replyTo?: string; assign?: boolean; request?: PilotRequestSelection}
  | {kind: "command"; aircraftId: string; command: Instruction; frequency: Frequency; text: string; replyTo?: string; resendOf?: string}
  | {kind: "maneuver"; aircraftId: string; command: Instruction};
export type Instruction =
  | ReferenceInstruction
  | RadarSpeedInstruction
  | {type: "vector"; heading?: number; altitude?: Altitude; approachId?: string; standalone?: boolean; interceptAltitude?: number}
  | {type: "expect-approach"; approachId: string | null; vectors?: boolean; navigation?: "filed" | "vectors"; runway?: string}
  | {type: "missed-approach"; altitude: Altitude; heading?: number; fromAltitude?: number}
  | {type: "route"; index: number; altitude?: Altitude; name?: string; point?: Point}
  | {type: "radio"; message: "say-intentions" | "standby" | "correction-standby" | "disregard" | "unable" | "misc" | "roger" | "wilco"; text?: string}
  | {type: "transition"; altitude: number}
  | {type: "departure"; direction: "north" | "east" | "south" | "west"}
  | {type: "exit-runway"; side: "left" | "right" | "any"; expedite?: boolean; traffic?: "final" | "base"; crossRunway?: string; holdShort?: string}
  | {type: "lineup"; runway?: Runway}
  | {type: "pushback"; route?: GroundRoute; tail?: "north" | "east" | "south" | "west"; runway?: string}
  | {type: "give-way"; aircraftId?: string; description: string}
  | {type: "taxi"; route?: GroundRoute; runway?: Runway; destination?: "runway" | "parking" | "continue"; contactTowerWhenReady?: boolean}
  | {type: "takeoff"; hand?: "left" | "right"; runway?: Runway; immediate?: boolean; straightOut?: number; unablePattern?: boolean}
  | {type: "stop"}
  | {type: "hold-short" | "cross"; runway?: Runway; expedite?: boolean; ground?: boolean; departure?: boolean}
  | {type: "land"; runway?: Runway; hand?: "left" | "right"; option?: boolean; number?: number; followingId?: string}
  | {type: "go-around"; hand?: "left" | "right"; runway?: Runway; runwayHeading?: boolean; response?: boolean}
  | {type: "cancel-landing"}
  | {type: "pattern"; leg: Leg; hand?: "left" | "right"; runway?: Runway; sequence?: TrafficSequence}
  | {type: "sequence"; number: number; traffic?: string; followingId?: string; departure?: boolean; pattern?: boolean; cancelLanding?: boolean}
  | {type: "extend"; leg: "upwind" | "downwind"}
  | {type: "heading" | "speed"; value: number}
  | {type: "runway"; runway: Runway}
  | {type: "frequency"; frequency: Frequency | null; facilityId?: string; facilityName?: string; mhz?: string; targetPositionId?: string; whenReady?: boolean; from?: Frequency}
  | {type: "outcome"; outcome: Aircraft["landing"]};
export interface Envelope {id: string; action: Action; time: number}
export type Direction = "north" | "east" | "south" | "west";
export interface PilotRequestSelection {id: import("./catalog").PilotRequestId; runway: Runway; direction?: Direction; takeoffDirection?: Direction | "Straight Out"; entry?: "Left Traffic" | "Right Traffic" | "Straight In"; remainingInPattern?: boolean; includeRunway?: boolean; inbound?: "default" | "runway" | "ils" | "gps" | "visual"; altitude?: Altitude; position?: "Right Downwind" | "Left Downwind" | "Right Base" | "Left Base" | "Final" | "Left Crosswind" | "Right Crosswind"; outcome?: "full-stop" | "touch-and-go"; confirmed?: boolean; approachId?: string; destination?: {name: string; point: Point}}
export const DEFAULTS = {airSpeed: 160, taxiSpeed: 20, patternHeight: 1500, patternWidth: 3, bankAngle: 25, bankRate: 6, acceleration: 3, climbRate: 2000, descentRate: 1500, rotationSpeed: 140, upwindLength: 1.5, finalLength: 4.5, radarSeconds: 30, trailInterval: .3, sequenceSeconds: 45, sequenceDistance: 3, minimumPatternSpeed: 80};
export const FREQUENCIES = {ground: {label: "Ground", value: "121.75"}, tower: {label: "Tower", value: "118.70"}, atis: {label: "ATIS", value: "131.35"}, approach: {label: "Approach", value: "Training"}, center: {label: "Center", value: "Training"}, departure: {label: "Departure", value: "Training"}, unicom: {label: "Unicom", value: "122.80"}};
export const EXERCISE_WEATHER = {windDirection: 240, windSpeed: 10, visibilityKm: 10, qnh: 1001, reference: "Exercise time 00:00 (fixed conditions)"} as const;
export const METAR = `Simulated EGPH · Wind ${EXERCISE_WEATHER.windDirection}° at ${EXERCISE_WEATHER.windSpeed}KT · Visibility ${EXERCISE_WEATHER.visibilityKm}km · QNH ${EXERCISE_WEATHER.qnh}`;
export const emptyAtis = (): Atis => ({letter: "ALPHA", departures: ["24"], arrivals: ["24"], expectations: [], remarks: [], notams: [], procedures: []});
export const aircraftColor = (aircraft: Aircraft, frequency: Frequency | "all") => ((frequency === "all" ? aircraft.frequency !== null && aircraft.frequency !== "atis" : aircraft.frequency === frequency) ? "#87cefa" : "#808080");
export const stripRunway = (aircraft: Aircraft) => aircraft.assigned?.runway ?? aircraft.runway ?? aircraft.lastRunway ?? "----";
export const unreadMessages = (exercise: Exercise, aircraftId: string, frequency?: Frequency) => exercise.messages.filter(m => m.aircraftId === aircraftId && m.sender === "pilot" && !m.commandId && m.read === false && (!frequency || m.frequency === frequency)).length;
/** Attention counts are separate from actionable requests: viewing a strip or
 * sending a message clears the flashes without discarding its reply context. */
export function pendingRequestCount(exercise: Exercise, aircraftId: string, frequency: Frequency): number {
  if (frequency === "atis" || frequency === "unicom") return 0;
  let count = 0;
  for (const message of exercise.messages) {
    if (message.aircraftId !== aircraftId || message.frequency !== frequency) continue;
    if (message.sender === "controller") {
      if (!(message.instruction?.type === "atc" && ["broadcast", "bookmark"].includes(message.instruction.action))) count = 0;
    } else if (message.read === false && !message.commandId && !message.acknowledged &&
      !["roger", "wilco", "unable", "standby", "excellent-service", "back-with-you"].includes(message.request?.id ?? "")) count++;
  }
  return count;
}
export function frequencyPendingRequests(exercise: Exercise): Record<Frequency, number> {
  const counts = {ground: 0, tower: 0, atis: 0, approach: 0, center: 0, departure: 0, unicom: 0};
  for (const a of exercise.aircraft) if (a.frequency) counts[a.frequency] += pendingRequestCount(exercise, a.id, a.frequency);
  return counts;
}
/** A reply to the latest command consumes its pending batch, never exposes older commands. */
export function commandHasReadback(c?: Instruction) {
  return c?.type !== "radio" && !(c?.type === "departure") && !(c?.type === "atc" && ["radar-contact", "deny-entry", "emergency", "broadcast", "guard", "bookmark", "report", "voice"].includes(c.action));
}

export function pendingCommands(exercise: Exercise, aircraftId: string): Message[] {
  const frequency = exercise.aircraft.find(a => a.id === aircraftId)?.frequency;
  const messages = exercise.messages.filter(m => m.aircraftId === aircraftId);
  const answered = new Set(messages.filter(m => m.sender === "pilot" && m.commandId).map(m => m.commandId));
  let cutoff = -1;
  for (let i = 0; i < messages.length; i++) if (messages[i].sender === "controller" && commandHasReadback(messages[i].instruction) && (answered.has(messages[i].id) || messages[i].retractedBy || messages[i].acknowledged)) cutoff = i;
  return messages.slice(cutoff + 1).filter(m => m.sender === "controller" && m.frequency === frequency && commandHasReadback(m.instruction));
}
/** Contextual controller replies target the latest unanswered pilot transmission. */
export function pendingPilotMessage(exercise: Exercise, aircraftId: string, frequency: Frequency): Message | undefined {
  for (const message of exercise.messages.filter(m => m.aircraftId === aircraftId && m.frequency === frequency).reverse()) {
    if (message.sender === "pilot") return message.commandId ? undefined : message;
    if (message.retractedBy) continue;
    if (message.instruction?.type === "atc" && ["broadcast", "guard", "bookmark", "voice", "report"].includes(message.instruction.action)) continue;
    if (message.instruction?.type === "radio" && ["standby", "correction-standby"].includes(message.instruction.message)) continue;
    return undefined;
  }
}
export const patternLegLabel = (a: Pick<Aircraft, "hand" | "leg">) => a.leg === "final" || a.leg === "upwind" ? a.leg : `${a.hand} ${a.leg}`;
export const aircraftTagVisible = (a: Aircraft, frequency: Frequency | "all", selected: string | null) => frequency === "all" || a.frequency === frequency || a.id === selected;
export function runwayWind(heading: number, direction: number = EXERCISE_WEATHER.windDirection): "headwind" | "crosswind" | "tailwind" {
  const angle = (direction - heading) * Math.PI / 180;
  const headwind = Math.cos(angle), crosswind = Math.abs(Math.sin(angle));
  return crosswind > Math.abs(headwind) ? "crosswind" : headwind >= 0 ? "headwind" : "tailwind";
}

/** Frequencies on which a transferred radar arrival completes its own landing. */
export const radarArrivalFrequency = (frequency: Frequency | null) => frequency === "tower" || frequency === "unicom" || frequency === null;
