import type {Aircraft, Instruction} from "./model";

/** Clearances belong to the controller's strip as soon as sent. Pilot targets
 * remain separate so a delayed readback cannot make the aircraft move early. */
export interface ControllerAssignments {
  airportIcao?: string;
  runway?: string; altitude?: import("./model").Altitude; altitudeFrom?: number;
  heading?: number; expected?: string | null; cleared?: string | null; vectors?: boolean; landing?: boolean;
  speed?: import("./model").RadarSpeedInstruction | null;
}
export function recordControllerAssignment(a: Aircraft, c: Instruction, environment?: import("./model").RadarEnvironment) {
  const assigned = {...a.assigned};
  const approach=c.type==="expect-approach" || c.type==="vector" ? environment?.approaches.find(p=>p.id===c.approachId):undefined;
  if(approach){assigned.runway=approach.runway;if(approach.airportIcao)assigned.airportIcao=approach.airportIcao;else delete assigned.airportIcao;}
  if ("runway" in c && c.runway && ["taxi", "lineup", "takeoff", "land", "pattern", "runway", "expect-approach"].includes(c.type)) assigned.runway = c.runway;
  if ((c.type === "vector" || c.type === "route" || c.type === "missed-approach") && c.altitude) {assigned.altitude = {...c.altitude}; assigned.altitudeFrom = a.altitude;}
  if ((c.type === "vector" || c.type === "missed-approach") && c.heading !== undefined) assigned.heading = c.heading;
  if (c.type === "expect-approach") {assigned.expected = c.approachId; assigned.cleared = null; assigned.vectors = !!c.vectors;}
  if (c.type === "vector" && c.approachId) assigned.cleared = c.approachId;
  if (c.type === "radar-speed") assigned.speed = c.mode === "discretion" ? null : {...c};
  if (c.type === "land") assigned.landing = true;
  if (["cancel-landing","go-around","missed-approach","takeoff"].includes(c.type)) assigned.landing = false;
  if (c.type === "missed-approach" || c.type === "route" || c.type === "vector" && c.heading !== undefined && !c.approachId || c.type === "atc" && ["navigation","hold"].includes(c.action)) assigned.cleared = null;
  if (c.type === "atc" && c.action === "hold" && c.altitude) {assigned.altitude = {...c.altitude}; assigned.altitudeFrom = a.altitude;}
  if (Object.keys(assigned).length) a.assigned = assigned;
}
export function controllerAircraft(a: Aircraft): Aircraft {
  const c = a.assigned;
  if (!c) return a;
  return {...a, runway: c.runway ?? a.runway, clearedToLand:c.landing ?? a.clearedToLand, ...(a.radar ? {radar: {...a.radar,
    ...(Object.hasOwn(c, "expected") ? {expected: c.expected ?? undefined} : {}),
    ...(Object.hasOwn(c, "cleared") ? {cleared: c.cleared ?? undefined} : {}),
    ...(Object.hasOwn(c,"vectors") ? {guidance:c.vectors?"vectors" as const:undefined}:{}),
    ...(c.altitude ? {targetAltitude: c.altitude, altitudeAssignedFrom: c.altitudeFrom} : {}),
  }} : {})};
}
