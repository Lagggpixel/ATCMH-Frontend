import {catalogFor} from "./catalog";
import {defaultRunway, frequenciesFor, getAirport} from "./airports";
import {radarEnvironmentFor} from "./radar";
import {pendingPilotMessage, type Action, type Aircraft, type Exercise, type Frequency, type Instruction} from "./model";

type Command = Extract<Action, {kind: "command"}>;
export interface QuickCommand {
  name: string;
  command: Instruction;
  path: string[];
  frequency: Frequency;
  airport: string;
  state: "ground" | "airborne" | "both";
  count: number;
  manual: boolean;
}

// Only options with ShortcutText in the supplied 26.4 reference are eligible.
const miscNames: Record<string, string> = {
  "Please follow instructions": "Follow Instr. 1", "Please follow instructions, report when able to comply": "Follow Instr. 2",
  "Check User Guide": "Check Guide", "Please do not send duplicate messages": "Dupl. Msgs", "stay on my frequency": "Stay on Freq.",
  "Please Expedite": "Expedite", "Frequency is busy, please be patient": "Be Patient", "Traffic Alert": "Traffic Alert.",
  "Thank you": "Thank you", "Thank you, good day": "Thanks Good Day", "You're welcome": "You're welcome", "I'm sorry": "Sorry",
  "Wait for Clearance": "Wait for Clearance", "Check ATIS": "Check ATIS", "Frequency change already approved": "Freq Change Dpl.",
  "Amend your flight plan with a departure procedure": "Amnd FPL SID", "No pattern work": "No Patt. Work",
  "Please double check runway assignment": "Check Runway", "Expedite Altitude Change": "Exp. Alt", "Do not follow FPL": "Don't flw FPL",
  "Altitude at discretion": "Alt. Discr.", "Request Add STAR to FPL": "Add STAR", "Say Approach Request": "Say Appr Req.",
};
const progressiveNames: Record<string, string> = {expect: "Prog. Taxi", left: "Lft Nxt TW", right: "Rgt Nxt TW", straight: "Cont. Ahead", reverse: "Make 180", discretion: "Cont. Taxi", follow: "Follow. Acft", crossed: "Alrd Clrd to Crss", inbound: "Cont. Inb"};
const capital = (value: string) => value[0].toUpperCase() + value.slice(1);

export function quickCommandName(c: Instruction, exercise: Exercise, a: Aircraft, path: string[] = []): string | null {
  const airport = getAirport(exercise), runway = ("runway" in c ? c.runway : undefined) ?? a.runway ?? defaultRunway(airport);
  switch (c.type) {
    case "taxi": return c.destination === "parking" ? "Taxi Parking" : c.destination === "continue" || !c.runway && !c.destination ? "Cont. Taxi" : `Taxi ${runway}`;
    case "stop": return "Hold Position";
    case "hold-short": return c.departure ? null : `Hold Short ${runway}`;
    case "cross": return `Cross Runway\n${runway}`;
    case "pushback": return `Pushback${c.runway ? ` ${c.runway}${c.tail ? ` ${capital(c.tail)}` : ""}` : ""}`;
    case "lineup": return `Line up ${runway}`;
    case "takeoff": return `Clr ${c.immediate ? "imm. " : ""} T/O ${c.hand ? `, make ${c.hand} traffic` : c.straightOut ? `, ${c.unablePattern ? "no patt., " : ""}${c.straightOut}ft` : ""} Runway ${runway}`;
    case "exit-runway": {
      const base = `Exit Rwy${c.side === "any" ? "" : ` ${capital(c.side)}`}`, expedite = c.expedite ? `exp.${c.traffic ? ` tfc on ${c.traffic}` : ""}` : "";
      return c.crossRunway ? `${base}, crs ${c.crossRunway} ${expedite}` : c.holdShort ? `${base}, hold ${c.holdShort} ${expedite}` : `${base}${expedite ? ` ${expedite}` : ""}`;
    }
    case "pattern": return !c.runway && !c.hand && !c.sequence ? c.leg === "base" ? "Turn Base" : c.leg === "crosswind" ? "Turn XWind" : null : null;
    case "extend": return c.leg === "downwind" ? "Call Base" : "Ext. Upwnd";
    case "radar-speed": {
      if (c.mode === "maintain") return `SPD ${c.relation === "minimum" ? ">=" : c.relation === "maximum" ? "<" : "="} ${c.unit === "mach" ? `mach ${c.value!.toFixed(2)}` : `${c.value}kts`}`;
      if (c.mode === "approach") return `${c.value}kts/${c.until}NM`;
      return ({present: "SPD: CURRENT", slowest: "SPD: SLOW", discretion: "SPD: ANY", "best-forward": "SPD: MAX FWD", follow: "SPD: FLW"})[c.mode];
    }
    case "expect-approach": {
      const approach = (exercise.radarEnvironment ?? radarEnvironmentFor(airport)).approaches.find(p => p.id === c.approachId);
      if (!approach && !c.vectors) return null;
      return `Expect ${approach ? approach.type === "visual" ? "Visual" : approach.type.toUpperCase() : "RV"} ${approach?.runway ?? runway} ${airport.icao}  (${c.navigation === "filed" ? "F" : "V"})`;
    }
    case "frequency": return c.frequency === null ? "Freq. Chng Approved" : `Contact ${frequenciesFor(airport)[c.frequency].name}`;
    case "radio": return c.message === "standby" ? "Stand by" : c.message === "say-intentions" ? "Say Intentions" : c.message === "misc" ? miscNames[c.text ?? ""] ?? null : null;
    case "atc":
      if (c.action === "progressive") return c.variant === "crossed" && /Cross Runway/.test(path[0] ?? "") ? "Cross Already cleared to cross" : progressiveNames[c.variant ?? ""] ?? null;
      if (c.action === "flight-following") return c.name ? null : "Proceed on course";
      if (c.action === "expect-unable") return c.variant === "coverage" ? "Unable out of area" : c.variant === "airspace" ? "Outside Airspace" : "Unable at this time";
      if (c.action === "deny-entry") return c.variant === "event" ? "Event In Prog." : "Airport Full";
      return null;
    default: return null;
  }
}

