"use client";
import {departureAirports} from "./departure-airports";
import {useScopeMapData} from "./use-scope-map-data";
import type {ScopeMapData} from "./scope-map-data";
import AircraftTypeSelect from "./AircraftTypeSelect";
import {AIRCRAFT_PERFORMANCE} from "./aircraft-performance";
import {useEffect, useId, useMemo, useRef, useState, type ReactNode} from "react";
import {AirplaneLanding} from "@phosphor-icons/react/dist/csr/AirplaneLanding";
import {AirplaneTakeoff} from "@phosphor-icons/react/dist/csr/AirplaneTakeoff";
import {ArrowsClockwise} from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import {CaretDown} from "@phosphor-icons/react/dist/csr/CaretDown";
import {ClockCounterClockwise} from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import {Crosshair} from "@phosphor-icons/react/dist/csr/Crosshair";
import {LetterCircleP} from "@phosphor-icons/react/dist/csr/LetterCircleP";
import {MapPin} from "@phosphor-icons/react/dist/csr/MapPin";
import {Shuffle} from "@phosphor-icons/react/dist/csr/Shuffle";
import {defaultRunway, getAirport, runwayEnds, type AirportSelection} from "./airports";
import {randomCallsign} from "./callsigns";
import {availableLocalGate, clearLocalSpawnPreferences, createLocalAircraft, readLocalSpawnPreferences, saveLocalSpawnPreferences, type LocalAircraftOptions, type LocalPlacement, type LocalSpawnPreferences} from "./local-aircraft";
import {gatesFor, standPlacement} from "./scenarios";
import {magneticHeadingLabel} from "./magnetic-headings";
import {engineFor} from "./engine";
import {MAX_AIRCRAFT, type Aircraft, type Point} from "./model";
import styles from "./LocalAircraftDialog.module.css";

type Call = "land" | "touch-and-go" | "transition" | "quiet";
const AIRBORNE: readonly LocalPlacement[] = ["takeoff", "final", "circuit", "custom"];

