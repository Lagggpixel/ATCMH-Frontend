"use client";
import {groundReady} from "./ground-ready";
import {atisRunwayWind} from "./atis-options";
import {IF_COLORS} from "./if-colors";
import {catalogFor} from "./catalog";
import {getAirport, runwayEnds} from "./airports";
import {validateControllerMessage} from "./engine";
import type {PlanGroundTaxi} from "./GroundRouteEditor";
import {EXERCISE_WEATHER, type Action, type Aircraft, type Exercise, type Frequency, type Instruction} from "./model";

export default function GroundQuickActions({aircraft, exercise, frequency, connected, dispatch, onSent, onPlanTaxi}: {
  aircraft: Aircraft; exercise: Exercise; frequency: Frequency; connected: boolean; dispatch: (action: Action) => void; onSent: () => void;
  onPlanTaxi?: PlanGroundTaxi;
}) {
  if (frequency !== "ground" || aircraft.frequency !== frequency) return null;
  const airport = getAirport(exercise), {instructionText} = catalogFor(airport, exercise.radarEnvironment, exercise.weather);
  const choices: {label: string; command: Instruction; color?: string}[] = !groundReady(aircraft, airport)
    ? (["north", "east", "south", "west"] as const).map(tail => ({label: `Pushback, Tail to the ${tail[0].toUpperCase()}${tail.slice(1)}`, command: {type: "pushback", tail}}))
    : runwayEnds(airport).map(end => ({end, wind: atisRunwayWind(end.heading, exercise.weather ?? EXERCISE_WEATHER)})).sort((a, b) => ["headwind", "crosswind", "tailwind"].indexOf(a.wind) - ["headwind", "crosswind", "tailwind"].indexOf(b.wind)).map(({end, wind}) => ({label: `Taxi to Runway ${end.id}`, command: {type: "taxi", runway: end.id}, color: wind === "headwind" ? IF_COLORS.cleared : wind === "crosswind" ? IF_COLORS.warning : IF_COLORS.alert}));
  if (aircraft.intentions?.taxi === "parking") choices.push({label: "Taxi to Parking", command: {type: "taxi", destination: "parking"}});
  return choices.map(({label, command, color}) => {const error = validateControllerMessage(exercise, aircraft, command, frequency); return <button key={label} role="menuitem" style={{color}} disabled={!connected || Boolean(error) || command.type === "taxi" && !onPlanTaxi} title={error ?? undefined} onClick={() => {
    if (command.type === "taxi") onPlanTaxi?.(command.runway);
    else dispatch({kind: "command", aircraftId: aircraft.id, command, frequency, text: instructionText(aircraft, command)});
    onSent();
  }}>{label}</button>;});
}
