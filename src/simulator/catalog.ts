import {groundRouteText} from "./ground-route";
import {orderedMenu} from "./menu-order";
import {ATIS_REMARKS} from "./atis-options";
import {approachOptions, destinationCode} from "./aviation";
import {altitudeFeet, altitudeLabel} from "./radar";
import {referenceControllerText} from "./reference-commands";
import {referenceMenu, referenceSpeedMenu} from "./reference-menu";
import {EXERCISE_WEATHER as DEFAULT_WEATHER, type ExerciseWeather, type Airport, type Aircraft, type Frequency, type Instruction, type Runway, type Direction, type Exercise, type Message, patternLegLabel} from "./model";
import {defaultAirport, defaultRunway, runwayEnds, airportCallsign, frequenciesFor} from "./airports";
import type {RadarEnvironment} from "./model";
import {checkInTransmission, radarEnvironmentFor, radarInstructionText, radarRequestedApproach, roundedHeadingInstruction} from "./radar";

export interface MenuEntry {id?: string; label: string; instruction?: Instruction; children?: MenuEntry[]; note?: string; suggested?: boolean; sendLabel?: "SEND" | "NOW"; input?: "heading" | "speed"; composeVector?: boolean; dialog?: "voice" | "report" | "bookmark"; resend?: boolean; requiresRequest?: string[]; replyOnly?: boolean}
export const HEADING_CHOICES = Array.from({length: 36}, (_, i) => (i + 1) * 10);
export function radarSpeedMenu(): MenuEntry[] {return referenceSpeedMenu();}
export const TASK_GROUPS = ["Ground movement", "Departures", "Arrivals and circuit", "Sequence", "Frequency"] as const;
export interface CommandTask {id: string; label: string; group: typeof TASK_GROUPS[number]; command: Instruction}
export const CONTEXT_ACTIONS = {messages: "Other Message", hold: "Hold", guard: "Send On Guard Warning", reminder: "Set Reminder", "remove-reminder": "Clear reminder", information: "Show Information", color: "Set Color", tag: "Tag Placement"} as const;
export type ContextAction = keyof typeof CONTEXT_ACTIONS;
export const REQUEST_IDS = ["pushback", "taxi-runway", "cross-runway", "frequency-change", "inbound-land", "inbound-option", "departure", "pattern-entry", "runway-change", "go-around", "departure-direction", "taxi-parking", "transition", "check-in", "request-approach", "missed-approach", "flight-following", "radar-vectors", "star-descent", "diversion", "minimum-fuel", "emergency-fuel", "airport-in-sight", "altitude-change", "report-position", "excellent-service", "back-with-you", "roger", "wilco", "standby", "unable", "correction", "unicom-taxi", "unicom-takeoff", "unicom-inbound", "unicom-position", "unicom-go-around", "unicom-clear-runway", "unicom-advisories", "unicom-cross-runway", "unicom-holding-short"] as const;
export type PilotRequestId = typeof REQUEST_IDS[number];
export interface PilotRequest {id: PilotRequestId; label: string; text: string; runway?: boolean; phase?: "ground" | "airborne"; legacyLabel: string}
export interface PilotRequestOptions {direction?: Direction; takeoffDirection?: Direction | "Straight Out"; entry?: "Left Traffic" | "Right Traffic" | "Straight In"; includeRunway?: boolean; inbound?: import("./model").PilotRequestSelection["inbound"]; altitude?: import("./model").Altitude; position?: string; outcome?: Aircraft["landing"]; approachId?: string; exercise?: Pick<Exercise, "publishedDraft" | "radarEnvironment">}
export const LETTERS = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET", "KILO", "LIMA", "MIKE", "NOVEMBER", "OSCAR", "PAPA", "QUEBEC", "ROMEO", "SIERRA", "TANGO", "UNIFORM", "VICTOR", "WHISKEY", "XRAY", "YANKEE", "ZULU"];
export const REMARKS = ATIS_REMARKS.map(option => option.label);
function createCatalog(airport: Airport, environment = radarEnvironmentFor(airport), weather: ExerciseWeather = DEFAULT_WEATHER) {
const wind = weather.windSpeed < 3 && (weather.windGust ?? 0) < 3 ? "wind calm" : `wind ${weather.windDirection} at ${weather.windSpeed}`;
const FREQUENCIES = frequenciesFor(airport);


function instructionText(a: Aircraft, instruction: Instruction, path: MenuEntry[] = []): string {
  environment={...environment,approaches:[...environment.approaches,...approachOptions(a,airport,environment.approaches).filter(p=>!environment.approaches.some(existing=>existing.id===p.id))]};
  instruction = roundedHeadingInstruction(instruction);
  const radarText = radarInstructionText(a, instruction, {...environment, airportName: airportCallsign(airport)}, airport);
  if (radarText !== undefined) return `${a.callsign}, ${radarText}`;
  const runway = ("runway" in instruction ? instruction.runway : undefined) ?? a.runway ?? defaultRunway(airport);
  let text: string;
  switch (instruction.type) {
    case "atc": text = referenceControllerText(a, instruction, airport, environment); break;
    case "radar-speed": case "vector": case "expect-approach": case "missed-approach": case "route": text = ""; break;
    case "radio": text = instruction.message === "misc" ? instruction.text ?? "" : {"say-intentions": "say intentions", standby: "stand by", "correction-standby": "correction, stand by", disregard: "disregard last message", unable: "unable", roger: "roger", wilco: "wilco"}[instruction.message]; break;
    case "transition": text = `Transition approved at or above ${instruction.altitude >= 18000 ? `flight level ${instruction.altitude / 100}` : `${instruction.altitude} feet`}`; break;
    case "departure": text = `departure to the ${instruction.direction} is approved`; break;
    case "lineup": text = `line up and wait runway ${runway}`; break;
    case "exit-runway": {
      const exit = instruction.side === "any" ? "exit runway when able" : `when able turn ${instruction.side}`;
      text = `${exit}${instruction.holdShort ? `, hold short runway ${instruction.holdShort}` : instruction.crossRunway ? `, cross runway ${instruction.crossRunway} and contact ground` : instruction.expedite ? " and contact ground" : ", contact ground on the taxiway"}${instruction.expedite ? ", please expedite" : ""}${instruction.traffic ? ", traffic on " + instruction.traffic : ""}`; break;
    }
    case "pushback": text = `pushback approved${instruction.tail ? `, tail to the ${instruction.tail}` : ""}${instruction.runway ? `, expect runway ${instruction.runway}` : ""}`; break;
    case "taxi": text = instruction.route ? groundRouteText(instruction.route, airport) : instruction.destination === "parking" ? "taxi to parking, at your discretion" : instruction.destination === "continue" || (!instruction.destination && !instruction.runway) ? "continue taxi" : `taxi to runway ${runway}${instruction.contactTowerWhenReady !== false ? ", contact tower when ready" : ""}`; break;
    case "give-way": text = `give way to ${instruction.description}`; break;
    case "stop": text = "hold position"; break;
    case "hold-short": text = `hold short of runway ${runway}`; break;
    case "cross": text = `cross runway ${runway}${instruction.expedite ? ", please expedite" : ""}`; break;
    case "takeoff": text = `${wind}, runway ${runway}, cleared for ${instruction.immediate ? "immediate " : ""}takeoff${instruction.hand ? `, make ${instruction.hand} traffic` : instruction.straightOut ? `${instruction.unablePattern ? ", unable pattern work" : ""}, fly runway heading until at or above ${instruction.straightOut} feet` : ""}`; break;
    case "land": text = `${wind}, ${instruction.number ? `number ${instruction.number}, ` : ""}runway ${runway}, cleared ${instruction.option ? "for the option" : "to land"}${instruction.option && instruction.hand ? `, after the option, make ${instruction.hand} traffic` : ""}`; break;
    case "sequence": text = instruction.departure ? `you're number ${instruction.number} for departure` : `${instruction.cancelLanding ? "cancel landing clearance, " : ""}number ${instruction.number}, traffic to follow is on ${instruction.traffic?.toLowerCase() ?? "final"}`; break;
    case "go-around": text = `${instruction.response ? "roger" : "go around"}, ${instruction.runwayHeading ? "fly runway heading" : `make ${instruction.hand ?? a.hand} traffic`} runway ${runway}`; break;
    case "cancel-landing": text = "cancel landing clearance"; break;
    case "pattern": text = path.find(entry => /^(Enter|Turn)/.test(entry.label))?.label.toLowerCase() ?? `enter ${instruction.leg === "final" ? "straight in" : `${instruction.hand ?? a.hand} ${instruction.leg}`}`; if (!path.length || path.some(entry => entry.label.startsWith("Runway"))) text += ` runway ${runway}`; if (instruction.sequence) text += `, number ${instruction.sequence.number}, traffic to follow is on ${instruction.sequence.traffic?.toLowerCase() ?? "final"}`; break;
    case "extend": text = instruction.leg === "downwind" ? "extend downwind, I'll call your base" : "extend upwind, I'll call your crosswind"; break;
    case "frequency": text = instruction.frequency ? `contact ${instruction.facilityName ?? FREQUENCIES[instruction.frequency].name}${(instruction.mhz ?? FREQUENCIES[instruction.frequency].value) === "Training" ? "" : " on " + (instruction.mhz ?? FREQUENCIES[instruction.frequency].value)}` : `${instruction.from === "approach" ? "radar services terminated, " : ""}frequency change approved, good day!`; break;
    case "heading": text = `fly heading ${instruction.value}`; break;
    case "speed": text = `maintain ${instruction.value} knots`; break;
    case "runway": text = `expect Runway ${instruction.runway}`; break;
    case "outcome": text = instruction.outcome === "full-stop" ? "make full stop" : "make touch and go"; break;
  }
  if (instruction.type === "frequency" && instruction.whenReady) text += ", when ready";
  return instruction.type === "atc" && instruction.action === "broadcast" ? `Attention all aircraft, ${text}` : `${a.callsign}, ${text}`;
}
/** Independent task controls. Only supported instructions are offered. */



function commandTasks(frequency: Frequency, a: Aircraft): CommandTask[] {
  if (frequency === "atis") return [];
  const runway = a.runway ?? defaultRunway(airport);
  const ground = a.altitude <= airport.elevation + 1;
  const tasks: CommandTask[] = ground ? [
    {id: "taxi", label: "Route to runway", group: "Ground movement", command: {type: "taxi", destination: "runway", runway}},
    {id: "continue", label: "Resume taxi route", group: "Ground movement", command: {type: "taxi", destination: "continue"}},
    {id: "parking", label: "Taxi to parking", group: "Ground movement", command: {type: "taxi", destination: "parking"}},
    {id: "stop", label: "Stop movement", group: "Ground movement", command: {type: "stop"}},
    {id: "hold-short", label: "Hold before runway", group: "Ground movement", command: {type: "hold-short", runway}},
    {id: "cross", label: "Cross a runway", group: "Ground movement", command: {type: "cross", runway}},
    {id: "pushback", label: "Approve pushback", group: "Ground movement", command: {type: "pushback", tail: "north"}},
  ] : [];
  if (frequency === "tower") tasks.push(...(ground ? [
    {id: "takeoff", label: "Departure clearance", group: "Departures", command: {type: "takeoff", runway, hand: a.hand}},
    {id: "departure-sequence", label: "Departure order", group: "Sequence", command: {type: "sequence", number: 2, departure: true}},
  ] as CommandTask[] : [
    {id: "land", label: "Landing clearance", group: "Arrivals and circuit", command: {type: "land", runway, number: 1, option: false}},
    {id: "pattern", label: "Join or turn in circuit", group: "Arrivals and circuit", command: {type: "pattern", runway, hand: a.hand, leg: "downwind"}},
    {id: "extend", label: "Extend circuit leg", group: "Arrivals and circuit", command: {type: "extend", leg: "downwind"}},
    {id: "go-around", label: "Missed landing", group: "Arrivals and circuit", command: {type: "go-around", hand: a.hand}},
    {id: "arrival-sequence", label: "Arrival order", group: "Sequence", command: {type: "sequence", number: 2, traffic: "Final"}},
  ] as CommandTask[]));
  tasks.push({id: "frequency", label: "Transfer or release", group: "Frequency", command: {type: "frequency", frequency: frequency === "ground" ? "tower" : "ground"}});
  return tasks;
}
function likelyGiveWayTraffic(source: Aircraft, traffic: Aircraft[], kind: "exiting" | "left" | "right" | "ahead", runway?: Runway): Aircraft | undefined {
  const heading = source.heading * Math.PI / 180;
  const forward = {x: Math.sin(heading), y: Math.cos(heading)};
  const right = {x: Math.cos(heading), y: -Math.sin(heading)};
  return traffic.filter(other => {
    if (other.id === source.id || !other.active || other.altitude >= airport.elevation + 1000 || !["taxi", "pushback", "rollout", "lineup"].includes(other.mode)) return false;
    const seen = new Set([source.id]);
    let leader: Aircraft | undefined = other;
    while (leader) {
      if (seen.has(leader.id)) return false;
      seen.add(leader.id);
      leader = traffic.find(candidate => candidate.id === leader?.giveWay?.aircraftId);
    }
    if (kind === "exiting") return other.mode === "rollout" && (other.runway === runway || other.lastRunway === runway);
    const delta = {x: other.position.x - source.position.x, y: other.position.y - source.position.y};
    const lateral = delta.x * right.x + delta.y * right.y;
    const ahead = delta.x * forward.x + delta.y * forward.y;
    return kind === "left" ? lateral < -.001 : kind === "right" ? lateral > .001 : ahead > .001;
  }).sort((a, b) => Math.hypot(a.position.x - source.position.x, a.position.y - source.position.y) - Math.hypot(b.position.x - source.position.x, b.position.y - source.position.y))[0];
}
const misc = (label: string): MenuEntry => ({label, instruction: {type: "radio", message: "misc", text: MISC_TEXT[label] ?? label}});
const MISC_TEXT: Record<string, string> = {
  "Follow instructions (Simple)": "Please follow instructions",
  "Follow instructions (Report)": "Please follow instructions, report when able to comply",
  "Duplicate messages": "Please do not send duplicate messages",
  "Freq busy be patient": "Frequency is busy, please be patient",
  "Wait clrnc bfr crssng RWY": "Wait for clearance before crossing the runway",
  "Wait clearance Bfr Tkf": "Wait for clearance before takeoff",
  "Wait clearance Bfr Ldg": "Wait for clearance before landing",
  "Already Clr to Lnd": "You are already cleared to land",
  "No int. dept": "No intersection departures",
  "Amend FPL with SID": "Amend your flight plan with a departure procedure",
  "Not a taxiway": "You are not on a taxiway",
  "Taxi through grass": "You are taxiing through grass",
  "Duplicate Frequency change": "Frequency change already approved",
  "Stay on frequency": "stay on my frequency",
};
const sharedMisc = ["Follow instructions (Simple)", "Follow instructions (Report)", "Check User Guide", "Duplicate messages", "Stay on frequency", "Please Expedite", "Freq busy be patient", "Aircraft too large", "No Light Aircraft", "Traffic Alert", "Thank you", "Thank you, good day", "You're welcome", "I'm sorry"].map(misc);
function legacyMessageMenu(frequency: Frequency, a: Aircraft, traffic: Aircraft[] = []): MenuEntry[] {
  const onGround = ["parked", "pushback", "taxi", "lineup", "takeoff", "rollout"].includes(a.mode) && a.altitude <= airport.elevation + 1;
  const labels = frequency === "ground" ? ["Wait for Clearance", "Wait clrnc bfr crssng RWY", "Not Cleared on Runway", "Check ATIS", "Not a taxiway", "Taxi through grass", "Don't cut in line", "Maintain safe distance", "Check Runway", "Duplicate Frequency change", "Amend FPL with SID"] : ["Wait clearance Bfr Tkf", "Wait clearance Bfr Ldg", "Already Clr to Lnd", ...(onGround ? ["Exit Runway"] : []), "No pattern work", "Pattern full", "Check ATIS", "Check Runway", "No int. dept", "No more pattern work. Land or divert."];
  return [{label: "Give way to...", children: [
    {label: "Aircraft exiting runway", children: runwayEnds(airport).map(end => ({label: `Runway ${end.id}`, instruction: {type: "give-way" as const, aircraftId: likelyGiveWayTraffic(a, traffic, "exiting", end.id)?.id, description: `aircraft exiting runway ${end.id}`}}))},
    ...(["left", "right", "ahead"] as const).map(kind => ({label: kind === "ahead" ? "Aircraft ahead" : `Aircraft on your ${kind}`, instruction: {type: "give-way" as const, aircraftId: likelyGiveWayTraffic(a, traffic, kind)?.id, description: kind === "ahead" ? "aircraft ahead" : `aircraft on your ${kind}`}})),
  ]}, ...(frequency === "ground" || frequency === "tower" ? [{label: "Misc. Messages", children: [...sharedMisc, ...labels.map(misc)]}] : [])];
}
function messageMenu(frequency: Frequency, a: Aircraft, traffic: Aircraft[] = [], request?: Message, messages: Message[] = []): MenuEntry[] {
  return orderedMenu(referenceMenu(frequency, a, airport, environment, legacyMessageMenu(frequency, a, traffic), traffic, request, messages, weather),frequency);
}
/** A shortcut duplicates the ordinary command; its submenu and send behavior stay identical. */

function requestMessageMenu(frequency: Frequency, a: Aircraft, request?: Message, traffic: Aircraft[] = [], messages: Message[] = []): MenuEntry[] {
  const identify = (items: MenuEntry[], prefix: string): MenuEntry[] => {const seen = new Map<string, number>(); return items.map(item => {
    const occurrence = seen.get(item.label) ?? 0; seen.set(item.label, occurrence + 1);
    const id = prefix + "/" + (item.id ?? encodeURIComponent(item.label) + ":" + occurrence);
    return {...item, id, ...(item.children ? {children: identify(item.children, id)} : {})};
  });};
  const entries = identify(orderedMenu(messageMenu(frequency, a, traffic, request, messages),frequency), frequency);
  const suggest = (original?: MenuEntry) => {
    if (!original) return entries;
    const clone = (item: MenuEntry): MenuEntry => ({...item, id: "suggested:" + item.id, ...(item.children ? {children: item.children.map(clone)} : {})});
    return [{...clone(original), suggested: true}, ...entries];
  };
  if (!request || request.sender !== "pilot" || request.commandId || request.aircraftId !== a.id || request.frequency !== frequency || a.frequency !== frequency || frequency === "atis") return entries;
  // Older snapshots and automatic go-arounds contain radio text without structured request data.
  const phrase = request.text.slice(request.text.indexOf(",") + 1).trim();
  const requestId = request.request?.id ?? (
    /^(?:ready for|requesting) pushback\b/i.test(phrase) ? "pushback" :
    /^requesting runway (?:0[1-9]|[12][0-9]|3[0-6])[LRC]?\.?$/i.test(phrase) ? "runway-change" :
    /^(?:requesting to|ready to) cross runway (?:0[1-9]|[12][0-9]|3[0-6])[LRC]?\.?$/i.test(phrase) ? "cross-runway" :
    /^requesting (?:(?:ILS|GPS|visual) )?approach\b/i.test(phrase) ? "request-approach" :
    /^executing missed approach\b/i.test(phrase) ? "missed-approach" : /^going around\.?$/i.test(phrase) ? "go-around" : /^with you at\b/i.test(phrase) ? "check-in" : /requesting transition\.?$/i.test(request.text) ? "transition" : undefined);
  if (requestId === "request-approach" && (frequency === "approach" || frequency === "center")) {
    const approach = entries.find(entry => entry.label === "Expect Approach...");
    return suggest(approach);
  }
  const labels: Partial<Record<PilotRequestId, string>> = {pushback: "Pushback Approved", "runway-change": "Unable", "cross-runway": "Cross Runway...", "go-around": "Respond to Go Around", transition: "Respond to Transition", "check-in": "Radar Contact", "flight-following":"Respond to Flight Following Request", "radar-vectors":"Respond to Radar Vectors Request", "star-descent":"Respond to STAR Descent Request", "diversion":"Respond to Diversion Request", "minimum-fuel":"Respond to Emergency", "emergency-fuel":"Respond to Emergency"};
  if (requestId === "runway-change" && messages.some(m => m.id === request.id && m.sender === "pilot" && !m.commandId && m.aircraftId === a.id && m.frequency === frequency)) entries.push({label: "Unable", children: [{label: "Confirm", instruction: {type: "radio", message: "unable"}}]});
  const original = entries.find(entry => entry.label === (requestId ? labels[requestId] : undefined));
  return suggest(original);
}



function contextMenu(frequency: Frequency, a: Aircraft): ContextAction[] {
  return [...(a.frequency === frequency ? ["messages", "reminder", ...(a.reminderAt !== null ? ["remove-reminder"] : [])] : a.active && frequency !== "atis" ? ["guard"] : []), "information", "color", "tag"] as ContextAction[];
}



const REQUESTS: PilotRequest[] = [
  ...([
    ["altitude-change","Request Altitude Change"],["report-position","Report Position"],["excellent-service","Excellent Service, Thanks!"],["back-with-you","Back with you"],["roger","Roger"],["wilco","Wilco"],["standby","Stand by"],["unable","Unable"],["correction","Correction"],
    ["unicom-taxi","Taxi"],["unicom-takeoff","Takeoff"],["unicom-inbound","Announce Inbound"],["unicom-position","Report Position"],["unicom-go-around","Go around"],["unicom-clear-runway","Clear of All Runways"],["unicom-advisories","Request Traffic Advisories"],["unicom-cross-runway","Cross Runway"],["unicom-holding-short","Hold Short"],
  ] as const).map(([id,label]):PilotRequest=>({id,label,legacyLabel:label,text:label,...(id.startsWith("unicom-")?{phase:["unicom-taxi","unicom-takeoff","unicom-clear-runway","unicom-cross-runway","unicom-holding-short"].includes(id)?"ground":"airborne"}:{}), ...(["report-position","unicom-position","unicom-inbound","unicom-takeoff","unicom-taxi","unicom-cross-runway","unicom-holding-short"].includes(id)?{runway:true}: {})})),
  {id: "check-in", label: "Check in (IFR)", legacyLabel: "Radar check in", text: "with you", phase: "airborne"},
  {id: "request-approach", label: "Request approach", legacyLabel: "Request approach", text: "requesting", phase: "airborne"},
  {id: "missed-approach", label: "Missed approach", legacyLabel: "Executing missed approach", text: "executing missed approach", phase: "airborne"},
  {id: "pushback", label: "Request Pushback", legacyLabel: "Request pushback", text: "ready for pushback", phase: "ground"},
  {id: "taxi-runway", label: "Request Taxi", legacyLabel: "Request taxi to runway", text: "ready to taxi to", runway: true, phase: "ground"},
  {id: "cross-runway", label: "Request runway crossing", legacyLabel: "Ready to cross runway", text: "requesting to cross", runway: true, phase: "ground"},
  {id: "frequency-change", label: "Frequency Change", legacyLabel: "Request frequency change", text: "requesting frequency change"},
  {id: "inbound-land", label: "Request Landing", legacyLabel: "Inbound for landing", text: "inbound for landing", runway: true, phase: "airborne"},
  {id: "inbound-option", label: "Request the Option", legacyLabel: "Inbound for touch and go", text: "inbound, requesting the option", runway: true, phase: "airborne"},
  {id: "departure", label: "Request Takeoff", legacyLabel: "Ready for departure", text: "ready for departure from", runway: true, phase: "ground"},
  {id: "departure-direction", label: "Request Departure", legacyLabel: "Request departure to direction", text: "requesting departure to the", phase: "airborne"},
  {id: "pattern-entry", label: "Request Pattern Entry", legacyLabel: "Request pattern entry", text: "requesting pattern entry for", runway: true},
  {id: "runway-change", label: "Request Runway Change", legacyLabel: "Request runway change", text: "requesting", runway: true},
  {id: "go-around", label: "Go Around", legacyLabel: "Going around", text: "going around", phase: "airborne"},
  {id: "taxi-parking", label: "Request Taxi to Parking", legacyLabel: "Request taxi to parking", text: "requesting taxi to parking", phase: "ground"},
  {id: "transition", label: "Request Transition", legacyLabel: "Request transition", text: "requesting transition", phase: "airborne"},
  {id: "flight-following", label: "Request flight following", legacyLabel: "Request flight following", text: "requesting flight following", phase: "airborne"},
  {id: "radar-vectors", label: "Request radar vectors", legacyLabel: "Request radar vectors", text: "requesting radar vectors", phase: "airborne"},
  {id: "star-descent", label: "Request STAR descent", legacyLabel: "Request STAR descent", text: "requesting descent via arrival", phase: "airborne"},
  {id: "diversion", label: "Request diversion", legacyLabel: "Request diversion", text: "requesting diversion", phase: "airborne"},
  {id: "minimum-fuel", label: "Minimum Fuel", legacyLabel: "Minimum Fuel", text: "minimum fuel"},
  {id: "emergency-fuel", label: "Emergency Fuel", legacyLabel: "Emergency Fuel", text: "emergency fuel"},
  {id: "airport-in-sight", label: "Airport in sight", legacyLabel: "Airport in sight", text: "airport in sight", phase: "airborne"},
];
/** Exact legacy labels are an adapter for old revisions, never rewritten in storage. */

function resolvePilotRequest(value: {requestId?: string; label?: string}): PilotRequest | undefined {
  return value.requestId ? REQUESTS.find(r => r.id === value.requestId) : REQUESTS.find(r => r.legacyLabel === value.label);
}

const pilotRequests = (a: Aircraft): PilotRequest[] => {
  const ground = a.altitude <= airport.elevation + 1;
  const emergency = a.altitude>airport.elevation+1 && (a.flightSeconds??0)>=60 && a.fuel && ["minimum","emergency"].includes(a.fuel.state);
  const common=["excellent-service","back-with-you","roger","wilco","standby","unable","correction"];
  const available=REQUESTS.filter(r=>!["minimum-fuel","emergency-fuel"].includes(r.id)||emergency);
  if(a.frequency==="unicom") {
    const visible = ground ? ["unicom-taxi","unicom-takeoff","unicom-clear-runway","unicom-cross-runway","unicom-holding-short"] : ["unicom-inbound","unicom-position","unicom-go-around","unicom-advisories"];
    return available.filter(r=>visible.includes(r.id));
  }
  if (a.radar) return !a.radar.departure && !a.radar.arrival && a.frequency && a.frequency !== "atis" ? available.filter(r => [...common,"altitude-change","check-in", "request-approach", "missed-approach", "frequency-change", "flight-following", "radar-vectors", "star-descent", "diversion", "minimum-fuel", "emergency-fuel", "airport-in-sight", ...(a.radar?.flight === "departure" ? ["departure-direction"] : [])].includes(r.id)) : [];
  const allowed = a.frequency === "approach" || a.frequency === "center" ? ["check-in", "request-approach", "missed-approach", "frequency-change"] : a.frequency === "ground" ? ["pushback", "taxi-runway", "taxi-parking", "cross-runway", "frequency-change"] : a.frequency === "tower" ? ground ? ["departure", "cross-runway", "runway-change", "frequency-change"] : ["inbound-land", "inbound-option", "transition", "departure-direction", "runway-change", "go-around", "frequency-change"] : [];
  return available.filter(r => (common.includes(r.id) || !ground && a.frequency==="tower" && r.id==="report-position" || allowed.includes(r.id) || a.frequency !== "atis" && ["minimum-fuel", "emergency-fuel"].includes(r.id)) && (!r.phase || (r.phase === "ground") === ground));
};


function pilotRequestText(a: Aircraft, request: PilotRequest, runway: Runway, remainingInPattern = false, options: PilotRequestOptions = {}): string {
  const information = options.exercise?.publishedDraft?.letter;
  const atis = information ? ` with information ${information}` : "";
  if (request.id === "diversion" && a.diversionDestination) return `${a.callsign}, requesting diversion to ${a.diversionDestination.name}`;
  if (request.id === "flight-following" && a.destination) return `${a.callsign}, requesting flight following to ${a.destination.name}`;
  if (request.id === "airport-in-sight") return `Airport in sight, ${a.callsign}`;
  if (request.id === "check-in") return checkInTransmission(a,FREQUENCIES[a.frequency??"approach"].name);
  if(request.id === "minimum-fuel" || request.id === "emergency-fuel") return `${a.callsign}, ${request.id==="minimum-fuel"?"Minimum Fuel":"Emergency Fuel"}, ${Math.round(a.fuel?.enduranceMinutes??0)} minutes remaining.`;
  if(request.id === "altitude-change") {const altitude=options.altitude??{unit:"feet" as const,value:5000};return `${a.callsign}, requesting ${altitudeFeet(altitude)>a.altitude?"climb":"descent"} to ${altitudeLabel(altitude)}`;}
  if(request.id === "report-position") return `${a.callsign}, is on ${options.position??"Final"} Runway ${runway}${options.outcome?options.outcome==="full-stop"?", full stop":", touch and go":""}`;
  if(request.id === "excellent-service")return `Excellent Service, Thanks!, ${a.callsign}`;
  if(request.id === "back-with-you")return `is back with you, ${a.callsign}`;
  if(["roger","wilco","standby","unable","correction"].includes(request.id))return `${request.label}, ${a.callsign}`;
  if(request.id.startsWith("unicom-")) {
    const receiver=`${airportCallsign(airport)} traffic`, who=`${receiver}, ${a.callsign}`;
    const direction=options.takeoffDirection??options.direction??"north";
    const departure=remainingInPattern ? "Remaining in the Pattern" : `Departing ${direction[0].toUpperCase()+direction.slice(1)}`;
    const compass=["north","northeast","east","southeast","south","southwest","west","northwest"][Math.round(((Math.atan2(a.position.x,a.position.y)*180/Math.PI+360)%360)/45)%8];
    const position=`${Math.round(Math.hypot(a.position.x,a.position.y))} miles to the ${compass} at ${Math.round(a.altitude/100)*100} feet`;
    const phrases: Record<string,string>={
      "unicom-taxi":`${who}, taxiing to Runway ${runway}`,
      "unicom-takeoff":`${who} is taking off Runway ${runway}, ${departure}`,
      "unicom-inbound":`${who} is ${position}, inbound for ${options.outcome==="touch-and-go"?"Touch and Goes":"Landing"}, will make ${options.entry??"Straight In"} for Runway ${runway}`,
      "unicom-position":`${who} is on ${options.position??"Final"}, Runway ${runway}`,
      "unicom-go-around":`${who}, going around`,
      "unicom-clear-runway":`${who} is clear of all runways`,
      "unicom-advisories":`${who} is inbound, request traffic advisories`,
      "unicom-cross-runway":`${who}, crossing Runway ${runway}`,
      "unicom-holding-short":`${who}, holding short Runway ${runway}`,
    };
    return phrases[request.id];
  }
  if(request.id === "inbound-land" || request.id === "inbound-option"){const landing=request.id==="inbound-land"?"Landing":"Touch and Go",mode=options.inbound??"runway";const direction=["north","northeast","east","southeast","south","southwest","west","northwest"][Math.round(((Math.atan2(a.position.x,a.position.y)*180/Math.PI+360)%360)/45)%8];const position=`${Math.round(Math.hypot(a.position.x,a.position.y))} miles to the ${direction} at ${Math.round(a.altitude/100)*100} feet`;return ["ils","gps","visual"].includes(mode)?`${airportCallsign(airport)} Tower, ${a.callsign}, inbound on the ${mode==="visual"?"Visual":mode.toUpperCase()}${request.id==="inbound-option"?" for Touch and Go":""} Runway ${runway}${atis}`:`${airportCallsign(airport)} Tower, ${a.callsign} is ${position}, inbound for ${landing}${atis}${mode==="runway"?`, requesting Runway ${runway}`:""}`;}
  if (request.id === "request-approach") {
    const pinned = {...(options.exercise?.radarEnvironment ?? environment), approaches:approachOptions(a,airport,(options.exercise?.radarEnvironment ?? environment).approaches)};
    const type = pinned.approaches.find(p=>p.id===options.approachId)?.type ?? radarRequestedApproach(a, pinned)?.type
      ?? pinned.approaches.find(p => p.id === a.radar?.expected)?.type
      ?? pinned.approaches.find(p => p.type === "ils")?.type ?? pinned.approaches[0]?.type ?? "visual";
    return `${a.callsign}, requesting ${type === "ils" ? "ILS" : type === "gps" ? "GPS" : "visual"} approach at ${destinationCode(a,airport)}`;
  }
  if (request.id === "transition") {
    const nm = Math.hypot(a.position.x, a.position.y);
    const degrees = (Math.atan2(a.position.x, a.position.y) * 180 / Math.PI + 360) % 360;
    const direction = ["north", "north east", "east", "south east", "south", "south west", "west", "north west"][Math.round(degrees / 45) % 8];
    return `${a.callsign} is ${Math.round(nm * 10) / 10} miles to the ${direction} of ${airportCallsign(airport)} at ${Math.round(a.altitude)} feet, requesting transition`;
  }
  if (request.id === "pushback") return `${a.callsign}, ready for pushback${atis}`;
  if (request.id === "runway-change") return `${a.callsign}, requesting change to runway ${runway}`;
  if (request.id === "taxi-runway") return `${airportCallsign(airport)} Ground, ${a.callsign} ready to taxi${options.includeRunway === false ? "" : ` to runway ${runway}`}${atis}`;
  if (request.id === "departure-direction") return `${a.radar ? checkInTransmission(a) : a.callsign}, requesting departure to the ${options.direction ?? a.radar?.departureDirection ?? "north"}`;
  return `${a.callsign}, ${request.text}${request.runway ? ` runway ${runway}` : ""}${request.id === "departure" && remainingInPattern ? ", remaining in the pattern" : ""}`;
}


return {instructionText, commandTasks, messageMenu, requestMessageMenu, contextMenu, resolvePilotRequest, pilotRequests, pilotRequestText};
}
const catalogs = new WeakMap<Airport, ReturnType<typeof createCatalog>>();
export function catalogFor(airport: Airport = defaultAirport, environment?: RadarEnvironment, weather?: ExerciseWeather) {
 if (environment || weather) return createCatalog(airport, environment, weather);
 let catalog = catalogs.get(airport);
 if (!catalog) {catalog = createCatalog(airport); catalogs.set(airport, catalog);}
 return catalog;
}
export const {instructionText, commandTasks, messageMenu, requestMessageMenu, contextMenu, resolvePilotRequest, pilotRequests, pilotRequestText} = catalogFor();

export function positionDescription(a: Aircraft, airport: Airport): string {
  const degrees = (Math.atan2(a.position.x, a.position.y) * 180 / Math.PI + 360) % 360;
  const direction = ["north", "north east", "east", "south east", "south", "south west", "west", "north west"][Math.round(degrees / 45) % 8];
  return `${a.callsign} is ${Math.round(Math.hypot(a.position.x, a.position.y) * 10) / 10} nautical miles to the ${direction} of ${airport.icao} at ${Math.round(a.altitude)} feet`;
}

export function positionReportText(a: Aircraft, airport: Airport): string {
  const position = a.mode === "pattern" && a.runway ? `${a.callsign} is on ${patternLegLabel(a)} ${a.runway}` : positionDescription(a, airport);
  return `${position}, ${a.landing === "touch-and-go" ? "touch and go" : "full stop"}`;
}
