import {EXERCISE_WEATHER, type Airport, type Aircraft, type Frequency, type Instruction, type Runway, type Direction, type Exercise, type Message} from "./model";
import {defaultAirport, defaultRunway, runwayEnds, airportCallsign, frequenciesFor} from "./airports";
import type {RadarEnvironment} from "./model";
import {ALTITUDES, altitudeLabel, checkInTransmission, radarEnvironmentFor, radarInstructionText, roundedHeadingInstruction} from "./radar";
import {KNOT_SPEEDS_LOW, KNOT_SPEEDS_HIGH, MACH_SPEEDS, speedLabel} from "./radar-speed";

export interface MenuEntry {label: string; instruction?: Instruction; children?: MenuEntry[]; note?: string; suggested?: boolean; input?: "heading" | "speed"; composeVector?: boolean}
export const HEADING_CHOICES = Array.from({length: 36}, (_, i) => i * 10);
function speedChoices(unit: "knots" | "mach", values: number[]): MenuEntry[] {
  return values.map(value => ({label: speedLabel(unit, value), children: (["exact", "minimum", "maximum"] as const).map((relation, i) => ({label: `${["=", ">", "<"][i]}${speedLabel(unit, value)}`, instruction: {type: "radar-speed", mode: "maintain", unit, value, relation}}))}));
}
export function radarSpeedMenu(): MenuEntry[] {
  return [
    {label: "Maintain speed", children: [{label: "<=250kts", children: speedChoices("knots", KNOT_SPEEDS_LOW)}, {label: ">250kts", children: speedChoices("knots", KNOT_SPEEDS_HIGH)}, {label: "Mach", children: speedChoices("mach", MACH_SPEEDS)}]},
    {label: "Approach speed", children: [[160, 4], [170, 5], [180, 6]].map(([value, until]) => ({label: `${value} until ${until} mile final`, instruction: {type: "radar-speed", mode: "approach", value, until}}))},
    ...([['Speed discretion', 'discretion'], ['Slowest practical speed', 'slowest'], ['Best forward speed', 'best-forward'], ['Adjust speed to follow', 'follow']] as const).map(([label, mode]): MenuEntry => ({label, instruction: {type: "radar-speed", mode}})),
  ];
}
export const TASK_GROUPS = ["Ground movement", "Departures", "Arrivals and circuit", "Sequence", "Frequency"] as const;
export interface CommandTask {id: string; label: string; group: typeof TASK_GROUPS[number]; command: Instruction}
export const CONTEXT_ACTIONS = {messages: "Other messages", reminder: "Add reminder", "remove-reminder": "Clear reminder", information: "Aircraft details", color: "Highlight aircraft", tag: "Position label"} as const;
export type ContextAction = keyof typeof CONTEXT_ACTIONS;
export const REQUEST_IDS = ["pushback", "taxi-runway", "cross-runway", "frequency-change", "inbound-land", "inbound-option", "departure", "pattern-entry", "runway-change", "go-around", "departure-direction", "taxi-parking", "transition", "check-in", "request-approach", "missed-approach"] as const;
export type PilotRequestId = typeof REQUEST_IDS[number];
export interface PilotRequest {id: PilotRequestId; label: string; text: string; runway?: boolean; phase?: "ground" | "airborne"; legacyLabel: string}
export interface PilotRequestOptions {direction?: Direction; includeRunway?: boolean; exercise?: Pick<Exercise, "publishedDraft" | "radarEnvironment">}
export const LETTERS = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET", "KILO", "LIMA", "MIKE", "NOVEMBER", "OSCAR", "PAPA", "QUEBEC", "ROMEO", "SIERRA", "TANGO", "UNIFORM", "VICTOR", "WHISKEY", "XRAY", "YANKEE", "ZULU"];
export const REMARKS = ["No Pattern Work", "Gate Hold", "Flight plan required"];
function createCatalog(airport: Airport, environment = radarEnvironmentFor(airport)) {
const FREQUENCIES = frequenciesFor(airport);


function instructionText(a: Aircraft, instruction: Instruction, path: MenuEntry[] = []): string {
  instruction = roundedHeadingInstruction(instruction);
  const radarText = radarInstructionText(a, instruction, environment);
  if (radarText !== undefined) return `${a.callsign}, ${radarText}`;
  const runway = ("runway" in instruction ? instruction.runway : undefined) ?? a.runway ?? defaultRunway(airport);
  let text: string;
  switch (instruction.type) {
    case "radar-speed": case "vector": case "expect-approach": case "missed-approach": case "route": text = ""; break;
    case "radio": text = instruction.message === "misc" ? instruction.text ?? "" : {"say-intentions": "Say Intentions", standby: "Standby", "correction-standby": "Correction, Standby", disregard: "Disregard last message", unable: "Unable"}[instruction.message]; break;
    case "transition": text = `Transition approved at or above ${instruction.altitude} feet`; break;
    case "departure": text = `departure to the ${instruction.direction} approved`; break;
    case "lineup": text = `Runway ${runway}, line up and wait`; break;
    case "exit-runway": text = `exit runway${instruction.side === "any" ? " when able" : " to the " + instruction.side}${instruction.expedite ? ", expedite" : ""}${instruction.traffic ? ", traffic on " + instruction.traffic : ""}`; break;
    case "pushback": text = `pushback approved, tail to the ${instruction.tail}`; break;
    case "taxi": text = instruction.destination === "parking" ? "taxi to Parking, at your discretion" : instruction.destination === "continue" || (!instruction.destination && !instruction.runway) ? "continue taxi" : `taxi to runway ${runway}`; break;
    case "give-way": text = `give way to ${instruction.description}`; break;
    case "stop": text = "hold position"; break;
    case "hold-short": text = `hold short of runway ${runway}`; break;
    case "cross": text = `cross runway ${runway}`; break;
    case "takeoff": text = `wind ${EXERCISE_WEATHER.windDirection} at ${EXERCISE_WEATHER.windSpeed}, Runway ${runway}, cleared for takeoff${instruction.hand ? `, make ${instruction.hand} traffic` : ""}`; break;
    case "land": text = `wind ${EXERCISE_WEATHER.windDirection} at ${EXERCISE_WEATHER.windSpeed}, ${instruction.number ? `number ${instruction.number}, ` : ""}Runway ${runway}, cleared ${instruction.option ? "for the option" : "to land"}${instruction.option && instruction.hand ? `, after the option, make ${instruction.hand} traffic` : ""}`; break;
    case "sequence": text = instruction.departure ? `you're number ${instruction.number} for departure` : `number ${instruction.number}, traffic to follow is on ${instruction.traffic?.toLowerCase() ?? "final"}`; break;
    case "go-around": text = `go around, ${instruction.runwayHeading ? "fly runway heading" : `make ${instruction.hand ?? a.hand} traffic`} runway ${runway}`; break;
    case "cancel-landing": text = "cancel landing clearance"; break;
    case "pattern": text = path.find(entry => /^(Enter|Turn)/.test(entry.label))?.label.toLowerCase() ?? `enter ${instruction.leg === "final" ? "straight in" : `${instruction.hand ?? a.hand} ${instruction.leg}`}`; if (!path.length || path.some(entry => entry.label.startsWith("Runway"))) text += ` runway ${runway}`; if (instruction.sequence) text += `, number ${instruction.sequence.number}, traffic to follow is on ${instruction.sequence.traffic?.toLowerCase() ?? "final"}`; break;
    case "extend": text = instruction.leg === "downwind" ? "extend downwind, I'll call your base" : "extend upwind, I'll call your crosswind"; break;
    case "frequency": text = instruction.frequency ? `contact ${FREQUENCIES[instruction.frequency].name}${FREQUENCIES[instruction.frequency].value === "Training" ? "" : " on " + FREQUENCIES[instruction.frequency].value}` : "frequency change approved, good day"; break;
    case "heading": text = `fly heading ${instruction.value}`; break;
    case "speed": text = `maintain ${instruction.value} knots`; break;
    case "runway": text = `expect Runway ${instruction.runway}`; break;
    case "outcome": text = instruction.outcome === "full-stop" ? "make full stop" : "make touch and go"; break;
  }
  if (instruction.type === "frequency" && instruction.whenReady) text += ", when ready";
  return `${a.callsign}, ${text}`;
}
/** Independent task controls. Only supported instructions are offered. */



function commandTasks(frequency: Frequency, a: Aircraft): CommandTask[] {
  if (frequency === "atis") return [];
  const runway = a.runway ?? defaultRunway(airport);
  const ground = ["parked", "pushback", "taxi", "lineup", "takeoff", "rollout"].includes(a.mode);
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
const unavailable = (label: string, children?: MenuEntry[]): MenuEntry => ({label, children, note: "Not simulated in this exercise"});
const runways = (make: (runway: Runway) => MenuEntry[]): MenuEntry[] => runwayEnds(airport).map(end => end.id).map(runway => ({label: `Runway ${runway}`, children: make(runway)}));
const common: MenuEntry[] = [
  {label: "Contact Other Frequency", children: [{label: `Contact ${FREQUENCIES.ground.name}${FREQUENCIES.ground.value === "Training" ? "" : " on " + FREQUENCIES.ground.value}`, instruction: {type: "frequency", frequency: "ground"}}, {label: `Contact ${FREQUENCIES.tower.name}${FREQUENCIES.tower.value === "Training" ? "" : " on " + FREQUENCIES.tower.value}`, instruction: {type: "frequency", frequency: "tower"}}, {label: `Contact ${FREQUENCIES.tower.name} when ready`, instruction: {type: "frequency", frequency: "tower", whenReady: true}}, {label: "Frequency Change Approved", instruction: {type: "frequency", frequency: null}}]},
  {label: "Ask for Intentions", instruction: {type: "radio", message: "say-intentions"}},
  {label: "Standby", instruction: {type: "radio", message: "standby"}},
  {label: "Correction", children: [{label: "Correction, Standby", instruction: {type: "radio", message: "correction-standby"}}, {label: "Disregard last message", instruction: {type: "radio", message: "disregard"}}]},
];
const holdShortRunways = (): MenuEntry[] => runwayEnds(airport).map(end => end.id).reverse().map(runway => ({label: runway, instruction: {type: "hold-short", runway}}));
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
const sequencing = (entry?: Extract<Instruction, {type: "pattern"}>) => Array.from({length: 7}, (_, i): MenuEntry => ({label: `Number ${i + 2}`, children: ["Right Downwind", "Left Downwind", "Right Base", "Left Base", "Final", "Upwind", "Left Crosswind", "Right Crosswind"].map(traffic => ({label: `Traffic to Follow is on ${traffic}`, instruction: entry ? {...entry, sequence: {number: i + 2, traffic}} : {type: "sequence", number: i + 2, traffic}}))}));
const runwayCommand = (_a: Aircraft, type: "taxi" | "cross" | "takeoff" | "land" | "hold-short") => runways(runway => [{label: "Send", instruction: {type, runway}}]);
/** Restored legacy command navigation at the instructor’s request.
 * Unsupported actions remain explicitly unavailable. */

function messageMenu(frequency: Frequency, a: Aircraft, traffic: Aircraft[] = []): MenuEntry[] {
  if (frequency === "atis") return [];
  if (frequency === "approach" || frequency === "center") return [
    {label: "Vectoring Instructions", children: [
      {label: "Heading", children: HEADING_CHOICES.map(heading => ({label: String(heading).padStart(3, "0"), instruction: {type: "vector", heading}, composeVector: true}))},
      {label: "Altitude", children: ALTITUDES.map(altitude => ({label: altitudeLabel(altitude), instruction: {type: "vector", altitude}, composeVector: true}))},
    ]},
    {label: "Request Speed", children: radarSpeedMenu()},
    {label: "Expect approach ...", children: [
      ...(["ils", "gps", "visual"] as const).map(type => ({label: type === "ils" ? "ILS Approach" : type === "gps" ? "GPS Approach" : "Visual Approach", children: environment.approaches.filter(p => p.type === type).map(p => ({label: `Runway ${p.runway}`, instruction: {type: "expect-approach" as const, approachId: p.id}}))})),
      {label: "Radar Vectors", instruction: {type: "expect-approach", approachId: null, vectors: true}},
      {label: "Unable to provide services", instruction: {type: "radio", message: "misc", text: "Unable to provide services"}},
      {label: "Unable (outside of service area)", instruction: {type: "radio", message: "misc", text: "Unable, outside of service area"}},
    ]},
    {label: "Contact Other Frequency", children: (["ground", "tower", "approach", "center"] as Frequency[]).filter(f => f !== frequency).map(f => ({label: `Contact ${FREQUENCIES[f].name}`, instruction: {type: "frequency", frequency: f}}))},
    {label: "Ask for intentions", instruction: {type: "radio", message: "say-intentions"}},
    {label: "Missed approach instructions", children: ALTITUDES.map(altitude => ({label: altitudeLabel(altitude), instruction: {type: "missed-approach", altitude}}))},
  ];
  const otherFrequencies = common.map(entry => entry.label === "Contact Other Frequency" ? {...entry, children: entry.children?.filter(child => child.instruction?.type !== "frequency" || child.instruction.frequency !== a.frequency)} : entry);
  const groundTraffic = ["parked", "pushback", "taxi", "lineup", "takeoff", "rollout"].includes(a.mode);
  const progressive = unavailable("Progressive Taxi", [unavailable("Expect Progressive Taxi Instructions"), {label: "Cross Runway", children: runwayCommand(a, "cross")}, ...["Turn left next taxiway", "Turn right next taxiway", "Continue straight ahead", "Make 180", "Continue taxi at your discretion", "Follow Aircraft Ahead", "Already cleared to cross"].map(label => unavailable(label))]);
  const crossing: MenuEntry = {label: "Cross Runway...", children: runwayCommand(a, "cross").concat([unavailable("Already cleared to cross")])};
  const ground: MenuEntry[] = [
    {label: "Taxi to...", children: runwayCommand(a, "taxi").concat([{label: "Parking", instruction: {type: "taxi", destination: "parking"}}])},
    progressive,
    {label: "Continue Taxi", instruction: {type: "taxi"}}, {label: "Hold short...", children: holdShortRunways()},
    crossing,
    {label: "Give way to...", children: ["Aircraft exiting runway", "Aircraft on your left", "Aircraft on your right", "Aircraft ahead"].map(label => ({label, children: traffic.filter(other => other.id !== a.id && other.active && other.altitude < airport.elevation + 1000 && ["taxi", "pushback", "rollout", "lineup"].includes(other.mode)).map(other => ({label: other.callsign, instruction: {type: "give-way" as const, aircraftId: other.id, description: `${other.callsign}${label.includes("left") ? " on your left" : label.includes("right") ? " on your right" : label.includes("ahead") ? " ahead" : " exiting runway"}`}})), ...(traffic.length ? {} : {note: "No ground traffic available"})}))},
    {label: "Hold Position", instruction: {type: "stop"}},
    {label: "Pushback Approved", children: (["north", "south", "east", "west"] as const).map(tail => ({label: `Tail to the ${tail[0].toUpperCase() + tail.slice(1)}`, instruction: {type: "pushback", tail}}))},
    {label: "Misc. Messages", children: [...sharedMisc, ...["Wait for Clearance", "Wait clrnc bfr crssng RWY", "Not Cleared on Runway", "Check ATIS", "Not a taxiway", "Taxi through grass", "Don't cut in line", "Maintain safe distance", "Check Runway", "Duplicate Frequency change", "Amend FPL with SID"].map(misc)]},
  ];
  if (frequency === "ground") return [...(groundTraffic ? ground.slice(0, -1) : []), ground[ground.length - 1], ...otherFrequencies];
  const pattern: MenuEntry[] = [
    {label: "Enter Right Downwind", instruction: {type: "pattern", leg: "downwind", hand: "right"}}, {label: "Enter Left Downwind", instruction: {type: "pattern", leg: "downwind", hand: "left"}},
    {label: "Enter Right Base", instruction: {type: "pattern", leg: "base", hand: "right"}}, {label: "Enter Left Base", instruction: {type: "pattern", leg: "base", hand: "left"}},
    {label: "Enter Straight In", instruction: {type: "pattern", leg: "final"}}, {label: "Turn base", instruction: {type: "pattern", leg: "base"}}, {label: "Extend downwind", instruction: {type: "extend", leg: "downwind"}},
    {label: "Cancel Landing Clearance", instruction: {type: "cancel-landing"}}, {label: "Sequencing...", children: sequencing()},
    {label: "Turn Crosswind", instruction: {type: "pattern", leg: "crosswind"}}, {label: "Extend upwind", instruction: {type: "extend", leg: "upwind"}}, unavailable("Continue inbound"), unavailable("Descend to pattern altitude"),
  ];
  const towerGround: MenuEntry[] = [
    {label: "Cleared for Takeoff", children: runways(runway => [{label: "Send", instruction: {type: "takeoff", runway}}, ...(["right", "left"] as const).map(hand => ({label: `Make ${hand === "right" ? "Right" : "Left"} Traffic`, instruction: {type: "takeoff" as const, runway, hand}})), ...["Straight Out (5000ft)", "Straight Out (3000ft)", "Straight Out (1000ft)", "Request Immediate Takeoff"].map(label => unavailable(label))])}, unavailable("Cancel Takeoff Clearance"),
    {label: "Hold Short", children: holdShortRunways()}, {label: "Line up and Wait", children: runways(runway => [{label: "Send", instruction: {type: "lineup", runway}}])}, unavailable("Back Taxi"),
  ];
  // Entry instructions choose a runway before their Send / sequencing choices.
  for (const entry of pattern.slice(0, 5)) if (entry.instruction) {
    const instruction = entry.instruction;
    entry.children = runways(runway => [{label: "Send", instruction: {...instruction, runway}}, {label: "Sequencing...", children: sequencing({...instruction, runway} as Extract<Instruction, {type: "pattern"}>)}]);
    delete entry.instruction;
  }
  const airborne: MenuEntry[] = [
    {label: "Cleared to Land / for the Option", children: Array.from({length: 8}, (_, i) => ({label: `Number ${i + 1}`, children: ["Cleared to Land", "Cleared for the Option"].map(label => ({label, children: runways(runway => [{label: "Send", instruction: {type: "land", runway, number: i + 1, option: label === "Cleared for the Option"}}, ...(label === "Cleared for the Option" ? (["right", "left"] as const).map(hand => ({label: `Make ${hand === "right" ? "Right" : "Left"} Traffic`, instruction: {type: "land" as const, runway, number: i + 1, option: true, hand}})) : [])])}))}))},
    {label: "Sequencing...", children: sequencing()}, {label: "Pattern Instructions", children: pattern},
    {label: "Go Around", children: goAroundChoices()},
    {label: "Respond to Go Around", children: goAroundChoices()}, unavailable("Request 360", [unavailable("Left"), unavailable("Right")]), {label: "Approve Departure Request", children: (["north", "east", "south", "west"] as const).map(direction => ({label: direction[0].toUpperCase() + direction.slice(1), instruction: {type: "departure", direction}}))},
  ];
  const exit: MenuEntry = {label: "Exit runway", children: (["left", "right", "any"] as const).map(side => ({label: side[0].toUpperCase() + side.slice(1), children: ["Send", "Expedite", "Expedite, Traffic on Final", "Expedite, Traffic on Base"].map((label, i) => ({label, instruction: {type: "exit-runway", side, ...(i ? {expedite: true} : {}), ...(i >= 2 ? {traffic: i === 2 ? "final" as const : "base" as const} : {})}}))}))};
  return [...(groundTraffic ? towerGround : airborne.slice(0, 4)), exit, ...(groundTraffic ? [{label: "Taxi to Parking", instruction: {type: "taxi", destination: "parking"}} as MenuEntry] : airborne.slice(4)),
    {label: "Misc. Messages", children: [...sharedMisc, ...["Wait clearance Bfr Tkf", "Wait clearance Bfr Ldg", "Already Clr to Lnd", "Exit Runway", "No pattern work", "Pattern full", "Check ATIS", "Check Runway", "No int. dept", "No more pattern work. Land or divert."].map(misc)]}, {label: "Respond to Transition", children: Array.from({length: 20}, (_, i) => ({label: `${(i + 1) * 500}ft`, instruction: {type: "transition" as const, altitude: (i + 1) * 500}})).filter(item => item.instruction.altitude > airport.elevation)},
    ...(groundTraffic ? [{label: "Departure Sequencing...", children: [{label: "Hold short", children: holdShortRunways()}, ...Array.from({length: 7}, (_, i): MenuEntry => ({label: `Number ${i + 2}`, instruction: {type: "sequence", number: i + 2, departure: true}}))]}, progressive, {label: "Continue Taxi", instruction: {type: "taxi"}} as MenuEntry, crossing, {label: "Hold Position", instruction: {type: "stop"}} as MenuEntry] : []), ...otherFrequencies];
}
/** A shortcut duplicates the ordinary command; its submenu and send behavior stay identical. */

function requestMessageMenu(frequency: Frequency, a: Aircraft, request?: Message, traffic: Aircraft[] = []): MenuEntry[] {
  const entries = messageMenu(frequency, a, traffic);
  if (!request || request.sender !== "pilot" || request.commandId || request.aircraftId !== a.id || request.frequency !== frequency || a.frequency !== frequency || frequency === "atis") return entries;
  // Older snapshots and automatic go-arounds contain radio text without structured request data.
  const phrase = request.text.slice(request.text.indexOf(",") + 1).trim();
  const requestId = request.request?.id ?? (
    /^(?:ready for|requesting) pushback\b/i.test(phrase) ? "pushback" :
    /^requesting runway (?:0[1-9]|[12][0-9]|3[0-6])[LRC]?\.?$/i.test(phrase) ? "runway-change" :
    /^(?:requesting to|ready to) cross runway (?:0[1-9]|[12][0-9]|3[0-6])[LRC]?\.?$/i.test(phrase) ? "cross-runway" :
    /^going around\.?$/i.test(phrase) ? "go-around" : /requesting transition\.?$/i.test(request.text) ? "transition" : undefined);
  const labels: Partial<Record<PilotRequestId, string>> = {pushback: "Pushback Approved", "runway-change": "Unable", "cross-runway": "Cross Runway...", "go-around": "Go Around", transition: "Respond to Transition"};
  if (requestId === "runway-change") entries.push({label: "Unable", instruction: {type: "radio", message: "unable"}});
  const original = entries.find(entry => entry.label === (requestId ? labels[requestId] : undefined));
  return original ? [{...original, label: requestId === "transition" ? "Approve transition" : requestId === "cross-runway" ? "Cross Runway" : original.label, suggested: true}, ...entries] : entries;
}



function contextMenu(frequency: Frequency, a: Aircraft): ContextAction[] {
  return [...(a.frequency === frequency ? ["messages", "reminder", ...(a.reminderAt !== null ? ["remove-reminder"] : [])] : []), "information", "color", "tag"] as ContextAction[];
}
const goAroundChoices = (): MenuEntry[] => [{label: "Make Right Traffic", instruction: {type: "go-around", hand: "right"}}, {label: "Make Left Traffic", instruction: {type: "go-around", hand: "left"}}, {label: "Fly Runway Heading", instruction: {type: "go-around", runwayHeading: true}}];



const REQUESTS: PilotRequest[] = [
  {id: "check-in", label: "Check in", legacyLabel: "Radar check in", text: "with you", phase: "airborne"},
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
];
/** Exact legacy labels are an adapter for old revisions, never rewritten in storage. */

function resolvePilotRequest(value: {requestId?: string; label?: string}): PilotRequest | undefined {
  return value.requestId ? REQUESTS.find(r => r.id === value.requestId) : REQUESTS.find(r => r.legacyLabel === value.label);
}

const pilotRequests = (a: Aircraft): PilotRequest[] => {
  const ground = ["parked", "pushback", "taxi", "lineup", "takeoff", "rollout"].includes(a.mode);
  if (a.radar) return a.frequency && a.frequency !== "atis" ? REQUESTS.filter(r => ["check-in", "request-approach", "missed-approach", "frequency-change"].includes(r.id)) : [];
  const allowed = a.frequency === "approach" || a.frequency === "center" ? ["check-in", "request-approach", "missed-approach", "frequency-change"] : a.frequency === "ground" ? ["pushback", "taxi-runway", "taxi-parking", "cross-runway", "frequency-change"] : a.frequency === "tower" ? ground ? ["departure", "cross-runway", "runway-change", "frequency-change"] : ["inbound-land", "inbound-option", "transition", "departure-direction", "pattern-entry", "runway-change", "go-around", "frequency-change"] : [];
  return REQUESTS.filter(r => allowed.includes(r.id) && (!r.phase || (r.phase === "ground") === ground));
};


function pilotRequestText(a: Aircraft, request: PilotRequest, runway: Runway, remainingInPattern = false, options: PilotRequestOptions = {}): string {
  const information = options.exercise?.publishedDraft?.letter;
  const atis = information ? ` with information ${information}` : "";
  if (request.id === "check-in") return checkInTransmission(a);
  if (request.id === "request-approach") {
    const type = (options.exercise?.radarEnvironment ?? environment).approaches.find(p => p.id === a.radar?.expected)?.type ?? "ils";
    return `${a.callsign}, requesting ${type === "ils" ? "I-L-S" : type === "gps" ? "G-P-S" : "visual"} approach to ${airportCallsign(airport)}`;
  }
  if (request.id === "transition") {
    const nm = Math.hypot(a.position.x, a.position.y);
    const degrees = (Math.atan2(a.position.x, a.position.y) * 180 / Math.PI + 360) % 360;
    const direction = ["north", "north east", "east", "south east", "south", "south west", "west", "north west"][Math.round(degrees / 45) % 8];
    return `${a.callsign} is ${Math.round(nm * 10) / 10} miles to the ${direction} of ${airportCallsign(airport)} at ${Math.round(a.altitude)} feet, requesting transition`;
  }
  if (request.id === "pushback") return `${a.callsign}, ready for pushback${atis}`;
  if (request.id === "taxi-runway") return `${a.callsign}, ready to taxi${options.includeRunway === false ? "" : ` to runway ${runway}`}${atis}`;
  if (request.id === "departure-direction") return `${a.callsign}, requesting departure to the ${options.direction ?? "north"}`;
  return `${a.callsign}, ${request.text}${request.runway ? ` runway ${runway}` : ""}${request.id === "departure" && remainingInPattern ? ", remaining in the pattern" : ""}`;
}


return {instructionText, commandTasks, messageMenu, requestMessageMenu, contextMenu, resolvePilotRequest, pilotRequests, pilotRequestText};
}
const catalogs = new WeakMap<Airport, ReturnType<typeof createCatalog>>();
export function catalogFor(airport: Airport = defaultAirport, environment?: RadarEnvironment) {
 if (environment) return createCatalog(airport, environment);
 let catalog = catalogs.get(airport);
 if (!catalog) {catalog = createCatalog(airport); catalogs.set(airport, catalog);}
 return catalog;
}
export const {instructionText, commandTasks, messageMenu, requestMessageMenu, contextMenu, resolvePilotRequest, pilotRequests, pilotRequestText} = catalogFor();
