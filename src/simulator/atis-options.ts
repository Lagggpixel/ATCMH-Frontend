import {facilities, localPoint} from "./aviation";
import type {RadioFacility} from "./aviation";
import type {Airport, Atis, Exercise, ExerciseWeather} from "./model";

// IF 26.4: ATISRemarks.Properties, in source order. Labels and broadcast words differ.
export const ATIS_REMARKS = [
  {label: "No intersection dept.", displayLabel: "NO\nINTERSECTION\nDEPT.", text: "no intersection departures"},
  {label: "No pattern work", displayLabel: "NO PATTERN\nWORK", text: "no pattern work"},
  {label: "Gate Hold", text: "gate hold in effect"},
  {label: "No Light Aircraft", displayLabel: "NO LIGHT\nAIRCRAFT", text: "no light aircraft accepted at this time"},
  {label: "Rolling dept", text: "rolling departures only"},
  {label: "FPL Rqd", text: "file flight plan prior to contacting ATC"},
  {label: "Straight out dept", displayLabel: "STRAIGHT OUT\nDEPT", text: "straight out departures only"},
  {label: "Mult. Freq. In Use", displayLabel: "MULT. FREQ. IN\nUSE", text: "multiple frequencies in use"},
  {label: "SID/STAR Use Rcmd", displayLabel: "SID/STAR USE\nRCMD", text: "use of Departure and Arrival procedures recommended"},
  {label: "SID/STAR Use Req", displayLabel: "SID/STAR USE\nREQ", text: "use of Departure and Arrival procedures required"},
] as const;
export const ATIS_NOTAMS = [
  {label: "Event", text: "event in progress, check forum for event information and expect delays"},
  {label: "Low visibility", text: "low visibility, use caution"},
] as const;
export const ATIS_DIRECTIONS = ["North", "East", "South", "West"] as const;
export type AtisDirection = typeof ATIS_DIRECTIONS[number];
const aliases: Record<string, string> = {
  "no circuit training": "No pattern work", "hold at stand": "Gate Hold",
  "flight plan required": "FPL Rqd", "separate ground and tower frequencies": "Mult. Freq. In Use",
  "training event": "Event", "simulated low visibility": "Low visibility",
};

/** Normalize only the editable draft; archived input/snapshots remain unchanged. */
export function currentAtisOptions(draft: Atis): Atis {
  const normalize = (values: string[], choices: readonly {label: string}[]) => [...new Set(values.map(value =>
    aliases[value.toLowerCase()] ?? choices.find(choice => choice.label.toLowerCase() === value.toLowerCase())?.label ?? value))];
  return {...draft, letter: draft.letter === "XRAY" ? "X-RAY" : draft.letter, expectations: draft.expectations.slice(-1),
    remarks: normalize(draft.remarks, ATIS_REMARKS), notams: normalize(draft.notams, ATIS_NOTAMS)};
}

/** IF only exposes sectors when more than one active Ground/Tower/Approach frequency exists. */
export function atisFrequencies(airport: Airport, environment?: Exercise["radarEnvironment"]): RadioFacility[] {
  const active = (environment?.facilities ?? facilities).filter(f => f.active && environment?.facilityActivity?.[f.id] !== false);
  return active.filter((f, index) => ["ground", "tower", "approach"].includes(f.type)
    && active.findIndex(other => other.id === f.id) === index
    && active.some(other => other.id !== f.id && other.type === f.type)
    && Math.hypot(...Object.values(localPoint(airport, f.lat, f.lon))) < 50);
}

/** IF's colors: wind <= 5 kt is green; >45° orange; >90° red. Both bearings are true. */
export function atisRunwayWind(heading: number, weather: ExerciseWeather): "headwind" | "crosswind" | "tailwind" {
  const angle = Math.abs(((weather.windDirection - heading + 540) % 360) - 180);
  return weather.windSpeed <= 5 ? "headwind" : angle > 90 ? "tailwind" : angle > 45 ? "crosswind" : "headwind";
}

export function atisSelectionText(draft: Atis, frequencies: RadioFacility[]): string[] {
  const selected = (values: string[], choices: readonly {label: string; text: string}[]) => [
    ...choices.filter(choice => values.some(value => value.toLowerCase() === choice.label.toLowerCase())).map(choice => choice.text),
    ...values.filter(value => !choices.some(choice => choice.label.toLowerCase() === value.toLowerCase())),
  ];
  const procedures = (type: string) => draft.procedures.filter(value => value.endsWith(`\n${type}`)).map(value => value.slice(0, -type.length - 1));
  const departures = procedures("SID"), arrivals = procedures("STAR");
  // IF 26.4 GetATISMessage / AppendRunwayInfo: remarks precede landing,
  // expected approach and departure runways; NOTAMs follow the runways.
  return [
    ...(draft.remarks.length ? [`Remarks, ${selected(draft.remarks, ATIS_REMARKS).join(", ")}.`] : []),
    ...(draft.arrivals.length ? [`Landing runway ${draft.arrivals.join(" and ")}.`, ...draft.expectations.slice(0, 1).map(x => `Expect ${x} approach.`)] : []),
    ...(draft.departures.length ? [`Departing runway ${draft.departures.join(" and ")}.`] : []),
    ...(draft.notams.length ? [`Notams, ${selected(draft.notams, ATIS_NOTAMS).join(", ")}.`] : []),
    ...(departures.length ? [`Recommended Departure Procedures, ${departures.join(", ")}.`] : []),
    ...(arrivals.length ? [`Recommended Arrival Procedures, ${arrivals.join(", ")}.`] : []),
    ...draft.procedures.filter(value => !/\n(SID|STAR)$/.test(value)),
    ...(draft.frequencyAssignments ?? []).flatMap(assignment => {
      const facility = frequencies.find(f => f.id === assignment.facilityId);
      const directions = ATIS_DIRECTIONS.filter(direction => assignment.directions.includes(direction));
      if (!facility || !directions.length) return [];
      const heading = directions.length < 3 ? directions.join(" and ") : `${directions.slice(0, -1).join(", ")} and ${directions.at(-1)}`;
      return [`contact ${facility.type} on ${facility.mhz} when ${facility.type === "approach" ? "arriving from the" : "on the"} ${heading}${facility.type === "approach" ? "" : " of the airport"}.`];
    }),
  ];
}
