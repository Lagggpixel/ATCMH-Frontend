"use client";
import {useState} from "react";
import {getAirport} from "./airports";
import {engineFor} from "./engine";
import {ALTITUDES, altitudeLabel, radarEnvironmentFor, roundedHeading} from "./radar";
import type {Aircraft, Exercise, Instruction, RadarEnvironment} from "./model";

export function RadarSeedControls({aircraft: a, environment, onEdit}: {aircraft: Aircraft; environment: RadarEnvironment; onEdit: (patch: Partial<Aircraft>) => void}) {
  const r = a.radar;
  if (!r) return null;
  return <section aria-label="Radar navigation setup"><h3>Radar navigation</h3>
    <label>Initial guidance<select value={r.navigation} onChange={e => onEdit({radar: {...r, navigation: e.target.value as "heading" | "route", routeIndex: 0, cleared: undefined, captured: false}})}><option value="heading">Fly heading</option><option value="route" disabled={!a.flightPlan.length}>Follow route</option>{!["heading", "route"].includes(r.navigation) ? <option value={r.navigation}>{r.navigation}</option> : null}</select></label>
    <label>Expected approach<select value={r.expected ?? ""} onChange={e => onEdit({radar: {...r, expected: e.target.value || undefined, cleared: undefined, captured: false}})}><option value="">None</option>{environment.approaches.map(p => <option key={p.id} value={p.id}>{p.type.toUpperCase()} · Runway {p.runway}</option>)}</select></label>
    <label>Append fix to route<select value="" onChange={e => {const fix = environment.fixes.find(p => p.id === e.target.value); if (fix) onEdit({flightPlan: [...a.flightPlan, {...fix.point}]});}}><option value="">Choose fix</option>{environment.fixes.map(f => <option key={f.id} value={f.id}>{f.id}</option>)}</select></label>
    <ol>{a.flightPlan.map((point, index) => <li key={index}>Waypoint {index + 1}: {point.x.toFixed(1)} E, {point.y.toFixed(1)} N <button type="button" onClick={() => onEdit({flightPlan: a.flightPlan.filter((_, i) => i !== index), radar: {...r, routeIndex: 0}})}>Remove</button></li>)}</ol>
    <label><input type="checkbox" checked={r.report === "check-in"} onChange={e => onEdit({radar: {...r, report: e.target.checked ? "check-in" : undefined}})}/>Check in automatically at Start/spawn</label>
  </section>;
}
export function RadarStaffControls({aircraft, exercise, onManeuver}: {aircraft: Aircraft; exercise: Exercise; onManeuver: (command: Instruction) => void}) {
  const [heading, setHeading] = useState(String(roundedHeading(aircraft.targetHeading)));
  const [altitude, setAltitude] = useState(aircraft.radar?.targetAltitude ? altitudeLabel(aircraft.radar.targetAltitude) : altitudeLabel(ALTITUDES.find(a => (a.unit === "feet" ? a.value : a.value * 100) >= aircraft.altitude) ?? ALTITUDES[0]));
  const [speed, setSpeed] = useState(String(Math.round(aircraft.targetSpeed)));
  const environment = exercise.radarEnvironment ?? radarEnvironmentFor(getAirport(exercise));
  const command: Instruction = {type: "vector", heading: roundedHeading(Number(heading)), altitude: ALTITUDES.find(a => altitudeLabel(a) === altitude)};
  const invalid = engineFor(exercise).validateAssignment(aircraft, command);
  return <section aria-label="Radar flight controls"><h2>Radar flight controls</h2><p>{aircraft.radar?.navigation} · {aircraft.radar?.captured ? "Established" : aircraft.radar?.cleared ? "Approach cleared" : "Approach not cleared"}</p>
    <label>Heading (°)<input type="number" min="0" max="360" step="10" value={heading} onChange={e => setHeading(e.target.value)}/></label>
    <label>Assigned altitude<select value={altitude} onChange={e => setAltitude(e.target.value)}>{ALTITUDES.map(a => <option key={altitudeLabel(a)}>{altitudeLabel(a)}</option>)}</select></label>
    <button disabled={!heading || !!invalid} title={invalid ?? undefined} onClick={() => onManeuver(command)}>Assign heading & altitude</button>
    <button disabled={!heading || !aircraft.radar?.expected || !!engineFor(exercise).validateAssignment(aircraft, {...command, approachId: aircraft.radar?.expected})} onClick={() => onManeuver({...command, approachId: aircraft.radar!.expected})}>Clear for expected approach</button>
    <button disabled={!!engineFor(exercise).validateAssignment(aircraft, {type: "missed-approach", altitude: command.altitude!})} onClick={() => onManeuver({type: "missed-approach", altitude: command.altitude!})}>Execute missed approach</button>
    <label>Speed (knots)<input type="number" min="80" max="600" value={speed} onChange={e => setSpeed(e.target.value)}/></label><button disabled={!speed || Number(speed) < 80 || Number(speed) > 600} onClick={() => onManeuver({type: "speed", value: Number(speed)})}>Assign speed</button>
    <label>Expect approach<select value={aircraft.radar?.expected ?? ""} onChange={e => onManeuver({type: "expect-approach", approachId: e.target.value || null})}><option value="">None</option>{environment.approaches.map(p => <option key={p.id} value={p.id}>{p.type.toUpperCase()} · Runway {p.runway}</option>)}</select></label>
    <button disabled={!aircraft.flightPlan.length} onClick={() => onManeuver({type: "route", index: Math.min(aircraft.radar?.routeIndex ?? 0, aircraft.flightPlan.length - 1)})}>Resume route</button>
  </section>;
}
