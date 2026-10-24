import {groundRouteText} from "./ground-route";
import {trueToMagnetic, magneticToTrue} from "./magnetic-headings";
import {acceleration} from "./aircraft-performance";
import type {Aircraft, Airport, Altitude, Frequency, Instruction, Point, RadarEnvironment} from "./model";
import {DEFAULTS} from "./model";
import {airportCallsign, getAirport, defaultRunway, frequenciesFor} from "./airports";
import {altitudeFeet, altitudeLabel, validAltitude} from "./radar";
import {backTaxiRoute, progressiveRoute} from "./command-ground";
import {assignDestination, courseDifference, courseTo, holdingLegSeconds, moveAltitude, resumeRoute} from "./command-navigation";
import {turnAircraft} from "./banked-turns";

export const REFERENCE_ACTIONS = ["progressive", "cancel-takeoff", "back-taxi", "circle", "hold", "exit-hold", "navigation", "flight-following", "radar-vectors", "radar-contact", "airport-in-sight", "star-descent", "star-response", "diversion", "expect-unable", "deny-entry", "emergency", "broadcast", "guard", "bookmark", "report", "voice"] as const;
export interface ReferenceInstruction {
  type: "atc"; action: typeof REFERENCE_ACTIONS[number]; variant?: string;
  runway?: string; hand?: "left" | "right"; altitude?: Altitude; index?: number;
  expedite?: boolean; contactGround?: boolean; lineup?: boolean; frequency?: Frequency;
  text?: string; name?: string; waypointType?:string; point?:Point; inbound?:number;
}
export interface AtcManeuver {
  kind: "circle" | "hold"; hand: "left" | "right"; remaining: number;
  heading: number; previousMode: Aircraft["mode"]; previousLeg: Aircraft["leg"];
  altitude: number; center?: Point; inbound?: number;
  published?: boolean; fixName?: string; maxSpeed?: number; legSeconds?: number;
  entryTrack?: number;
  phase?: "entry" | "turn-outbound" | "outbound" | "turn-inbound" | "inbound"; timer?: number; turnRemaining?: number;
}
export const altitudeWords = (a: Altitude) => a.unit === "feet" ? `${a.value} feet` : `flight level ${a.value}`;
const response = (text: string, callsign: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}, ${callsign}`;
const strip = (callsign: string, text: string) => (text.startsWith(`${callsign}, `) ? text.slice(callsign.length + 2) : text).replace(/\.$/, "");
export function referenceControllerText(a: Aircraft, c: ReferenceInstruction, airport: Airport, environment: RadarEnvironment): string {
  const runway = c.runway ?? a.runway ?? defaultRunway(airport), destination = c.name ?? airportCallsign(airport);
  const altitude = c.altitude ? altitudeLabel(c.altitude) : "", facility = frequenciesFor(airport)[c.frequency ?? a.frequency ?? "tower"];
  const point = c.point ?? (c.index === undefined ? undefined : a.flightPlan[c.index]);
  const waypoint = c.name ?? (point ? ("name" in point ? point.name as string : undefined) ?? environment.fixes.find(f => Math.hypot(f.point.x - point.x, f.point.y - point.y) < .001)?.id ?? `Waypoint ${c.index! + 1}` : undefined);
  const waypointType=c.waypointType ?? (point && "waypointType" in point ? point.waypointType as string : undefined) ?? (point && environment.fixes.find(f=>Math.hypot(f.point.x-point.x,f.point.y-point.y)<.001)?.waypointType);
  const waypointLabel=waypointType?`${waypoint} ${waypointType}`:waypoint;
  switch (c.action) {
    case "progressive": return ({expect: "expect progressive taxi instructions", left: "turn left next taxiway", right: "turn right next taxiway", straight: "continue straight ahead", reverse: "make 180", discretion: "continue taxi at your discretion", follow: "follow aircraft ahead", crossed: "you were already instructed to cross the runway", inbound: "continue inbound", descend: "descend to pattern altitude"} as Record<string, string>)[c.variant!] ?? "";
    case "cancel-takeoff": return "cancel takeoff clearance, hold position";
    case "back-taxi": return `back taxi runway ${runway}${c.contactGround ? ", contact ground when off the runway" : c.lineup ? ", line up and wait" : ""}${c.expedite ? ", please expedite" : ""}`;
    case "circle": return `make a ${c.hand} 360${c.variant === "spacing" ? " for spacing" : ""}`;
    case "hold": {
      const speed = altitudeFeet(c.altitude!) <= 6000 ? 200 : altitudeFeet(c.altitude!) <= 14000 ? 230 : 265;
      if (!point) return `hold present position at ${altitude}, ${c.hand === "left" ? "Left" : "Right"} Turns, do not exceed ${speed} knots`;
      const course = ((c.inbound ?? trueToMagnetic(courseTo(a.position,point),airport))+180)%360;
      const direction = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][Math.round(course / 45) % 8];
      return `cleared direct ${waypointLabel}, hold ${direction} of ${waypointLabel}, ${c.hand === "left" ? "Left" : "Right"} Turns, maintain ${altitude}, do not exceed ${speed} knots`;
    }
    case "exit-hold": return "exit the hold, continue as filed";
    case "navigation": return c.variant === "own" ? "resume own navigation" : "continue as filed";
    case "flight-following": return c.name ? `proceed on course to ${destination}` : "roger, proceed on course";
    case "radar-vectors": return c.variant === "deny" ? `unable at this time, proceed on course to ${destination}` : `expect vectors to ${destination}`;
    case "radar-contact": return `radar contact${c.variant === "request" ? ", say approach request" : ""}`;
    case "airport-in-sight": return "report airport in sight";
    case "star-descent": return `descend via ${c.name} arrival`;
    case "star-response": return c.variant === "approve" ? "proceed as requested" : c.variant === "unable" ? "unable, expect vectors" : "say approach request at destination";
    case "diversion": return c.variant === "deny" ? `unable to divert to ${destination}, please request a suitable airport` : `diversion approved, ${c.variant === "course" ? "proceed on course" : "expect vectors"} to ${destination}`;
    case "expect-unable": return c.variant === "coverage" ? "requested airport is outside of coverage area. Proceed on course" : c.variant === "airspace" ? "you are outside of my airspace. Proceed on course" : "unable to provide services to this airport at the moment. Proceed on course";
    case "deny-entry": return c.variant === "event" ? "an event is in progress, expect delays" : "due to heavy traffic, destination airport is not accepting incoming traffic at this time";
    case "emergency": return ({delay: "expect delay", divert: "expect delays, please divert to nearest practical airport", none: "expect no undue delay", copy: "copy emergency fuel", diversion: "copy emergency, please divert to nearest practical airport"} as Record<string, string>)[c.variant!] ?? "";
    case "broadcast": return c.text ?? "";
    case "guard": return `you're ${c.frequency === "approach" || c.frequency === "center" ? "in an active airspace" : "on an active airport"}, ${c.variant === "return" ? "please switch back to" : c.variant === "advisory" ? "be advised that" : "please contact"} ${facility.name}${c.variant === "advisory" ? " is available" : ""} on ${facility.value}${c.variant === "return" ? ", thank you" : ""}`;
    case "bookmark": return "";
    case "report": return "";
    case "voice": return c.text ?? "";
  }
}
/** Acknowledgements are defined per command, never by changing controller pronouns. */
export function pilotReadback(callsign: string, text: string, c?: Instruction): string {
  const phrase = strip(callsign, text), reply = (value: string) => response(value, callsign);
  if (!c) return reply(phrase);
  const runway = ("runway" in c ? c.runway : undefined) ?? phrase.match(/runway ([0-3][0-9][LRC]?)/i)?.[1] ?? "";
  switch (c.type) {
    case "taxi": return reply(c.route ? groundRouteText(c.route, getAirport({airport: c.route.airport}), true) : c.destination === "parking" ? "Taxi to parking" : c.runway ? `Taxi to runway ${runway}` : "Continue taxi");
    case "pushback": return reply(`Pushback approved${c.tail ? `, tail to the ${c.tail}` : ""}${c.runway ? `, runway ${c.runway}` : ""}`);
    case "stop": return reply("Holding position");
    case "hold-short": return reply(c.departure ? "Roger" : c.ground ? `Hold short of runway ${runway}` : `Holding short runway ${runway}`);
    case "cross": return reply(`Crossing runway ${runway}`);
    case "give-way": return reply(c.description.startsWith("aircraft exiting runway") ? `Give way to ${c.description}` : "Give way to aircraft");
    case "lineup": return reply(`Line up and wait runway ${runway}`);
    case "takeoff": return reply(`Cleared for takeoff, runway ${runway}`);
    case "land": return reply(`${c.number ? `Number ${c.number}, ` : ""}cleared ${c.option ? "for the option" : "to land"}, runway ${runway}`);
    case "go-around": return reply(c.response ? "Roger" : phrase.replace(/^go around/i, "Going around"));
    case "exit-runway": return reply("Wilco");
    case "sequence": return reply(c.departure ? "Roger" : c.pattern || c.cancelLanding ? phrase : `Number ${c.number}, behind the traffic on ${c.traffic?.toLowerCase() ?? "final"}`);
    case "pattern": {
      if (/^turn (base|crosswind)/i.test(phrase)) return reply(phrase.replace(/^turn /i, "Turning "));
      if (c.sequence) return reply(phrase.replace(/ runway /i, ", runway ").replace(/, number \d+, traffic to follow is on /i, ", behind the traffic on "));
      return reply(phrase);
    }
    case "extend": return reply(c.leg === "downwind" ? "You'll call my base" : "Extending upwind");
    case "transition": return reply(phrase.replace("at or above", "at"));
    case "frequency": return c.frequency === null ? `Frequency change approved ${callsign}, good day!` : reply(phrase.replace(/^contact /i, "Contacting "));
    case "expect-approach": return reply("Roger");
    case "missed-approach": return reply((c.fromAltitude !== undefined && Math.abs(altitudeFeet(c.altitude) - c.fromAltitude) < 50 ? phrase.replace(/(?:climb|descend) and maintain /i, "maintain ") : phrase).replace(/^execute missed approach/i, "Executing missed approach"));
    case "vector": return reply((c.standalone && /cleared ILS/.test(phrase) ? `maintain ${c.altitude ? altitudeLabel(c.altitude) : (c.interceptAltitude ?? 0) >= 18000 ? `FL${Math.round(c.interceptAltitude! / 100)}` : c.interceptAltitude ?? 0} until established on the localizer, ${phrase}` : phrase).replace(/cleared (ILS|GPS) runway ([0-3][0-9][LRC]?) approach/i, "cleared $1 runway $2").replace(/cleared GPS approach runway/i, "cleared GPS runway").replace(/cleared visual approach runway/i, "cleared visual runway"));
    case "radar-speed": return reply(c.mode === "discretion" ? "Roger" : phrase);
    case "atc": {
      if (c.action === "progressive") return reply(({expect: "Roger", discretion: "Roger", follow: "Wilco", crossed: "Roger", left: "Left on the next taxiway", right: "Right on the next taxiway", straight: "Continuing ahead", reverse: "Making 180", inbound: "Continuing inbound", descend: "Descending to pattern altitude"} as Record<string, string>)[c.variant!] ?? phrase);
      if (c.action === "cancel-takeoff" || c.action === "airport-in-sight") return reply("Wilco");
      if (c.action === "back-taxi") return reply(phrase.replace(/, please expedite$/, ""));
      if (c.action === "circle") return reply(`Making a ${c.hand} 360`);
      if (c.action === "hold") return reply(c.index === undefined ? phrase.replace(/^hold /, "Holding ").replace(/, do not exceed \d+ knots$/, "") : `${phrase}, wilco`);
      if (c.action === "exit-hold") return reply("Exiting the hold, continuing as filed");
      if (c.action === "flight-following") return reply("Proceed on course");
      if (["radar-vectors", "diversion", "expect-unable"].includes(c.action)) return reply("Roger");
      if (c.action === "star-descent" || c.action === "star-response") return reply(c.action === "star-response" && c.variant === "request" ? "Stand by" : c.name && c.variant !== "unable" ? `Descending via ${c.name} arrival` : "Copy, expecting vectors");
      return reply(phrase);
    }
    default: return reply(phrase);
  }
}

