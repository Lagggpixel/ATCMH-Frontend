"use client";
import AircraftTypeSelect from "./AircraftTypeSelect";
import {profileForType} from "./aircraft-performance";
import PerformanceControls from "./PerformanceControls";
import {magneticHeadingLabel, magneticToTrue} from "./magnetic-headings";
import {useId, useState, type Dispatch, type SetStateAction} from "react";
import {Info} from "@phosphor-icons/react/dist/csr/Info";
import {Trash} from "@phosphor-icons/react/dist/csr/Trash";
import {ArrowClockwise} from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import {CaretRight} from "@phosphor-icons/react/dist/csr/CaretRight";
import {defaultRunway, getAirport, trainingMode, runwayEnds} from "./airports";
import {engineFor} from "./engine";
import {gatesFor, isGroundSpawn, normalizeScenarioAircraft, type ScenarioDefinition} from "./scenarios";
import {placeAircraftAtGate} from "./gate-placement";
import {radarEnvironmentFor, radarAircraft, radarTakeoffAircraft} from "./radar";
import {RadarSeedControls} from "./RadarControls";
import IntentionsControls from "./IntentionsControls";
import {SpeedTargetsEditor} from "./SpeedControls";
import ScenarioFlightPlan from "./ScenarioFlightPlan";
import type {Aircraft, Frequency, Leg} from "./model";
import styles from "./ScenarioAircraftInspector.module.css";

const tabs = ["Setup", "Intentions", "Routes"] as const;
type Tab = typeof tabs[number];
interface Props {
  readOnly?: boolean; definition: ScenarioDefinition; aircraft: Aircraft;
  onChange: Dispatch<SetStateAction<ScenarioDefinition>>;
  onRemove: () => void; editMode: string; onEditMode: (mode: string) => void;
  onPlanTaxi: (runway: string) => void; onError: (message: string) => void;
}