export default function LocalAircraftDialog({selection, aircraft, callsigns, position, originIcao, accountId = "", scenario = false, enabled, onAdd, onClose}: {
  selection: AirportSelection; aircraft: readonly Aircraft[]; callsigns: readonly string[]; position?: Point; originIcao?: string; accountId?: string; scenario?: boolean; enabled: boolean;
  onAdd: (aircraft: Aircraft, gateId: string | undefined, at: number) => void | boolean | Promise<boolean>; onClose: () => void;
}) {
  const titleId = useId(), airport = getAirport(selection), gates = gatesFor(airport);
  const map = useScopeMapData<ScopeMapData>(airport.icao, "map", true);
  const origins = useMemo(() => departureAirports(getAirport({airport: selection.airport, airportDataVersion: selection.airportDataVersion}), map.data), [selection.airport, selection.airportDataVersion, map.data]);
  const initial = (memory: LocalSpawnPreferences): LocalAircraftOptions => {
    const remembered = memory.placement === "gate" && !gates.length ? undefined : memory.placement;
    const placement = originIcao ? "takeoff" : position ? remembered === "ground" ? "ground" : "custom" : remembered ?? (gates.length ? "gate" : "ground");
    const type = AIRCRAFT_PERFORMANCE.some(p => p.id === memory.type) ? memory.type! : "A320";
    const runway = placement !== "takeoff" && runwayEnds(airport).some(end => end.id === memory.runway) ? memory.runway! : placement === "takeoff" ? memory.runway ?? "" : defaultRunway(airport);
    return {placement, callsign: randomCallsign(callsigns), type, runway, gateId: availableLocalGate(selection, aircraft)?.id,
      distance: memory.distance ?? 5, leg: memory.leg ?? "downwind", hand: "left", height: memory.height ?? 1500, speed: memory.speed ?? "auto",
      heading: memory.heading ?? magneticHeadingLabel(engineFor(selection).runwayGeometry().heading, airport), position: position ?? airport.features.find(f => f.kind === "taxiway")?.points[0],
      landing: memory.landing ?? "full-stop", flight: memory.flight ?? "departure", frequency: memory.frequency !== undefined ? memory.frequency : placement === "gate" || placement === "ground" ? "ground" : "tower",
      call: memory.call ?? "inbound", afterTransition: memory.afterTransition ?? "continue", overheadRadius: memory.overheadRadius ?? 1};
  };
  const [memory, setMemory] = useState(() => readLocalSpawnPreferences(accountId, airport.icao));
  const [options, setOptions] = useState<LocalAircraftOptions>(() => initial(memory));
  const [originCode, setOriginCode] = useState(originIcao ?? memory.originIcao ?? airport.icao);
  const origin = origins.find(item => item.icao === originCode) ?? (map.data || map.error ? origins.find(item => item.icao === airport.icao) : undefined);
  const [scheduled, setScheduled] = useState(false), [at, setAt] = useState(120), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false);
  useEffect(() => {const node = dialog.current, previous = document.activeElement; node?.showModal(); return () => {node?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus();};}, []);
  const patch = (value: Partial<LocalAircraftOptions>) => {setOptions(current => ({...current, ...value})); setError("");};
  const {placement} = options, gate = placement === "gate", airborne = AIRBORNE.includes(placement), takeoff = placement === "takeoff";
  const performance = AIRCRAFT_PERFORMANCE.find(p => p.id === options.type);
  const speeds = Array.from({length: Math.floor((performance?.max ?? 600) / 10) - Math.ceil((performance?.min ?? 80) / 10) + 1}, (_, i) => (Math.ceil((performance?.min ?? 80) / 10) + i) * 10);
  const occupied = gates.filter(gate => {const p = standPlacement(gate.id, false, airport)!.position; return aircraft.some(a => a.active && a.altitude <= airport.elevation + 20 && Math.hypot(a.position.x - p.x, a.position.y - p.y) < .04);});
  const runways = takeoff ? origin?.runways ?? [] : runwayEnds(airport), runway = runways.some(end => end.id === options.runway) ? options.runway : runways[0]?.id ?? "";
  const changePlacement = (placement: LocalPlacement) => patch({placement, runway: placement === "takeoff" ? origin?.runways[0]?.id ?? "" : runwayEnds(airport).some(end => end.id === options.runway) ? options.runway : defaultRunway(airport),
    position: placement === "ground" ? position ?? airport.features.find(f => f.kind === "taxiway")?.points[0] : position, frequency: placement === "gate" || placement === "ground" ? "ground" : "tower",
    ...(options.call === "transition" && placement !== "takeoff" && placement !== "custom" ? {call: "inbound" as const} : {})});
  const call: Call = options.call === "transition" ? "transition" : options.call === "quiet" ? "quiet" : options.landing === "touch-and-go" ? "touch-and-go" : "land";
  const changeCall = (value: Call) => patch(value === "land" || value === "touch-and-go" ? {call: "inbound", landing: value === "land" ? "full-stop" : "touch-and-go"} : {call: value});
  const calls: {value: Call; label: string; said: string}[] = [
    {value: "land", label: "Land", said: "“Inbound for a full stop”"},
    {value: "touch-and-go", label: "Touch and go", said: "“Inbound for touch and go”"},
    ...(takeoff || placement === "custom" ? [{value: "transition" as const, label: "Transit the zone", said: "“Requesting transition”, then what it does overhead"}] : []),
    {value: "quiet", label: "Stay quiet", said: takeoff ? "Flies to the overhead without calling" : "No call until you or a timeline event makes one"},
  ];
  const tiles: {value: LocalPlacement; label: string; detail: string; icon: ReactNode; hidden?: boolean}[] = [
    {value: "gate", label: "At a gate", detail: gates.length ? "Parked" : "No mapped gates", icon: <LetterCircleP aria-hidden="true"/>},
    {value: "ground", label: "On the ground", detail: position ? "At clicked point" : "On a taxiway", icon: <MapPin aria-hidden="true"/>},
    {value: "takeoff", label: "Departing", detail: "From another airfield", icon: <AirplaneTakeoff aria-hidden="true"/>},
    {value: "final", label: "On final", detail: "Lined up to land", icon: <AirplaneLanding aria-hidden="true"/>},
    {value: "circuit", label: "In the circuit", detail: "On a pattern leg", icon: <ArrowsClockwise aria-hidden="true"/>},
    {value: "custom", label: "Airborne", detail: position ? "At clicked point" : "Heading and height", icon: <Crosshair aria-hidden="true"/>},
  ];
  const runwaySelect = <label>Runway<select aria-label="Runway" value={runway} onChange={event => patch({runway: event.target.value})}>{runways.map(end => <option key={end.id} value={end.id}>{end.id}</option>)}</select></label>;
  const headingField = <label>Heading (°M)<input required type="number" min={0} max={360} value={options.heading} onChange={event => patch({heading: Number(event.target.value)})}/></label>;
  const heightField = <label>Height (ft AGL)<input required type="number" min={1} max={(performance?.ceiling ?? 60000) - airport.elevation} step={100} value={options.height} onChange={event => patch({height: Number(event.target.value)})}/></label>;
  const speedField = <label>Speed (kt IAS)<select aria-label="Speed (kt IAS)" value={options.speed} onChange={event => patch({speed: event.target.value === "auto" ? "auto" : Number(event.target.value)})}><option value="auto">Automatic</option>{speeds.map(speed => <option key={speed} value={speed}>{speed}</option>)}</select></label>;
  const frequencyField = <label>Starting frequency<select aria-label="Starting frequency" disabled={takeoff} value={takeoff ? "tower" : options.frequency ?? "none"} onChange={event => patch({frequency: event.target.value === "none" ? null : event.target.value as "ground" | "tower"})}><option value="ground">Ground</option><option value="tower">Tower</option><option value="none">No frequency</option></select></label>;
  const summary = [
    placement === "custom" || takeoff ? null : `Runway ${runway}`,
    placement === "final" || placement === "circuit" ? `${options.height.toLocaleString()} ft` : null,
    airborne && placement !== "custom" ? options.speed === "auto" ? "Speed automatic" : `${options.speed} kt` : null,
    !airborne ? options.landing === "touch-and-go" ? "Touch and go" : "Full stop" : null,
    takeoff ? "Tower" : options.frequency ? options.frequency === "ground" ? "Ground" : "Tower" : "No frequency",
  ].filter(Boolean).join(" · ");
  const remembered = Object.keys(memory).length > 0;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onKeyDown={event => event.stopPropagation()} onCancel={event => {if (pending.current) event.preventDefault(); else onClose();}}>
    <form className={styles.form} onSubmit={async event => {
      event.preventDefault(); if (!enabled || pending.current) return;
      pending.current = true; setBusy(true); setError("");
      try {
        if (aircraft.length >= MAX_AIRCRAFT) throw new Error("You can add up to 50 aircraft.");
        if (gate && !scheduled && occupied.some(gate => gate.id === options.gateId)) throw new Error("This gate is occupied. Choose an available gate.");
        const accepted = {...options, runway, origin};
        const next = createLocalAircraft(selection, `traffic-${crypto.randomUUID().slice(0, 8)}`, accepted, callsigns);
        if (await onAdd(next, gate ? options.gateId : undefined, scenario && scheduled ? at : 0) === false) throw new Error("Aircraft was not added. Check the session connection and try again.");
        saveLocalSpawnPreferences(accountId, airport.icao, accepted);
        onClose();
      } catch (reason) {setError(reason instanceof Error ? reason.message : "Aircraft could not be added.");}
      finally {pending.current = false; setBusy(false);}
    }}>
      <header className={styles.header}>
        <div><h2 id={titleId}>Add aircraft</h2><p>{airport.icao} · Ground &amp; Tower {scenario ? "scenario" : "session"}</p></div>
        {remembered ? <p className={styles.memory}><ClockCounterClockwise aria-hidden="true"/>Last settings<button type="button" disabled={busy} onClick={() => {clearLocalSpawnPreferences(accountId, airport.icao); setMemory({}); setOptions(initial({})); setOriginCode(originIcao ?? airport.icao); setError("");}}>Reset</button></p> : null}
      </header>
      <fieldset disabled={busy} className={styles.fields}>
        <fieldset className={styles.section}><legend>Start</legend>
          <div className={styles.tiles}>{tiles.map(tile => <button key={tile.value} type="button" className={styles.tile} aria-pressed={placement === tile.value} disabled={tile.value === "gate" && !gates.length} onClick={() => changePlacement(tile.value)}>{tile.icon}<span><b>{tile.label}</b><small>{tile.detail}</small></span></button>)}</div>
          <div className={styles.detail}>
            {takeoff ? <><label className={styles.wide}>Departure airfield<select aria-label="Departure airfield" value={origin?.icao ?? originCode} onChange={event => {const code = event.target.value; setOriginCode(code); patch({runway: origins.find(item => item.icao === code)?.runways[0]?.id ?? ""});}}>{!origin ? <option value={originCode}>{originCode} · Loading…</option> : null}{origins.map(item => <option key={item.icao} value={item.icao}>{item.icao} · {item.name}</option>)}</select></label>{runwaySelect}
              {map.error ? <p role="status" className={styles.note}>Nearby airfields are unavailable. {airport.icao} remains available.</p> : null}</>
            : gate ? <><label className={styles.wide}>Gate<select aria-label="Gate" required value={options.gateId ?? ""} onChange={event => patch({gateId: event.target.value})}><option value="" disabled>Choose an available gate</option>{gates.map(gate => <option key={gate.id} value={gate.id}>Gate {gate.name || gate.id}{occupied.some(g => g.id === gate.id) ? " · Occupied" : ""}</option>)}</select></label>
              <label>After takeoff<select aria-label="After takeoff" value={options.flight} onChange={event => patch({flight: event.target.value as LocalAircraftOptions["flight"]})}><option value="departure">Depart the area</option><option value="pattern">Stay in the circuit</option></select></label></>
            : placement === "ground" ? <>{headingField}<label>After takeoff<select aria-label="After takeoff" value={options.flight} onChange={event => patch({flight: event.target.value as LocalAircraftOptions["flight"]})}><option value="departure">Depart the area</option><option value="pattern">Stay in the circuit</option></select></label>
              {!position ? <p className={styles.note}>Starts on a taxiway. Right-click the scope to choose the spot.</p> : null}</>
            : placement === "final" ? <>{runwaySelect}<label>Distance (NM)<input required type="number" min={1} max={25} step={.5} value={options.distance} onChange={event => patch({distance: Number(event.target.value), height: Math.round(Number(event.target.value) * 6076 * Math.tan(3 * Math.PI / 180) / 100) * 100})}/></label></>
            : placement === "circuit" ? <>{runwaySelect}<label>Leg<select aria-label="Pattern leg" value={options.leg} onChange={event => patch({leg: event.target.value as LocalAircraftOptions["leg"]})}>{["upwind", "crosswind", "downwind", "base", "final"].map(leg => <option key={leg} value={leg}>{leg[0].toUpperCase() + leg.slice(1)}</option>)}</select></label></>
            : <>{headingField}{heightField}{speedField}</>}
          </div>
        </fieldset>
        <fieldset className={styles.section}><legend>Aircraft</legend>
          <div className={styles.pair}>
            <div className={styles.callsign}><label>Callsign<input autoFocus required maxLength={80} value={options.callsign} onChange={event => patch({callsign: event.target.value})}/></label><button type="button" aria-label="Generate another callsign" title="Another callsign" onClick={() => patch({callsign: randomCallsign([...callsigns, options.callsign])})}><Shuffle aria-hidden="true"/></button></div>
            <label>Type<AircraftTypeSelect value={options.type} onChange={type => {const p = AIRCRAFT_PERFORMANCE.find(p => p.id === type); patch({type, speed: options.speed === "auto" ? "auto" : Math.min(Math.floor((p?.max ?? 600) / 10) * 10, Math.max(Math.ceil((p?.min ?? 80) / 10) * 10, Math.round((p?.inbound ?? 250) / 10) * 10))});}}/></label>
          </div>
        </fieldset>
        {airborne ? <fieldset className={styles.section}><legend>{takeoff ? "Once airborne, calls Tower to" : "Calls Tower to"}</legend>
          <div className={styles.calls}>{calls.map(item => <div key={item.value} className={styles.call} data-checked={call === item.value || undefined}>
            <label><input type="radio" name={`${titleId}-call`} value={item.value} checked={call === item.value} onChange={() => changeCall(item.value)}/>
            <span><b>{item.label}</b><small>{item.said}</small></span></label>
            {item.value === "transition" && call === "transition" ? <div className={styles.then}>
              <span className={styles.thenLabel} id={`${titleId}-overhead`}>When overhead</span>
              <span className={styles.segments} role="radiogroup" aria-labelledby={`${titleId}-overhead`}>{([["continue", "Keep going"], ["touch-and-go", "Call inbound for touch and go"], ["land", "Call inbound to land"]] as const).map(([value, label]) =>
                <button key={value} type="button" role="radio" aria-checked={options.afterTransition === value} onClick={() => patch({afterTransition: value})}>{label}</button>)}</span>
              {options.afterTransition !== "continue" ? <span className={styles.radius}>Calls within<input aria-label="Overhead radius (NM)" type="number" min={.1} max={5} step={.1} value={options.overheadRadius} onChange={event => patch({overheadRadius: Number(event.target.value)})}/>NM of the field</span> : null}
            </div> : null}
          </div>)}</div>
          {!takeoff && options.frequency !== "tower" && call !== "quiet" ? <p className={styles.note}>Starts off the Tower frequency, so it only calls once you change that under More.</p> : null}
        </fieldset> : null}
        {scenario ? <fieldset className={styles.section}><legend>Appears</legend>
          <div className={styles.appears}><span className={styles.segments} role="radiogroup" aria-label="Appears">{([[false, "At start"], [true, "Later"]] as const).map(([value, label]) =>
            <button key={label} type="button" role="radio" aria-checked={scheduled === value} onClick={() => setScheduled(value)}>{label}</button>)}</span>
            {scheduled ? <label className={styles.inline}><input aria-label="Seconds after start" required type="number" min={1} max={86400} value={at} onChange={event => setAt(Number(event.target.value))}/>seconds after start · adds a spawn event to the timeline</label> : null}</div>
        </fieldset> : null}
        <details className={styles.more}><summary><span><b>More</b> · {summary}</span><CaretDown aria-hidden="true"/></summary>
          <div className={styles.pair}>
            {placement === "gate" || placement === "ground" || placement === "custom" ? runwaySelect : null}
            {placement === "final" || placement === "circuit" ? <>{heightField}{speedField}</> : null}
            {!airborne ? <label>Next landing<select aria-label="Next landing" value={options.landing} onChange={event => patch({landing: event.target.value as Aircraft["landing"]})}><option value="full-stop">Full stop</option><option value="touch-and-go">Touch and go</option></select></label> : null}
            {frequencyField}
          </div>
          {takeoff ? <p className={styles.note}>Climbs to 1,500 ft above {airport.icao} and flies toward the overhead.</p> : null}
        </details>
      </fieldset>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <footer className={styles.actions}><p>{remembered ? "Opens with your last settings." : "Your choices are remembered for next time."}</p><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className={styles.primary} disabled={!enabled || busy || aircraft.length >= MAX_AIRCRAFT || takeoff && !origin}>{busy ? "Adding…" : "Add aircraft"}</button></footer>
    </form>
  </dialog>;
}
