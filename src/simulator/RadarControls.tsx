"use client";
import workspace from "./StaffWorkspace.module.css";
import {trueToMagnetic} from "./magnetic-headings";
import LandingOutcomeControl from "./LandingOutcomeControl";
import NavigationPicker from "./NavigationPicker";
import RouteSetup from "./RouteSetup";
import {useState} from "react";
import {getAirport} from "./airports";
import {engineFor} from "./engine";
import {ALTITUDES, altitudeLabel, radarEnvironmentFor, radarGuidanceLabel, roundedHeading} from "./radar";
import type {Aircraft, Airport, Exercise, Instruction, RadarEnvironment} from "./model";
import RadarIntentions from "./RadarIntentions";
import {radarPerformance} from "./radar-speed";
import {sightingGeometry, sightingSampleCurrent} from "./airport-sighting";

function RadarPhaseSpeed({label, value, min, max, onChange}: {label: string; value?: number | null; min: number; max: number; onChange: (value: number | null) => void}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  return <label>{label} (kt)<input type="number" min={min} max={max} step={1} placeholder="Auto" value={draft ?? value ?? ""} aria-invalid={invalid || undefined}
    onChange={event => {setDraft(event.target.value); setInvalid(false);}}
    onBlur={event => {
      if (draft === null) return;
      if (!event.currentTarget.checkValidity()) {setInvalid(true); event.currentTarget.reportValidity(); return;}
      const next = draft.trim() === "" ? null : Number(draft);
      setInvalid(false); setDraft(null);
      if (next !== (value ?? null)) onChange(next);
    }}/>{invalid ? <small role="alert">Enter a whole speed between {min} and {max} kt, or leave blank for automatic.</small> : null}</label>;
}

