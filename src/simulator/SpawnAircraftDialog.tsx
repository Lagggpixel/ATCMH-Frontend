"use client";
import {departureAirports} from "./departure-airports";
import {useScopeMapData} from "./use-scope-map-data";
import type {ScopeMapData} from "./scope-map-data";
import AircraftTypeSelect from "./AircraftTypeSelect";
import {AIRCRAFT_PERFORMANCE} from "./aircraft-performance";
import {useEffect, useMemo, useRef, useState} from "react";
import {getAirport, trainingMode} from "./airports";
import {exerciseCallsigns, randomCallsign} from "./callsigns";
import {engineFor} from "./engine";
import {radarEnvironmentFor} from "./radar";
import {MAX_AIRCRAFT, type Action, type Exercise, type Point, type RadarState} from "./model";
import {createSpawnAircraft} from "./spawn-aircraft";
import {readSpawnPreferences, saveSpawnPreferences} from "./spawn-preferences";
import LocalAircraftDialog from "./LocalAircraftDialog";
import RadarIntentions from "./RadarIntentions";
import styles from "./Simulator.module.css";

export type StaffDispatch = (action: Action) => void | boolean | Promise<boolean>;
function RadarSpawnAircraftDialog({accountId, exercise, position, originIcao, enabled, dispatch, onSpawned, onClose}: {
  accountId: string; exercise: Exercise; position?: Point; originIcao?: string; enabled: boolean; dispatch: StaffDispatch; onSpawned: (id: string) => void; onClose: () => void;
}) {
  const airport = getAirport(exercise), mode = trainingMode(exercise), environment = exercise.radarEnvironment ?? radarEnvironmentFor(airport);
  const map = useScopeMapData<ScopeMapData>(airport.icao, "map", true);
  const origins = useMemo(() => departureAirports(airport, map.data), [airport, map.data]);
  const [originCode, setOriginCode] = useState(originIcao ?? airport.icao);
  const origin = origins.find(item => item.icao === originCode);
  const seed = engineFor(exercise).newAircraft("preview", true);
  const [defaults] = useState(() => readSpawnPreferences(accountId, exercise));
  const [airborne, setAirborne] = useState(originIcao ? false : defaults.airborne), [runway, setRunway] = useState(defaults.runway);
  const [callsign, setCallsign] = useState(() => randomCallsign(exerciseCallsigns(exercise))), [type, setType] = useState("A320");
  const [heading, setHeading] = useState(defaults.heading), [altitude, setAltitude] = useState(defaults.altitude), [speed, setSpeed] = useState(defaults.speed);
  const [intentions, setIntentions] = useState<Pick<RadarState, "requestedApproach" | "departureDirection"> & {flight: "return" | "departure"}>({flight: defaults.flight, requestedApproach: defaults.requestedApproach, departureDirection: defaults.departureDirection});
  const [landing, setLanding] = useState(defaults.landing), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false);
  useEffect(() => {const node = dialog.current, previous = document.activeElement; node?.showModal(); return () => {node?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus();};}, []);
  const sample = {...seed, landing, radar: {...seed.radar!, ...intentions}};
  return <dialog ref={dialog} className={styles.addTrafficDialog} aria-labelledby="spawn-aircraft-title" onCancel={event => {if (pending.current) event.preventDefault(); else onClose();}} onKeyDown={event => event.stopPropagation()}>
    <form className={styles.addAircraft} onSubmit={async event => {
      event.preventDefault(); if (!enabled || pending.current) return; pending.current = true; setBusy(true); setError("");
      try {
        if (!airborne && !origin) throw new Error("Departure airport data is unavailable.");
        const selectedRunway = origin?.runways.some(end => end.id === runway) ? runway : origin?.runways[0]?.id;
        const aircraft = createSpawnAircraft(exercise, crypto.randomUUID(), {airborne, runway: selectedRunway, origin, position, callsign, type, heading, altitude, speed, landing, ...intentions});
        const action: Action = {kind: "spawn", aircraft};
        const invalid = engineFor(exercise).applyEnvelope(exercise, {id: crypto.randomUUID(), time: 0, action}).error;
        if (invalid) throw new Error(invalid);
        if (await dispatch(action) === false) throw new Error("Aircraft was not spawned. Check the session connection and try again.");
        saveSpawnPreferences(accountId, exercise, {airborne, runway, heading, altitude, speed, landing, ...intentions});
        onSpawned(aircraft.id); onClose();
      } catch (reason) {setError(reason instanceof Error ? reason.message : "Aircraft could not be spawned.");}
      finally {pending.current = false; setBusy(false);}
    }}><h2 id="spawn-aircraft-title">Spawn aircraft</h2>
      {position && airborne ? <p>Position: {position.x.toFixed(2)} NM east, {position.y.toFixed(2)} NM north</p> : null}
      <label>Callsign<input required maxLength={60} value={callsign} onChange={event => setCallsign(event.target.value)}/></label>
      <label>Aircraft type<AircraftTypeSelect value={type} onChange={type => {setType(type);const p=AIRCRAFT_PERFORMANCE.find(p=>p.id===type);setSpeed(p?.inbound ?? 250);setAltitude(value=>Math.min(value,p?.ceiling ?? 43000));}}/></label>
      <label>Spawn location<select aria-label="Spawn location" value={airborne ? "air" : "ground"} onChange={event => setAirborne(event.target.value === "air")}><option value="air">Airborne{position ? " at clicked position" : ""}</option><option value="ground">Take off</option></select></label>
      {!airborne ? <label>Departure airport<select aria-label="Departure airport" value={originCode} onChange={event => {const code = event.target.value; setOriginCode(code); setRunway(origins.find(item => item.icao === code)?.runways[0]?.id ?? "");}}>{!origin ? <option value={originCode}>{originCode} · Loading…</option> : null}{origins.map(item => <option key={item.icao} value={item.icao}>{item.icao} · {item.name}</option>)}</select></label> : null}
      {!airborne && map.error ? <p role="status">Nearby airports are unavailable. The controlled airport remains available.</p> : null}
      {airborne ? <><label>Heading (°M)<input required type="number" min={0} max={360} value={heading} onChange={event => setHeading(Number(event.target.value))}/></label><label>Altitude (ft MSL)<input required type="number" min={airport.elevation + 1} max={AIRCRAFT_PERFORMANCE.find(p=>p.id===type)?.ceiling??65000} value={altitude} onChange={event => setAltitude(Number(event.target.value))}/></label><label>Speed (knots)<input required type="number" min={AIRCRAFT_PERFORMANCE.find(p=>p.id===type)?.min??80} max={AIRCRAFT_PERFORMANCE.find(p=>p.id===type)?.max??600} value={speed} onChange={event => setSpeed(Number(event.target.value))}/></label></> : <label>Departure runway<select aria-label="Departure runway" value={origin?.runways.some(end => end.id === runway) ? runway : origin?.runways[0]?.id ?? ""} onChange={event => setRunway(event.target.value)}>{(origin?.runways ?? []).map(end => <option key={end.id} value={end.id}>Runway {end.id}</option>)}</select></label>}
      {mode !== "local" ? <RadarIntentions aircraft={sample} airport={airport} environment={environment} takeoff={!airborne} onChange={radar => setIntentions({flight: radar.flight ?? "return", requestedApproach: radar.requestedApproach, departureDirection: radar.departureDirection})} onLandingChange={setLanding}/> : null}
      {error ? <p role="alert">{error}</p> : null}<div className={styles.buttonRow}><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={!enabled || busy || exercise.aircraft.length >= MAX_AIRCRAFT || !airborne && !origin}>{busy ? "Spawning…" : "Spawn aircraft"}</button></div>
    </form>
  </dialog>;
}

export default function SpawnAircraftDialog(props: Parameters<typeof RadarSpawnAircraftDialog>[0]) {
  if (trainingMode(props.exercise) !== "local") return <RadarSpawnAircraftDialog {...props}/>;
  return <LocalAircraftDialog selection={props.exercise} aircraft={props.exercise.aircraft} callsigns={exerciseCallsigns(props.exercise)} accountId={props.accountId} position={props.position} originIcao={props.originIcao} enabled={props.enabled} onClose={props.onClose} onAdd={async aircraft => {
    const action: Action = {kind: "spawn", aircraft};
    const invalid = engineFor(props.exercise).applyEnvelope(props.exercise, {id: crypto.randomUUID(), time: 0, action}).error;
    if (invalid) throw new Error(invalid);
    if (await props.dispatch(action) === false) return false;
    props.onSpawned(aircraft.id); return true;
  }}/>;
}
