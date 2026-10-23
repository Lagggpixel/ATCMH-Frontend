"use client";
import workspace from "./StaffWorkspace.module.css";
import {trueToMagnetic} from "./magnetic-headings";
import LandingOutcomeControl from "./LandingOutcomeControl";
import RouteSetup from "./RouteSetup";
import {useState} from "react";
import {getAirport} from "./airports";
import {engineFor} from "./engine";
import {ALTITUDES, altitudeLabel, radarEnvironmentFor, roundedHeading} from "./radar";
import type {Aircraft, Exercise, Instruction, RadarEnvironment} from "./model";

export function RadarSeedControls({aircraft: a, environment, onEdit, staffCompact = false}: {aircraft: Aircraft; environment: RadarEnvironment; onEdit: (patch: Partial<Aircraft>) => void | boolean | Promise<boolean>; staffCompact?: boolean}) {
  const r = a.radar;
  if (!r) return null;

  if (staffCompact) return <section className={workspace.setupSection} aria-label="Radar intentions"><div className={workspace.setupForm}>
    <LandingOutcomeControl compact value={a.landing} onChange={landing => onEdit({landing})}/>
    <label>Initial guidance<select value={r.navigation} onChange={e => onEdit({radar: {...r, navigation: e.target.value as "heading" | "route", routeIndex: 0, cleared: undefined, captured: false}})}><option value="heading">Fly heading</option><option value="route" disabled={!a.flightPlan.length}>Follow route</option>{!["heading", "route"].includes(r.navigation) ? <option value={r.navigation}>{r.navigation}</option> : null}</select></label>
    <label>Expected approach<select value={r.expected ?? ""} onChange={e => onEdit({radar: {...r, expected: e.target.value || undefined, cleared: undefined, captured: false}})}><option value="">None</option>{environment.approaches.map(p => <option key={p.id} value={p.id}>{p.type.toUpperCase()} · Runway {p.runway}</option>)}</select></label>
  </div><p>Pilot intentions do not grant an ATC clearance.</p><details className={workspace.advanced}><summary>Advanced intentions</summary><div>
    <label>Arrival STAR<input maxLength={100} value={a.arrivalProcedure ?? ""} onChange={event => onEdit({arrivalProcedure: event.target.value.trim() || undefined})} placeholder="Optional procedure name"/></label>
    <label><input type="checkbox" checked={r.report === "check-in"} onChange={e => onEdit({radar: {...r, report: e.target.checked ? "check-in" : undefined}})}/>Check in automatically at Start/spawn</label>
  </div></details></section>;

  return <section aria-label="Radar navigation setup"><h3>Radar navigation</h3><LandingOutcomeControl value={a.landing} onChange={landing => onEdit({landing})}/>
    <label>Initial guidance<select value={r.navigation} onChange={e => onEdit({radar: {...r, navigation: e.target.value as "heading" | "route", routeIndex: 0, cleared: undefined, captured: false}})}><option value="heading">Fly heading</option><option value="route" disabled={!a.flightPlan.length}>Follow route</option>{!["heading", "route"].includes(r.navigation) ? <option value={r.navigation}>{r.navigation}</option> : null}</select></label>
    <label>Expected approach<select value={r.expected ?? ""} onChange={e => onEdit({radar: {...r, expected: e.target.value || undefined, cleared: undefined, captured: false}})}><option value="">None</option>{environment.approaches.map(p => <option key={p.id} value={p.id}>{p.type.toUpperCase()} · Runway {p.runway}</option>)}</select></label>
    <label>Arrival STAR<input maxLength={100} value={a.arrivalProcedure ?? ""} onChange={event => onEdit({arrivalProcedure: event.target.value.trim() || undefined})} placeholder="Optional procedure name"/></label>
    <label>Append fix to route<select value="" disabled={a.flightPlan.length >= 200} onChange={e => {const fix = environment.fixes.find(p => p.id === e.target.value); if (fix && a.flightPlan.length < 200) onEdit({flightPlan: [...a.flightPlan, {...fix.point}]});}}><option value="">{a.flightPlan.length >= 200 ? "Route limit reached (200 fixes)" : "Choose fix"}</option>{environment.fixes.map(f => <option key={f.id} value={f.id}>{f.id}</option>)}</select></label>
    <RouteSetup aircraft={a} onEdit={onEdit}/>
    <label><input type="checkbox" checked={r.report === "check-in"} onChange={e => onEdit({radar: {...r, report: e.target.checked ? "check-in" : undefined}})}/>Check in automatically at Start/spawn</label>
  </section>;
}
export function RadarStaffControls({aircraft, exercise, onManeuver, staffView}: {aircraft: Aircraft; exercise: Exercise; onManeuver: (command: Instruction) => void; staffView?: "flight" | "navigation"}) {
  const [heading, setHeading] = useState(String(roundedHeading(trueToMagnetic(aircraft.targetHeading, getAirport(exercise)))));
  const [altitude, setAltitude] = useState(aircraft.radar?.targetAltitude ? altitudeLabel(aircraft.radar.targetAltitude) : altitudeLabel(ALTITUDES.find(a => (a.unit === "feet" ? a.value : a.value * 100) >= aircraft.altitude) ?? ALTITUDES[0]));
  const [speed, setSpeed] = useState(String(Math.round(aircraft.targetSpeed)));
  const environment = exercise.radarEnvironment ?? radarEnvironmentFor(getAirport(exercise));
  const command: Instruction = {type: "vector", heading: roundedHeading(Number(heading)), altitude: ALTITUDES.find(a => altitudeLabel(a) === altitude)};
  const invalid = engineFor(exercise).validateAssignment(aircraft, command);
  if (staffView === "flight") return <section className={workspace.flightSection} aria-label="Radar flight controls"><div className={workspace.flightForm}>
    <div className={workspace.vectorGroup}>
      <label>Heading (°M)<input aria-label="Heading override" type="number" min="0" max="360" step="10" value={heading} onChange={e => setHeading(e.target.value)}/></label>
      <label>Altitude<select aria-label="Assigned altitude" value={altitude} onChange={e => setAltitude(e.target.value)}>{ALTITUDES.map(a => <option key={altitudeLabel(a)}>{altitudeLabel(a)}</option>)}</select></label>
      <button className={workspace.primary} disabled={!heading.trim() || !!invalid} title={invalid ?? undefined} onClick={() => onManeuver(command)}>Assign heading & altitude</button>
    </div>
    <div className={workspace.speedGroup}><label>Speed (kt)<input aria-label="Speed override" type="number" min="80" max="600" value={speed} onChange={e => setSpeed(e.target.value)}/></label><button disabled={!speed.trim() || Number(speed) < 80 || Number(speed) > 600} onClick={() => onManeuver({type: "speed", value: Number(speed)})}>Assign speed</button></div>
  </div><p>Staff override · changes aircraft movement.</p></section>;
  return <section aria-label="Radar flight controls"><h2>Radar flight controls</h2><p>{aircraft.radar?.navigation} · {aircraft.radar?.captured ? "Established" : aircraft.radar?.cleared ? "Approach cleared" : "Approach not cleared"}</p>
    <label>Heading (°M)<input type="number" min="0" max="360" step="10" value={heading} onChange={e => setHeading(e.target.value)}/></label>
    <label>Assigned altitude<select value={altitude} onChange={e => setAltitude(e.target.value)}>{ALTITUDES.map(a => <option key={altitudeLabel(a)}>{altitudeLabel(a)}</option>)}</select></label>
    <button disabled={!heading || !!invalid} title={invalid ?? undefined} onClick={() => onManeuver(command)}>Assign heading & altitude</button>
    <button disabled={!heading || !aircraft.radar?.expected || !!engineFor(exercise).validateAssignment(aircraft, {...command, approachId: aircraft.radar?.expected})} onClick={() => onManeuver({...command, approachId: aircraft.radar!.expected})}>Clear for expected approach</button>
    <button disabled={!!engineFor(exercise).validateAssignment(aircraft, {type: "missed-approach", altitude: command.altitude!})} onClick={() => onManeuver({type: "missed-approach", altitude: command.altitude!})}>Execute missed approach</button>
    <label>Speed (knots)<input type="number" min="80" max="600" value={speed} onChange={e => setSpeed(e.target.value)}/></label><button disabled={!speed || Number(speed) < 80 || Number(speed) > 600} onClick={() => onManeuver({type: "speed", value: Number(speed)})}>Assign speed</button>
    <label>Expect approach<select value={aircraft.radar?.expected ?? ""} onChange={e => onManeuver({type: "expect-approach", approachId: e.target.value || null})}><option value="">None</option>{environment.approaches.map(p => <option key={p.id} value={p.id}>{p.type.toUpperCase()} · Runway {p.runway}</option>)}</select></label>
    <button disabled={!aircraft.flightPlan.length} onClick={() => onManeuver({type: "route", index: Math.min(aircraft.radar?.routeIndex ?? 0, aircraft.flightPlan.length - 1)})}>Resume route</button>
  </section>;
}
