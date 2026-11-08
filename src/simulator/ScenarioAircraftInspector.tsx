"use client";
import {applyDepartureOrigin, departureAirports} from "./departure-airports";
import {useScopeMapData} from "./use-scope-map-data";
import type {ScopeMapData} from "./scope-map-data";
import AircraftTypeSelect from "./AircraftTypeSelect";
import {profileForType} from "./aircraft-performance";
import {FuelControls, PerformanceSummary} from "./PerformanceControls";
import {magneticHeadingLabel, magneticToTrue} from "./magnetic-headings";
import {useId, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction} from "react";
import {Info} from "@phosphor-icons/react/dist/csr/Info";
import {Trash} from "@phosphor-icons/react/dist/csr/Trash";
import {ArrowClockwise} from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import {CaretRight} from "@phosphor-icons/react/dist/csr/CaretRight";
import {Crosshair} from "@phosphor-icons/react/dist/csr/Crosshair";
import {AirplaneLanding} from "@phosphor-icons/react/dist/csr/AirplaneLanding";
import {defaultRunway, getAirport, trainingMode} from "./airports";
import {engineFor} from "./engine";
import {gatesFor, isGroundSpawn, normalizeScenarioAircraft, type ScenarioDefinition} from "./scenarios";
import {placeAircraftAtGate} from "./gate-placement";
import {radarEnvironmentFor, radarAircraft, radarTakeoffAircraft, scenarioTakeoffAircraft} from "./radar";
import {RadarSeedControls} from "./RadarControls";
import IntentionsControls from "./IntentionsControls";
import {SpeedTargetsEditor} from "./SpeedControls";
import ScenarioFlightPlan from "./ScenarioFlightPlan";
import type {Aircraft, Frequency, Leg} from "./model";
import styles from "./ScenarioAircraftInspector.module.css";

