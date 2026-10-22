"use client";
import {catalogFor} from "./catalog";
import {getAirport, runwayEnds} from "./airports";
import {validateControllerMessage} from "./engine";
import {runwayWind, type Action, type Aircraft, type Exercise, type Frequency, type Instruction} from "./model";

export default function GroundQuickActions({aircraft, exercise, frequency, connected, dispatch, onSent}: {
  aircraft: Aircraft; exercise: Exercise; frequency: Frequency; connected: boolean; dispatch: (action: Action) => void; onSent: () => void;
}) {
  if (frequency !== "ground" || aircraft.frequency !== frequency) return null;
  const airport = getAirport(exercise), {instructionText} = catalogFor(airport, exercise.radarEnvironment);
  const choices: {label: string; command: Instruction; color?: string}[] = aircraft.mode === "parked"
    ? (["north", "east", "south", "west"] as const).map(tail => ({label: `Pushback, Tail to the ${tail[0].toUpperCase()}${tail.slice(1)}`, command: {type: "pushback", tail}}))
    : runwayEnds(airport).map(end => ({end, wind: runwayWind(end.heading)})).sort((a, b) => ["headwind", "crosswind", "tailwind"].indexOf(a.wind) - ["headwind", "crosswind", "tailwind"].indexOf(b.wind)).map(({end, wind}) => ({label: `Taxi to Runway ${end.id}`, command: {type: "taxi", runway: end.id}, color: wind === "headwind" ? "#4bae4f" : wind === "crosswind" ? "#ff9800" : "#fc473a"}));
  if (aircraft.intentions?.taxi === "parking") choices.push({label: "Taxi to Parking", command: {type: "taxi", destination: "parking"}});
  return choices.map(({label, command, color}) => {const error = validateControllerMessage(exercise, aircraft, command, frequency); return <button key={label} role="menuitem" style={{color}} disabled={!connected || Boolean(error)} title={error ?? undefined} onClick={() => {dispatch({kind: "command", aircraftId: aircraft.id, command, frequency, text: instructionText(aircraft, command)}); onSent();}}>{label}</button>;});
}