export default function ScenarioAircraftInspector({readOnly = false, definition, aircraft: a, onChange, onRemove, editMode, onEditMode, onPlanTaxi, onError}: Props) {
  const id = useId(), [tab, setTab] = useState<Tab>("Setup");
  const [altitudeReference, setAltitudeReference] = useState<"agl" | "msl">("agl");
  const airport = getAirport(definition), spec = definition.aircraft.find(p => p.key === a.id)!;
  const ground = !a.radar && isGroundSpawn(spec.seed, airport), radarMode = trainingMode(definition);
  const patch = (value: Partial<Aircraft>) => onChange(d => ({...d, aircraft: d.aircraft.map(p => p.key === a.id ? {...p, seed: {...p.seed, ...value,
    ...(p.seed.radar && value.altitude !== undefined && !value.radar ? {radar: {...p.seed.radar, targetAltitude: undefined}} : {})}} : p)}));
  const selectTab = (next: Tab) => {setTab(next); onEditMode("");};
  const toggleMode = (mode: string) => onEditMode(editMode === mode ? "" : mode);
  const schedule = (initial: boolean) => onChange(d => ({...d, aircraft: d.aircraft.map(p => p.key === a.id ? {...p, initial} : p),
    events: initial ? d.events.map(e => ({...e, actions: e.actions.filter(action => action.type !== "spawn" || action.aircraftKey !== a.id)})).filter(e => e.actions.length)
      : [...d.events, {id: crypto.randomUUID().slice(0, 32), title: `Spawn ${a.callsign}`, trigger: {type: "time", at: 120}, actions: [{type: "spawn", aircraftKey: a.id}]}]}));
  return <div className={styles.inspector}>
    <header className={styles.header}><h2>{a.callsign}</h2><p>{a.type} <span aria-hidden="true">·</span> {ground ? "Ground" : a.radar ? "Radar" : "Airborne"}</p></header>
    <div className={styles.tabs} role="tablist" aria-label="Aircraft settings">
      {tabs.map(name => <button type="button" key={name} role="tab" id={`${id}-${name}-tab`} aria-controls={`${id}-${name}-panel`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1}
        onClick={() => selectTab(name)} onKeyDown={event => {
          const index = tabs.indexOf(name);
          const next = event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length] : event.key === "ArrowLeft" ? tabs[(index + tabs.length - 1) % tabs.length] : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[2] : undefined;
          if (!next) return; event.preventDefault(); selectTab(next); document.getElementById(`${id}-${next}-tab`)?.focus();
        }}>{name}</button>)}
    </div>
    <fieldset disabled={readOnly} className={styles.body}>
      {tab==="Setup"?<PerformanceControls aircraft={a} onEdit={patch}/>:null}
      <section className={styles.panel} role="tabpanel" id={`${id}-Setup-panel`} aria-labelledby={`${id}-Setup-tab`} hidden={tab !== "Setup"}>
        <div className={styles.section}>
          <label>Callsign<input value={a.callsign} maxLength={80} onChange={e => patch({callsign: e.target.value})}/></label>
          <div className={styles.pair}><label>Type<AircraftTypeSelect value={a.type} onChange={type => patch({type, performanceProfile: profileForType(type)})}/></label>
            <label>Frequency<select value={a.frequency ?? "none"} onChange={e => patch({frequency: e.target.value === "none" ? null : e.target.value as Frequency})}><option value="ground">Ground</option><option value="tower">Tower</option>{radarMode !== "local" ? <><option value="approach">Approach</option><option value="center">Center</option></> : null}<option value="none">None</option></select></label></div>
          <label>Appears<select value={spec.initial ? "initial" : "scheduled"} onChange={e => schedule(e.target.value === "initial")}><option value="initial">At Start</option><option value="scheduled">From a timeline event</option></select></label>
        </div>
        <div className={styles.section}>
          <h3>{a.radar?.departure ? "Runway departure" : ground ? spec.gateId ? "Gate placement" : "Surface placement" : "Spawn position"}</h3>
          {a.radar ? <><label>Spawn location<select value={a.radar.departure ? "takeoff" : "airborne"} onChange={e => {
            const next = e.target.value === "takeoff" ? radarTakeoffAircraft(a, airport) : {...radarAircraft(a, a.radar!.station, airport), radar: {...a.radar!, departure: undefined, targetAltitude: undefined, report: "check-in" as const}};
            patch(next);
          }}><option value="airborne">Airborne</option><option value="takeoff">Take off from {airport.icao}</option></select></label>{a.radar.departure ? <label>Departure runway<select value={a.runway ?? defaultRunway(airport)} onChange={e => patch(radarTakeoffAircraft(a, airport, e.target.value))}>{runwayEnds(airport).map(end => <option key={end.id} value={end.id}>Runway {end.id}</option>)}</select></label> : null}</> : null}
          {a.radar?.departure ? <p className={styles.hint}>Automatic takeoff, then radar check-in at 1,000 ft AGL. Set the pilot’s request in Intentions.</p> : ground && spec.gateId ? <><label><span className={styles.srOnly}>Gate</span><select value={spec.gateId ?? ""} onChange={e => {const gateId = e.target.value; onChange(d => ({...d, aircraft: d.aircraft.map(p => p.key === a.id ? placeAircraftAtGate(p, gateId, airport) : p)}));}}>{gatesFor(airport).map(g => <option key={g.id} value={g.id}>Gate {g.name || g.id}</option>)}</select></label>
            <p className={styles.hint}><Info size={19} aria-hidden="true"/>Drag onto a blue gate dot</p></> : <>
            <div className={styles.pair}><label>East (NM)<input type="number" step=".01" value={a.position.x} onChange={e => patch({position: {...a.position, x: Number(e.target.value)}})}/></label><label>North (NM)<input type="number" step=".01" value={a.position.y} onChange={e => patch({position: {...a.position, y: Number(e.target.value)}})}/></label></div>
            <button type="button" aria-pressed={editMode === "position"} onClick={() => toggleMode("position")}>Place on scope</button>
            {!ground ? <button type="button" onClick={() => {const g = engineFor(definition).runwayGeometry(a.runway ?? defaultRunway(airport)); patch({position: {x: g.threshold.x - g.vector.x * 5, y: g.threshold.y - g.vector.y * 5}, heading: g.heading, targetHeading: g.heading, speed: 160, targetSpeed: 160, altitude: airport.elevation + 1500, mode: "heading"});}}>Place on runway approach</button> : null}
          </>}
          <div className={styles.pair}><label>Heading °M<input type="number" min={0} max={360} step={1} disabled={!!a.radar?.departure} value={magneticHeadingLabel(a.heading, airport)} onChange={e => patch({heading: magneticToTrue(Number(e.target.value), airport), targetHeading: magneticToTrue(Number(e.target.value), airport)})}/></label>
            <div className={styles.alignedAction}><span>Reverse</span><button type="button" aria-label="Reverse heading" disabled={!!a.radar?.departure} onClick={() => patch({heading: (a.heading + 180) % 360, targetHeading: (a.heading + 180) % 360})}><ArrowClockwise size={17} aria-hidden="true"/>180°</button></div></div>
        </div>
        <details className={styles.advanced}><summary>Advanced initial state<CaretRight size={16} aria-hidden="true"/></summary><div className={styles.section}>
          <label>Initial behaviour<select disabled={radarMode !== "local"} value={a.mode} onChange={e => {const mode = e.target.value as Aircraft["mode"]; onChange(d => ({...d, aircraft: d.aircraft.map(p => p.key === a.id ? normalizeScenarioAircraft({...p, seed: {...p.seed, mode, speed: mode === "parked" ? 0 : 160, targetSpeed: mode === "parked" ? 0 : 160, altitude: mode === "parked" ? airport.elevation : airport.elevation + 1500}}, airport) : p)}));}}><option value="parked">At a gate</option><option value="heading">Fly heading</option><option value="pattern">Fly pattern</option>{!["parked", "heading", "pattern"].includes(a.mode) ? <option value={a.mode}>{a.mode}</option> : null}</select></label>
          <label>Initial IAS (kt)<input disabled={ground || !!a.radar?.departure} type="number" min={0} max={600} value={a.speed} onChange={e => patch({speed: Number(e.target.value), targetSpeed: Number(e.target.value), ...(a.radar ? {radar: {...a.radar, inboundSpeed: Number(e.target.value)}} : {})})}/></label>
          <div className={styles.pair}><label>Altitude ft<input disabled={ground || !!a.radar?.departure} type="number" min={altitudeReference === "agl" ? 1 : airport.elevation + 1} max={altitudeReference === "agl" ? 60000 - airport.elevation : 60000} value={Math.round(a.altitude - (altitudeReference === "agl" ? airport.elevation : 0))} onChange={e => patch({altitude: Math.max(airport.elevation + 1, Number(e.target.value) + (altitudeReference === "agl" ? airport.elevation : 0))})}/></label><label>Reference<select value={altitudeReference} onChange={e => setAltitudeReference(e.target.value as "agl" | "msl")}><option value="agl">AGL</option><option value="msl">MSL</option></select></label></div>
        </div></details>
      </section>
      <section className={styles.panel} role="tabpanel" id={`${id}-Intentions-panel`} aria-labelledby={`${id}-Intentions-tab`} hidden={tab !== "Intentions"}>
        {a.radar ? <RadarSeedControls aircraft={a} airport={airport} environment={definition.radarEnvironment ?? radarEnvironmentFor(airport)} onEdit={patch} includeRoutes={false}/> : <>
          <div className={styles.section}><h3>Flight intentions</h3><IntentionsControls airport={airport} aircraft={a} onEdit={patch}/>
            {!ground ? <button type="button" onClick={() => onChange(d => {const id = `transition-${a.id}`.slice(0, 32); return {...d, events: [...d.events.filter(e => e.id !== id), {id, title: "Request transition at Start", trigger: {type: "time", at: 0}, actions: [{type: "request", aircraftKey: a.id, requestId: "transition", runway: a.runway ?? defaultRunway(airport)}]}]};})}>Request Transition at Start</button> : null}
          </div>
          <div className={styles.section}><h3>Traffic pattern</h3><div className={styles.pair}><label>Traffic<select value={a.hand} onChange={e => patch({hand: e.target.value as "left" | "right"})}><option>left</option><option>right</option></select></label></div>
            {!ground && a.mode === "pattern" ? <label>Initial pattern leg<select value={a.leg} onChange={e => patch({leg: e.target.value as Leg})}>{["upwind", "crosswind", "downwind", "base", "final"].map(leg => <option key={leg}>{leg}</option>)}</select></label> : null}</div>
          <div className={styles.section}><h3>Phase speeds</h3><p className={styles.help}>IAS · Blank = automatic</p><SpeedTargetsEditor compact targets={a.speedTargets} onChange={speedTargets => patch({speedTargets, speedMode: "auto"})}/></div>
        </>}
      </section>
      <section className={styles.panel} role="tabpanel" id={`${id}-Routes-panel`} aria-labelledby={`${id}-Routes-tab`} hidden={tab !== "Routes"}>
        {!a.radar ? <div className={styles.section}><h3>Taxi route</h3><p className={styles.help}>Plan the route on the scope, or press and hold another aircraft and drag it. Drag the route&apos;s end or the green line to change it, tick holds, then save the route.</p><button type="button" onClick={() => {onEditMode(""); onError(""); onPlanTaxi(a.runway ?? defaultRunway(airport));}}>Plan route to Runway {a.runway ?? defaultRunway(airport)}</button>
          <button type="button" disabled={!a.taxiPath.length} onClick={() => patch({taxiPath: []})}>Clear {a.taxiPath.length} taxi points</button></div> : null}
        <ScenarioFlightPlan aircraft={a} airport={airport} onEdit={patch}/>
      </section>
    </fieldset>
    <footer className={styles.footer}><button type="button" disabled={readOnly} onClick={onRemove}><Trash size={18} aria-hidden="true"/>Remove aircraft</button></footer>
  </div>;
}