export function RadarSeedControls({aircraft: a, airport, environment, onEdit, includeRoutes = true, staffCompact = false, staffView}: {aircraft: Aircraft; airport: Airport; environment: RadarEnvironment; onEdit: (patch: Partial<Aircraft>) => void | boolean | Promise<boolean>; includeRoutes?: boolean; staffCompact?: boolean; staffView?: "speeds" | "routes"}) {
  const r = a.radar;
  if (!r) return null;
  const phaseSpeeds = ([['inbound', 'Inbound speed'], ['final', 'Final speed'], ['vref', 'Landing speed']] as const).map(([key, label]) => <RadarPhaseSpeed key={`${a.id}:${key}`} label={label} min={radarPerformance(a).min} max={radarPerformance(a).max} value={a.speedTargets?.[key]} onChange={value => onEdit({speedTargets: {...a.speedTargets, [key]: value}})}/>);
  const speedBehaviour = <label>Speed behaviour<select value={a.speedMode === "manual" ? "manual" : "auto"} onChange={e => onEdit({speedMode: e.target.value as "auto" | "manual", radar: {...r, speed: undefined, inboundSpeed: r.inboundSpeed ?? a.targetSpeed}})}><option value="auto">Automatic arrival speeds</option><option value="manual">Keep fixed speed</option></select></label>;

  // Live staff Setup tasks show one concern at a time; the scenario inspector keeps the full form below.
  if (staffView === "speeds") return <section className={workspace.setupSection} aria-label="Radar speed settings">
    <div className={workspace.setupForm}>{speedBehaviour}</div>
    <div className={workspace.controlGroup}><h3>Arrival speed targets</h3><div className={workspace.setupForm}>{phaseSpeeds}</div></div>
    <p>Blank targets are automatic. Existing fixed speeds stay fixed until you select Automatic. ATC speed instructions take priority.</p>
  </section>;
  if (staffView === "routes") return <section className={workspace.setupSection} aria-label="Radar route setup">
    <div className={workspace.setupForm}><label>Initial guidance<select disabled={!!r.departure} value={r.navigation} onChange={e => onEdit({radar: {...r, navigation: e.target.value as "heading" | "route", routeIndex: 0, cleared: undefined, captured: false, localizer: false, glideslope: false, clearanceAltitudeChecked: false}})}><option value="heading">Fly heading</option><option value="route" disabled={!a.flightPlan.length}>Follow route</option>{!["heading", "route"].includes(r.navigation) ? <option value={r.navigation}>{r.navigation}</option> : null}</select></label></div>
    <NavigationPicker aircraft={a} airport={airport} onEdit={onEdit}/><RouteSetup aircraft={a} onEdit={onEdit}/>
  </section>;

  if (staffCompact) return <section className={workspace.setupSection} aria-label="Radar intentions">
    <div className={workspace.setupForm}>
      <label>Expected approach<select value={r.expected ?? ""} onChange={e => onEdit({radar: {...r, expected: e.target.value || undefined, cleared: undefined, captured: false, localizer: false, glideslope: false, clearanceAltitudeChecked: false}})}><option value="">None</option>{environment.approaches.map(p => <option key={p.id} value={p.id}>{p.type.toUpperCase()} · Runway {p.runway}</option>)}</select></label>
    </div><p>Pilot intentions do not grant an ATC clearance. Set Next landing in Flight → Approach & recovery. Speed behaviour and arrival speeds are in Speed settings.</p>
    <details className={workspace.advanced}><summary>Flight intention & arrival details</summary><div>
      <RadarIntentions aircraft={a} airport={airport} environment={environment} takeoff={!!r.departure} showLanding={false} onChange={radar => onEdit({radar})} onLandingChange={landing => onEdit({landing})}/>
      <label>Arrival STAR<input maxLength={100} value={a.arrivalProcedure ?? ""} onChange={event => onEdit({arrivalProcedure: event.target.value.trim() || undefined})} placeholder="Optional procedure name"/></label>
      {!r.departure ? <label className={workspace.check}><input type="checkbox" checked={r.report === "check-in"} onChange={e => onEdit({radar: {...r, report: e.target.checked ? "check-in" : undefined}})}/>Check in automatically at Start/spawn</label> : null}
    </div></details>
  </section>;

  return <section aria-label="Radar navigation setup"><h3>Radar navigation</h3>
    <label>Speed behaviour<select value={a.speedMode === "manual" ? "manual" : "auto"} onChange={e => onEdit({speedMode: e.target.value as "auto" | "manual", radar: {...r, speed: undefined, inboundSpeed: r.inboundSpeed ?? a.targetSpeed}})}><option value="auto">Automatic arrival speeds</option><option value="manual">Keep fixed speed</option></select></label>
    <small>Existing fixed speeds stay fixed until you select Automatic. ATC speed instructions take priority.</small>
    {([['inbound', 'Inbound speed'], ['final', 'Final speed'], ['vref', 'Landing speed']] as const).map(([key, label]) => <RadarPhaseSpeed key={`${a.id}:${key}`} label={label} min={radarPerformance(a).min} max={radarPerformance(a).max} value={a.speedTargets?.[key]} onChange={value => onEdit({speedTargets: {...a.speedTargets, [key]: value}})}/>)}
    <RadarIntentions aircraft={a} airport={airport} environment={environment} takeoff={!!r.departure} onChange={radar => onEdit({radar})} onLandingChange={landing => onEdit({landing})}/>
    {includeRoutes ? <label>Initial guidance<select disabled={!!r.departure} value={r.navigation} onChange={e => onEdit({radar: {...r, navigation: e.target.value as "heading" | "route", routeIndex: 0, cleared: undefined, captured: false, localizer: false, glideslope: false, clearanceAltitudeChecked: false}})}><option value="heading">Fly heading</option><option value="route" disabled={!a.flightPlan.length}>Follow route</option>{!["heading", "route"].includes(r.navigation) ? <option value={r.navigation}>{r.navigation}</option> : null}</select></label> : null}
    <label>Expected approach<select value={r.expected ?? ""} onChange={e => onEdit({radar: {...r, expected: e.target.value || undefined, cleared: undefined, captured: false, localizer: false, glideslope: false, clearanceAltitudeChecked: false}})}><option value="">None</option>{environment.approaches.map(p => <option key={p.id} value={p.id}>{p.type.toUpperCase()} · Runway {p.runway}</option>)}</select></label>
    <label>Arrival STAR<input maxLength={100} value={a.arrivalProcedure ?? ""} onChange={event => onEdit({arrivalProcedure: event.target.value.trim() || undefined})} placeholder="Optional procedure name"/></label>
    {includeRoutes ? <><NavigationPicker aircraft={a} airport={airport} onEdit={onEdit}/><RouteSetup aircraft={a} onEdit={onEdit}/></> : null}
    {!r.departure ? <label><input type="checkbox" checked={r.report === "check-in"} onChange={e => onEdit({radar: {...r, report: e.target.checked ? "check-in" : undefined}})}/>Check in automatically at Start/spawn</label> : null}
  </section>;
}
export function RadarStaffControls({aircraft, exercise, onManeuver, staffView}: {aircraft: Aircraft; exercise: Exercise; onManeuver: (command: Instruction) => void; staffView?: "flight" | "navigation"}) {
  const [heading, setHeading] = useState(String(roundedHeading(trueToMagnetic(aircraft.targetHeading, getAirport(exercise)))));
  const [altitude, setAltitude] = useState(aircraft.radar?.targetAltitude ? altitudeLabel(aircraft.radar.targetAltitude) : altitudeLabel(ALTITUDES.find(a => (a.unit === "feet" ? a.value : a.value * 100) >= aircraft.altitude) ?? ALTITUDES[0]));
  const [speed, setSpeed] = useState(String(Math.round(aircraft.targetSpeed)));
  const environment = exercise.radarEnvironment ?? radarEnvironmentFor(getAirport(exercise));
  const command: Instruction = {type: "vector", heading: roundedHeading(Number(heading)), altitude: ALTITUDES.find(a => altitudeLabel(a) === altitude)};
  const invalid = engineFor(exercise).validateAssignment(aircraft, command);
  const sightingStatus = !sightingGeometry(aircraft, getAirport(exercise)) ? "waiting for a view of the airport"
    : !sightingSampleCurrent(aircraft, getAirport(exercise), exercise.elapsed) || aircraft.airportSighting?.terrain?.status === "unavailable" ? "waiting for terrain information; manual pilot report available"
    : aircraft.airportSighting?.terrain?.status === "blocked" ? "obstructed by terrain" : `looking for airport (${Math.floor(aircraft.airportSighting?.seconds ?? 0)}/3 seconds)`;
  const clearance = {...command, approachId: aircraft.radar?.expected};
  const clearanceError = !aircraft.radar?.expected ? "Choose an expected approach first." : engineFor(exercise).validateAssignment(aircraft, clearance);
  const missedError = engineFor(exercise).validateAssignment(aircraft, {type: "missed-approach", altitude: command.altitude!});
  const unable = aircraft.radar?.patternJoin?.status === "unable";
  const headingField = <label>Heading (°M)<input aria-label="Heading override" type="number" min="0" max="360" step="10" value={heading} onChange={e => setHeading(e.target.value)}/></label>;
  const altitudeField = <label>{staffView === "flight" ? "Altitude" : "Assigned altitude"}<select aria-label="Assigned altitude" value={altitude} onChange={e => setAltitude(e.target.value)}>{ALTITUDES.map(a => <option key={altitudeLabel(a)}>{altitudeLabel(a)}</option>)}</select></label>;
  if (staffView === "flight") return <section className={workspace.flightSection} aria-label="Radar flight controls"><div className={workspace.flightForm}>
    <div className={workspace.controlGroup}><h3>Vector</h3><div className={workspace.vectorGroup}>
      {headingField}{altitudeField}
      <button className={workspace.primary} disabled={!heading.trim() || !!invalid} title={invalid ?? undefined} onClick={() => onManeuver(command)}>Assign heading & altitude</button>
    </div></div>
    <div className={workspace.controlGroup}><h3>Speed</h3><div className={workspace.speedGroup}><label>Speed (kt)<input aria-label="Speed override" type="number" min="80" max="600" value={speed} onChange={e => setSpeed(e.target.value)}/></label><button disabled={!speed.trim() || Number(speed) < 80 || Number(speed) > 600} onClick={() => onManeuver({type: "speed", value: Number(speed)})}>Assign speed</button></div></div>
  </div><p>Staff override · changes aircraft movement without a radio call. Heading/altitude and speed are assigned separately.</p>{invalid && heading.trim() ? <p role="status">{invalid}</p> : null}{unable ? <p role="alert">{radarGuidanceLabel(aircraft, environment)} · Retry pattern join in Approach & recovery.</p> : null}{aircraft.reportAirportInSight ? <p role="status">Airport sighting: {sightingStatus}.</p> : null}</section>;
  return <section className={workspace.flightSection} aria-label="Radar flight controls"><p className={workspace.statusLine} aria-label="Approach guidance" role={unable ? "alert" : undefined}>{radarGuidanceLabel(aircraft, environment)}</p>
    {aircraft.reportAirportInSight ? <p role="status">Airport sighting: {sightingStatus}.</p> : null}
    <div className={workspace.flightForm}>
      <div className={workspace.controlGroup}><h3>Approach clearance</h3><div className={workspace.vectorGroup}>
        <label>Expect approach<select value={aircraft.radar?.expected ?? ""} onChange={e => onManeuver({type: "expect-approach", approachId: e.target.value || null})}><option value="">None</option>{environment.approaches.map(p => <option key={p.id} value={p.id}>{p.type.toUpperCase()} · Runway {p.runway}</option>)}</select></label>
        {headingField}{altitudeField}
        <button className={workspace.primary} disabled={!heading || !!clearanceError} title={clearanceError ?? undefined} onClick={() => onManeuver({...command, approachId: aircraft.radar!.expected})}>Clear for expected approach</button>
      </div></div>
      <LandingOutcomeControl compact value={aircraft.landing} onChange={outcome => onManeuver({type: "outcome", outcome})}/>
      <div className={workspace.controlGroup}><h3>Recovery</h3><div className={workspace.actionRow}>
        <button disabled={!!missedError} title={missedError ?? "Climbs to the assigned altitude"} onClick={() => onManeuver({type: "missed-approach", altitude: command.altitude!})}>Execute missed approach</button>
        <button disabled={!aircraft.flightPlan.length} title={aircraft.flightPlan.length ? undefined : "No flight plan"} onClick={() => onManeuver({type: "route", index: Math.min(aircraft.radar?.routeIndex ?? 0, aircraft.flightPlan.length - 1)})}>Resume route</button>
        <button onClick={() => onManeuver({type: "radar-speed", mode: "discretion"})}>Resume automatic speeds</button>
        {unable ? <button onClick={() => onManeuver({type: "frequency", frequency: "tower"})}>Retry pattern join</button> : null}
      </div></div>
    </div>
    <p>The clearance uses the heading and altitude above. Missed approach climbs to the assigned altitude. Vectors and speed are in Vectors & speed.</p>
  </section>;
}
