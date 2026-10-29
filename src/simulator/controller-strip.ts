import {arrivalProcedureName} from "./arrival-procedure";
import {controllerAircraft} from "./controller-state";
import {destinationCode} from "./aviation";
import {radarStripRunway} from "./radar";
import type {Aircraft, Airport, Message, RadarEnvironment} from "./model";

/** IF 26.4 FlightProgressStrip.NextWPT / AdditionalInfo, from saved structured
 * state and radio choices. Display only: never change aircraft guidance. */
export function controllerStripText(aircraft: Aircraft, airport: Airport, environment: RadarEnvironment, messages: readonly Message[] = []) {
  const a = controllerAircraft(aircraft), r = a.radar;
  const codeFor = (name?: string) => name && /^[A-Z0-9]{3,4}$/i.test(name) ? name.toUpperCase() : destinationCode(name ? {destination: {name, point: a.position}} : a, airport);
  let runway = radarStripRunway(a, environment);
  const approach = environment.approaches.find(p => p.id === (r?.cleared ?? r?.expected ?? r?.requestedApproach));
  let destination = a.assigned?.airportIcao ?? approach?.airportIcao ?? codeFor(a.destination?.name);
  let guidance: string = approach ? {ils: "ILS", gps: "GPS", visual: "VIS"}[approach.type] : r?.guidance === "vectors" ? "RV" : r?.patternJoin ? "LOC" : "";
  let holding = a.atcManeuver?.kind === "hold";
  const setApproach = (id: string | null | undefined) => {
    const p = environment.approaches.find(item => item.id === id);
    guidance = p ? {ils: "ILS", gps: "GPS", visual: "VIS"}[p.type] : "";
    if (p) {destination = p.airportIcao ?? airport.icao; runway = p.runway;}
  };
  for (const message of messages) {
    if (message.aircraftId !== a.id || message.retractedBy) continue;
    const request = message.sender === "pilot" ? message.request : undefined;
    if (request?.id === "request-approach") {
      if (request.approachId) {const previousRunway = runway; setApproach(request.approachId); runway = previousRunway;}
      else guidance = request.inbound === "ils" ? "ILS" : request.inbound === "gps" ? "GPS" : request.inbound === "visual" ? "VIS" : guidance;
      if (request.includeRunway) runway = request.runway;
    } else if (request?.id === "flight-following") guidance = "FF";
    else if (request?.id === "radar-vectors") guidance = "RV";
    const c = message.sender === "controller" ? message.instruction : undefined;
    if (!c) continue;
    if (c.type === "expect-approach") {setApproach(c.approachId); if (!c.approachId && c.vectors) guidance = "RV";}
    else if (c.type === "vector" && c.approachId) setApproach(c.approachId);
    else if (c.type === "missed-approach" || c.type === "go-around") {guidance = ""; holding = false;}
    else if ((c.type === "pattern" || c.type === "land") && !guidance) guidance = "LOC";
    else if (c.type === "atc") {
      if (c.action === "flight-following") guidance = "FF";
      if (c.action === "radar-vectors") guidance = c.variant === "deny" ? "" : "RV";
      if (c.action === "hold") holding = true;
      if (c.action === "exit-hold" || c.action === "navigation") holding = false;
      if ((c.action === "flight-following" || c.action === "radar-vectors") && c.name) destination = codeFor(c.name);
    }
    if ("runway" in c && c.runway) runway = c.runway;
  }
  // Native Local is concatenated directly; the other guidance codes use " - ".
  let additionalInfo = guidance === "LOC" ? `LOC${destination}` : guidance ? `${guidance} - ${destination}` : "";
  if (a.arrivalProcedure) additionalInfo = `${arrivalProcedureName(a.arrivalProcedure)} STAR - ${additionalInfo}`;
  if (holding) additionalInfo += additionalInfo ? " - HOLD" : "HOLD";
  return {runway, additionalInfo: additionalInfo || "----"};
}