export function referenceInstructionError(a: Aircraft, c: ReferenceInstruction, airport: Airport, traffic: Aircraft[] = []): string | null {
  const ground = a.altitude <= airport.elevation + 1;
  if ((c.action === "circle" || c.action === "hold") && !c.hand) return "Choose left or right turns.";
  if (c.runway && !(airport.runways ?? [airport.runway]).some(pair => pair.ends.some(end => end.id === c.runway))) return "Runway is not in this airport snapshot.";
  if (c.action === "hold" && c.altitude && (!validAltitude(c.altitude) || altitudeFeet(c.altitude) < 3000 || altitudeFeet(c.altitude) > 19000 || altitudeFeet(c.altitude) % 1000 !== 0)) return "Choose a listed holding altitude.";
  if (["cancel-takeoff", "back-taxi"].includes(c.action) && !ground) return "This instruction requires ground traffic.";
  if (["circle", "hold", "navigation", "exit-hold"].includes(c.action) && ground) return "This instruction requires airborne traffic.";
  if (c.action === "hold" && (!c.altitude || altitudeFeet(c.altitude) <= airport.elevation)) return "Choose a holding altitude above airport elevation.";
  if(c.action==="hold" && c.index!==undefined && c.point && a.flightPlan[c.index] && Math.hypot(c.point.x-a.flightPlan[c.index].x,c.point.y-a.flightPlan[c.index].y)>.000001)return "The selected holding waypoint has changed. Select it again.";
  if (c.index !== undefined && !a.flightPlan[c.index] && !(c.action === "hold" && c.point)) return "The selected flight-plan waypoint is no longer available.";
  if (c.action === "back-taxi") return backTaxiRoute(airport, a, c.runway ?? a.runway ?? defaultRunway(airport), !!c.contactGround).error ?? null;
  if (c.action === "progressive" && ["left", "right", "straight", "reverse", "discretion", "follow"].includes(c.variant!)) {
    if (!ground) return "This instruction requires ground traffic.";
    if (c.variant === "discretion" && a.taxiPath[a.taxiIndex]) return null;
    return progressiveRoute(airport, a, c.variant!, traffic).error ?? null;
  }
  if (c.action === "star-descent" || c.action === "star-response" && c.variant === "approve") {
    if (!a.arrivalProcedure) return "Choose an arrival STAR before approving STAR descent.";
  }
  if ((c.action === "star-descent" || c.action === "star-response" && c.variant === "approve") && a.flightPlan.some(p => p.altitude !== undefined && (p.altitude <= airport.elevation || !validAltitude(p.altitude >= 18000 ? {unit: "flight-level", value: p.altitude / 100} : {unit: "feet", value: p.altitude})))) return "Choose listed STAR altitudes above airport elevation.";
  if (c.action === "diversion" && c.variant !== "deny" && !a.diversionDestination) return "Choose a diversion destination in aircraft navigation setup.";
  if (c.action === "voice" && (c.text?.length ?? 0) > 256) return "Voice messages have a 256-character limit.";
  if (c.action === "voice" && !c.text?.trim()) return "Record or enter a message before sending.";
  return null;
}