function visibility(c: Instruction): QuickCommand["state"] {
  if (["taxi", "stop", "hold-short", "cross", "pushback", "lineup", "takeoff"].includes(c.type)) return "ground";
  if (c.type === "pattern" || c.type === "extend" || c.type === "atc" && (c.action === "deny-entry" || c.action === "progressive" && c.variant === "inbound")) return "airborne";
  if (c.type === "atc" && c.action === "progressive") return "ground";
  return "both";
}

export function prepareQuickCommand(action: Command, exercise: Exercise, path: string[] = []): QuickCommand | null {
  const a = exercise.aircraft.find(a => a.id === action.aircraftId);
  if (!a || (action.command.type === "taxi" || action.command.type === "pushback") && action.command.route) return null;
  const name = quickCommandName(action.command, exercise, a, path);
  if (!name) return null;
  const command = structuredClone(action.command);
  // Freeze implicit runway selections, while preserving runway-free pattern turns and Continue Taxi.
  if (["hold-short", "cross", "lineup", "takeoff"].includes(command.type) && !("runway" in command && command.runway)) Object.assign(command, {runway: a.runway ?? defaultRunway(getAirport(exercise))});
  return {name, command, path: [...path], frequency: action.frequency, airport: getAirport(exercise).icao, state: visibility(command), count: 0, manual: false};
}

/** Instance-local history, keyed by the exact name. Collisions retain the first options/frequency. */
export class QuickCommandManager {
  private entries = new Map<string, QuickCommand>();
  add(command: QuickCommand, manual = false) {
    const previous = this.entries.get(command.name);
    this.entries.set(command.name, previous ? {...previous, count: previous.count + 1, manual} : {...command, manual});
  }
  ranked() {return [...this.entries.values()].sort((a, b) => Number(b.manual) - Number(a.manual) || b.count - a.count);}
}

export function visibleQuickCommands(entries: readonly QuickCommand[], exercise: Exercise, a: Aircraft, frequency: Frequency) {
  const airport = getAirport(exercise), state = a.altitude <= airport.elevation + 1 ? "ground" : "airborne";
  return entries.filter(entry => entry.airport === airport.icao && entry.frequency === frequency && (entry.state === "both" || entry.state === state));
}

export function quickCommandAction(entry: QuickCommand, exercise: Exercise, a: Aircraft, frequency: Frequency): Command {
  const command = structuredClone(entry.command), request = pendingPilotMessage(exercise, a.id, frequency);
  return {kind: "command", aircraftId: a.id, command, frequency, text: catalogFor(getAirport(exercise), exercise.radarEnvironment).instructionText(a, command, entry.path.map(label => ({label}))), ...(request ? {replyTo: request.id} : {})};
}