/** An input with its unit shown inside the box. */
const Unit = ({unit, children}: {unit: string; children: ReactNode}) => <span className={styles.unit}>{children}<span aria-hidden="true">{unit}</span></span>;

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
  const airport = getAirport(definition);
  const map = useScopeMapData<ScopeMapData>(airport.icao, "map", true);
  const origins = useMemo(() => departureAirports(airport, map.data), [airport, map.data]);
  const origin = origins.find(item => item.icao === (a.originDeparture?.icao ?? airport.icao));
  const spec = definition.aircraft.find(p => p.key === a.id)!;
  const ground = !a.radar && isGroundSpawn(spec.seed, airport), radarMode = trainingMode(definition);
  const patch = (value: Partial<Aircraft>) => onChange(d => ({...d, aircraft: d.aircraft.map(p => p.key === a.id ? {...p, seed: {...p.seed, ...value,
    ...(p.seed.radar && value.altitude !== undefined && !value.radar ? {radar: {...p.seed.radar, targetAltitude: undefined}} : {})}} : p)}));
  const selectTab = (next: Tab) => {setTab(next); onEditMode("");};
  const toggleMode = (mode: string) => onEditMode(editMode === mode ? "" : mode);
  const schedule = (initial: boolean) => onChange(d => ({...d, aircraft: d.aircraft.map(p => p.key === a.id ? {...p, initial} : p),
    events: initial ? d.events.map(e => ({...e, actions: e.actions.filter(action => action.type !== "spawn" || action.aircraftKey !== a.id)})).filter(e => e.actions.length)
      : [...d.events, {id: crypto.randomUUID().slice(0, 32), title: `Spawn ${a.callsign}`, trigger: {type: "time", at: 120}, actions: [{type: "spawn", aircraftKey: a.id}]}]}));
  return <div className={styles.inspector}>
    {definition.positions?.length ? <label>Starting controller position<select disabled={readOnly} value={a.positionId ?? definition.positions[0].id} onChange={e => patch({positionId: e.target.value})}>{definition.positions.map(p => <option key={p.id} value={p.id}>{p.name} · {p.mhz}</option>)}</select></label> : null}
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
      <section className={styles.panel} role="tabpanel" id={`${id}-Setup-panel`} aria-labelledby={`${id}-Setup-tab`} hidden={tab !== "Setup"}>
        <div className={styles.section}>
          <h3>Aircraft</h3>
          <label>Callsign<input value={a.callsign} maxLength={80} onChange={e => patch({callsign: e.target.value})}/></label>
          <label>Type<AircraftTypeSelect value={a.type} onChange={type => patch({type, performanceProfile: profileForType(type)})}/></label>
          <PerformanceSummary aircraft={a}/>
          <div className={styles.pair}><label>Frequency<select value={a.frequency ?? "none"} onChange={e => patch({frequency: e.target.value === "none" ? null : e.target.value as Frequency})}><option value="ground">Ground</option><option value="tower">Tower</option>{radarMode !== "local" ? <><option value="approach">Approach</option><option value="center">Center</option></> : null}<option value="none">None</option></select></label>
            <label>Appears<select value={spec.initial ? "initial" : "scheduled"} onChange={e => schedule(e.target.value === "initial")}><option value="initial">At start</option><option value="scheduled">From timeline</option></select></label></div>
        </div>
        <div className={styles.section}><h3>Fuel</h3><FuelControls aircraft={a} onEdit={patch}/></div>
        <div className={styles.section}>
          <h3>{a.radar?.departure || a.originDeparture ? "Runway departure" : ground ? spec.gateId ? "Gate placement" : "Surface placement" : "Spawn position"}</h3>
          {a.radar ? <><label>Spawn location<select value={a.radar.departure ? "takeoff" : "airborne"} onChange={e => {
            if (e.target.value === "takeoff") {
              if (!map.data) {onError(map.error ? `Airport data unavailable: ${map.error}` : "Airport data is still loading. Try again shortly."); return;}
              try {
                patch(scenarioTakeoffAircraft(a, airport, origins, map.data));
              } catch (reason) {onError((reason as Error).message);}
            } else patch({...radarAircraft(a, a.radar!.station, airport), originDeparture: undefined, radar: {...a.radar!, departure: undefined, targetAltitude: undefined, climbUntilAssigned: undefined, report: "check-in" as const}});
          }}><option value="airborne">Airborne</option><option value="takeoff">Take off</option></select></label></> : null}
          {(a.radar?.departure || a.originDeparture && !a.radar) ? <><label>Departure airport<select value={a.originDeparture?.icao ?? airport.icao} onChange={e => {const selected = origins.find(item => item.icao === e.target.value); if (!selected) return; try {const base = a.radar ? radarTakeoffAircraft(a, airport, selected.icao === airport.icao ? selected.runways[0].id : defaultRunway(airport)) : structuredClone(a); if (base.radar && a.radar) base.radar = {...base.radar, navigation: a.radar.navigation, routeIndex: a.radar.routeIndex}; patch(applyDepartureOrigin(base, airport, selected, selected.runways[0].id));} catch (reason) {onError((reason as Error).message);}}}>{!origin && a.originDeparture ? <option value={a.originDeparture.icao}>{a.originDeparture.icao} · Saved</option> : null}{origins.map(item => <option key={item.icao} value={item.icao}>{item.icao} · {item.name}</option>)}</select></label><label>Departure runway<select value={a.originDeparture?.runway ?? a.runway ?? defaultRunway(airport)} onChange={e => {if (!origin) return; try {const base = a.radar ? radarTakeoffAircraft(a, airport, origin.icao === airport.icao ? e.target.value : defaultRunway(airport)) : structuredClone(a); if (base.radar && a.radar) base.radar = {...base.radar, navigation: a.radar.navigation, routeIndex: a.radar.routeIndex}; patch(applyDepartureOrigin(base, airport, origin, e.target.value));} catch (reason) {onError((reason as Error).message);}}}>{!origin && a.originDeparture ? <option value={a.originDeparture.runway}>{a.originDeparture.runway}</option> : null}{(origin?.runways ?? []).map(end => <option key={end.id} value={end.id}>Runway {end.id}</option>)}</select></label></> : null}
          {a.radar?.departure || a.originDeparture ? <p className={styles.hint}>{a.radar ? "Automatic takeoff, then radar check-in at 1,000 ft above the departure airport." : `Automatic takeoff, then climb to 1,500 ft above ${airport.icao} and fly to its overhead.`}</p> : ground && spec.gateId ? <><label><span className={styles.srOnly}>Gate</span><select value={spec.gateId ?? ""} onChange={e => {const gateId = e.target.value; onChange(d => ({...d, aircraft: d.aircraft.map(p => p.key === a.id ? placeAircraftAtGate(p, gateId, airport) : p)}));}}>{gatesFor(airport).map(g => <option key={g.id} value={g.id}>Gate {g.name || g.id}</option>)}</select></label>
            <p className={styles.hint}><Info size={19} aria-hidden="true"/>Drag onto a blue gate dot</p></> : <>
            <div className={styles.pair}><label>East<Unit unit="NM"><input type="number" step=".01" aria-label="East (NM)" value={a.position.x} onChange={e => patch({position: {...a.position, x: Number(e.target.value)}})}/></Unit></label><label>North<Unit unit="NM"><input type="number" step=".01" aria-label="North (NM)" value={a.position.y} onChange={e => patch({position: {...a.position, y: Number(e.target.value)}})}/></Unit></label></div>
            <div className={ground ? styles.actions : `${styles.actions} ${styles.actionPair}`}><button type="button" aria-pressed={editMode === "position"} onClick={() => toggleMode("position")}><Crosshair size={17} aria-hidden="true"/>Place on scope</button>
            {!ground ? <button type="button" title="Place on runway approach" onClick={() => {const g = engineFor(definition).runwayGeometry(a.runway ?? defaultRunway(airport)); patch({position: {x: g.threshold.x - g.vector.x * 5, y: g.threshold.y - g.vector.y * 5}, heading: g.heading, targetHeading: g.heading, speed: 160, targetSpeed: 160, altitude: airport.elevation + 1500, mode: "heading"});}}><AirplaneLanding size={17} aria-hidden="true"/>On approach</button> : null}</div>
          </>}
          <div className={styles.headingRow}><label>Heading<Unit unit="°M"><input type="number" min={0} max={360} step={1} aria-label="Heading °M" disabled={!!a.radar?.departure || !!a.originDeparture} value={magneticHeadingLabel(a.heading, airport)} onChange={e => patch({heading: magneticToTrue(Number(e.target.value), airport), targetHeading: magneticToTrue(Number(e.target.value), airport)})}/></Unit></label>
            <button type="button" aria-label="Reverse heading" disabled={!!a.radar?.departure || !!a.originDeparture} onClick={() => patch({heading: (a.heading + 180) % 360, targetHeading: (a.heading + 180) % 360})}><ArrowClockwise size={17} aria-hidden="true"/>Reverse</button></div>
          {a.radar?.departure || a.originDeparture ? <p className={styles.help}>Heading follows the departure runway.</p> : null}
        </div>
        <details className={styles.advanced}><summary><span>Initial state</span><small>{a.radar?.departure || a.originDeparture ? "Set by the departure" : ground ? "On the ground" : `${a.speed} kt · ${Math.round(a.altitude - (altitudeReference === "agl" ? airport.elevation : 0)).toLocaleString()} ft ${altitudeReference.toUpperCase()}`}</small><CaretRight size={16} aria-hidden="true"/></summary><div className={styles.section}>
          <label>Behaviour<select disabled={radarMode !== "local" || !!a.originDeparture} value={a.mode} onChange={e => {const mode = e.target.value as Aircraft["mode"]; onChange(d => ({...d, aircraft: d.aircraft.map(p => p.key === a.id ? normalizeScenarioAircraft({...p, seed: {...p.seed, mode, speed: mode === "parked" ? 0 : 160, targetSpeed: mode === "parked" ? 0 : 160, altitude: mode === "parked" ? airport.elevation : airport.elevation + 1500}}, airport) : p)}));}}><option value="parked">At a gate</option><option value="heading">Fly heading</option><option value="pattern">Fly pattern</option>{!["parked", "heading", "pattern"].includes(a.mode) ? <option value={a.mode}>{a.mode}</option> : null}</select></label>
          <label>Speed (IAS)<Unit unit="kt"><input aria-label="Initial IAS (kt)" disabled={ground || !!a.radar?.departure || !!a.originDeparture} type="number" min={0} max={600} value={a.speed} onChange={e => patch({speed: Number(e.target.value), targetSpeed: Number(e.target.value), ...(a.radar ? {radar: {...a.radar, inboundSpeed: Number(e.target.value)}} : {})})}/></Unit></label>
          <div className={styles.headingRow}><label>Altitude<Unit unit="ft"><input aria-label="Altitude ft" disabled={ground || !!a.radar?.departure || !!a.originDeparture} type="number" min={altitudeReference === "agl" ? 1 : airport.elevation + 1} max={altitudeReference === "agl" ? 60000 - airport.elevation : 60000} value={Math.round(a.altitude - (altitudeReference === "agl" ? airport.elevation : 0))} onChange={e => patch({altitude: Math.max(airport.elevation + 1, Number(e.target.value) + (altitudeReference === "agl" ? airport.elevation : 0))})}/></Unit></label>
            <fieldset className={styles.toggle}><legend className={styles.srOnly}>Altitude reference</legend>{(["agl", "msl"] as const).map(value => <label key={value}><input type="radio" name={`${id}-altitude-reference`} checked={altitudeReference === value} onChange={() => setAltitudeReference(value)}/>{value.toUpperCase()}</label>)}</fieldset></div>
        </div></details>
      </section>
      <section className={styles.panel} role="tabpanel" id={`${id}-Intentions-panel`} aria-labelledby={`${id}-Intentions-tab`} hidden={tab !== "Intentions"}>
        {a.radar ? <RadarSeedControls aircraft={a} airport={airport} environment={definition.radarEnvironment ?? radarEnvironmentFor(airport)} onEdit={patch} includeRoutes={false}/> : <>
          <div className={styles.section}><h3>Flight intentions</h3><IntentionsControls airport={airport} aircraft={a} onEdit={patch}/>
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