export function assignReference(a: Aircraft, c: ReferenceInstruction, airport: Airport, traffic: Aircraft[] = []) {
  if (c.action === "cancel-takeoff") {a.mode = "taxi"; a.holding = true; a.targetSpeed = 0; a.lineupWait = true; delete a.expedited;}
  if (c.action === "back-taxi") {
    const runway = c.runway ?? a.runway ?? defaultRunway(airport), route = backTaxiRoute(airport, a, runway, !!c.contactGround);
    if (!route.path) return;
    a.runway = runway; a.mode = "taxi"; a.taxiPath = route.path; a.taxiIndex = 1; a.holding = false; a.expedited = !!c.expedite; a.targetSpeed = c.expedite ? 25 : DEFAULTS.taxiSpeed; a.backTaxi = {lineup: !!c.lineup, contactGround: !!c.contactGround};
    delete a.arrivalExit; delete a.runwayExit; delete a.contactTowerAtHold;
  }
  if (c.action === "circle" || c.action === "hold") {
    const point = c.point ?? (c.index === undefined ? {...a.position} : a.flightPlan[c.index]);
    if (c.action === "hold") {a.targetSpeed = Math.min(a.speed, altitudeFeet(c.altitude!) <= 6000 ? 200 : altitudeFeet(c.altitude!) <= 14000 ? 230 : 265); if (!a.radar) a.speedMode = "manual";}
    a.atcManeuver = {kind: c.action, hand: c.hand ?? "right", remaining: 360, heading: a.heading, previousMode: a.radar ? "heading" : a.mode, previousLeg: a.leg, altitude: c.altitude ? altitudeFeet(c.altitude) : a.altitude,
      ...(c.action === "hold" ? {center: {...point}, inbound: c.inbound===undefined ? c.index === undefined ? a.heading : courseTo(a.position, point) : magneticToTrue(c.inbound,airport), ...(c.name?{fixName:c.name}:{}), phase: c.index === undefined ? "turn-outbound" : "entry", timer: 0, turnRemaining: 180} : {})};
    if (a.radar) {a.mode = "heading"; if ("departure" in a.radar) delete a.radar.departure; if ("patternJoin" in a.radar) delete a.radar.patternJoin; a.radar.navigation = "heading"; a.radar.cleared = undefined; a.radar.captured = false; a.radar.localizer = false; if ("glideslope" in a.radar) a.radar.glideslope = false;}
  }
  if (c.action === "exit-hold" || c.action === "navigation" || c.action === "flight-following" || c.action === "expect-unable" || c.action === "radar-vectors" && c.variant === "deny") resumeRoute(a);
  if (["flight-following", "expect-unable"].includes(c.action) && !a.flightPlan.length) assignDestination(a, a.destination ?? {name: airportCallsign(airport), point: {x: 0, y: 0}}, false);
  if (c.action === "diversion" && c.variant !== "deny" && a.diversionDestination) assignDestination(a, a.diversionDestination, c.variant === "vectors");
  if (c.action === "airport-in-sight") {a.reportAirportInSight = true; delete a.airportSighting;}
  if (c.action === "star-descent" || c.action === "star-response" && c.variant === "approve") {resumeRoute(a); a.starDescent = true;}
  if (c.action === "progressive") {
    if (["left", "right", "straight", "reverse", "discretion", "follow"].includes(c.variant!)) {
      const route = c.variant === "discretion" && a.taxiPath[a.taxiIndex] ? {path: a.taxiPath.slice(a.taxiIndex), leader: undefined} : progressiveRoute(airport, a, c.variant!, traffic);
      if (!route.path) return;
      a.taxiPath = [{...a.position}, ...route.path]; a.taxiIndex = 1; a.releasedHold = null; a.mode = "taxi"; a.holding = false; a.targetSpeed = DEFAULTS.taxiSpeed;
      a.followGroundId = route.leader; delete a.giveWay; delete a.groundYield; delete a.contactTowerAtHold;
    } // "Already cleared to cross" is a reminder, not a new movement clearance.
    else if (c.variant === "descend") {a.mode = "pattern"; a.extended = false;}
  }
}
/** Timed racetrack legs and bank-limited 180-degree turns around the assigned fix. */
export function moveReference(a: Aircraft, dt: number): boolean {
  const m = a.atcManeuver;
  if (!m || !a.active) return false;
  if (m.kind === "hold") a.targetSpeed = Math.min(a.targetSpeed, m.maxSpeed ?? Infinity, m.altitude <= 6000 ? 200 : m.altitude <= 14000 ? 230 : 265);
  const sign = m.hand === "right" ? 1 : -1;
  if (m.kind === "circle") a.targetHeading = (a.heading + sign * Math.min(90, Math.max(0, m.remaining)) + 360) % 360;
  else {
    m.center ??= {...a.position}; m.inbound ??= m.heading; m.phase ??= "entry";
    if (m.phase === "entry" || m.phase === "inbound") {
      const delta = {x: a.position.x - m.center.x, y: a.position.y - m.center.y};
      const passed = delta.x * Math.sin(m.inbound * Math.PI / 180) + delta.y * Math.cos(m.inbound * Math.PI / 180) >= 0;
      if (Math.hypot(delta.x, delta.y) <= Math.max(.08, a.speed / 3600 * 2) || m.phase === "inbound" && passed) {
        if (m.published && m.phase === "entry") {
          const entryAngle = sign * courseDifference(m.inbound, a.heading);
          // The OCK STAR joins from the west: a teardrop keeps its entry on the holding side.
          if (entryAngle > 110) {m.entryTrack = (m.inbound + 180 - sign * 30 + 360) % 360;}
        }
        m.phase = "turn-outbound";
        m.turnRemaining = m.published ? ((m.entryTrack ?? m.inbound + 180) - a.heading) * sign % 360 + 360 : 180;
        if (m.published) m.turnRemaining %= 360;
      }
      else a.targetHeading = courseTo(a.position, m.center);
    }
    if (m.phase === "turn-outbound" || m.phase === "turn-inbound") {
      m.turnRemaining ??= 180;
      a.targetHeading = (a.heading + sign * Math.min(90, Math.max(0, m.turnRemaining)) + 360) % 360;
    } else if (m.phase === "outbound") {
      a.targetHeading = m.entryTrack ?? (m.inbound + 180) % 360;
      m.timer = (m.timer ?? 0) + dt;
      if (m.timer >= (m.legSeconds ?? holdingLegSeconds(m.altitude))) {
        m.phase = "turn-inbound";
        m.turnRemaining = m.published ? ((m.inbound - a.heading) * sign % 360 + 360) % 360 : 180;
        delete m.entryTrack;
      }
    }
  }
  const previous = a.heading;
  turnAircraft(a, dt);
  const turned = sign * courseDifference(previous, a.heading);
  if (m.kind === "circle") m.remaining -= turned;
  else if (m.phase === "turn-outbound" || m.phase === "turn-inbound") {
    m.turnRemaining = (m.turnRemaining ?? 180) - turned;
    if (m.turnRemaining <= .05 && Math.abs(a.bankAngle ?? 0) < .1) {m.phase = m.phase === "turn-outbound" ? "outbound" : "inbound"; m.timer = 0;}
  }
  a.speed += Math.sign(a.targetSpeed - a.speed) * Math.min(Math.abs(a.targetSpeed - a.speed), acceleration(a) * dt);
  const stride = a.speed / 3600 * dt;
  a.position = {x: a.position.x + Math.sin(a.heading * Math.PI / 180) * stride, y: a.position.y + Math.cos(a.heading * Math.PI / 180) * stride};
  moveAltitude(a, m.altitude, dt);
  if (m.kind === "circle" && m.remaining <= .05 && Math.abs(a.bankAngle ?? 0) < .1) {a.targetHeading = m.heading; a.mode = m.previousMode; a.leg = m.previousLeg; delete a.atcManeuver;}
  return true;
}
