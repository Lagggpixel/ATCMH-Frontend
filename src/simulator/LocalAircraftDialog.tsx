"use client";
import AircraftTypeSelect from "./AircraftTypeSelect";
import {AIRCRAFT_PERFORMANCE} from "./aircraft-performance";
import {useEffect, useId, useRef, useState} from "react";
import {defaultRunway, getAirport, runwayEnds, type AirportSelection} from "./airports";
import {randomCallsign} from "./callsigns";
import {availableLocalGate, createLocalAircraft, type LocalAircraftOptions, type LocalPlacement} from "./local-aircraft";
import {gatesFor, standPlacement} from "./scenarios";
import {magneticHeadingLabel} from "./magnetic-headings";
import {engineFor} from "./engine";
import {MAX_AIRCRAFT, type Aircraft, type Point} from "./model";
import styles from "./LocalAircraftDialog.module.css";

export default function LocalAircraftDialog({selection, aircraft, callsigns, position, scenario = false, enabled, onAdd, onClose}: {
  selection: AirportSelection; aircraft: readonly Aircraft[]; callsigns: readonly string[]; position?: Point; scenario?: boolean; enabled: boolean;
  onAdd: (aircraft: Aircraft, gateId: string | undefined, at: number) => void | boolean | Promise<boolean>; onClose: () => void;
}) {
  const titleId = useId(), airport = getAirport(selection), gates = gatesFor(airport);
  const [options, setOptions] = useState<LocalAircraftOptions>(() => ({placement: position ? "custom" : gates.length ? "gate" : "ground", callsign: randomCallsign(callsigns), type: "A320",
    runway: defaultRunway(airport), gateId: availableLocalGate(selection, aircraft)?.id, distance: 5, leg: "downwind", hand: "left", height: 1500, speed: "auto",
    heading: magneticHeadingLabel(engineFor(selection).runwayGeometry().heading, airport), position: position ?? airport.features.find(f => f.kind === "taxiway")?.points[0], landing: "full-stop", flight: "departure", frequency: position ? "tower" : "ground"}));
  const [scheduled, setScheduled] = useState(false), [at, setAt] = useState(120), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false);
  useEffect(() => {const node = dialog.current, previous = document.activeElement; node?.showModal(); return () => {node?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus();};}, []);
  const patch = (value: Partial<LocalAircraftOptions>) => {setOptions(current => ({...current, ...value})); setError("");};
  const gate = options.placement === "gate";
  const performance = AIRCRAFT_PERFORMANCE.find(p => p.id === options.type);
  const speeds = Array.from({length: Math.floor((performance?.max ?? 600) / 10) - Math.ceil((performance?.min ?? 80) / 10) + 1}, (_, i) => (Math.ceil((performance?.min ?? 80) / 10) + i) * 10);
  const geometry = engineFor(selection).runwayGeometry(options.runway);
  const customPosition = options.position ?? {x: geometry.threshold.x - geometry.vector.x * 5, y: geometry.threshold.y - geometry.vector.y * 5};
  const occupied = gates.filter(gate => {const p = standPlacement(gate.id, false, airport)!.position; return aircraft.some(a => a.active && a.altitude <= airport.elevation + 20 && Math.hypot(a.position.x - p.x, a.position.y - p.y) < .04);});
  const changePlacement = (placement: LocalPlacement) => patch({placement, position: placement === "ground" ? position ?? airport.features.find(f => f.kind === "taxiway")?.points[0] : position, frequency: placement === "gate" || placement === "ground" ? "ground" : "tower", height: 1500});
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onKeyDown={event => event.stopPropagation()} onCancel={event => {if (pending.current) event.preventDefault(); else onClose();}}>
    <form className={styles.form} onSubmit={async event => {
      event.preventDefault(); if (!enabled || pending.current) return;
      pending.current = true; setBusy(true); setError("");
      try {
        if (aircraft.length >= MAX_AIRCRAFT) throw new Error("You can add up to 50 aircraft.");
        if (gate && !scheduled && occupied.some(gate => gate.id === options.gateId)) throw new Error("This gate is occupied. Choose an available gate.");
        const next = createLocalAircraft(selection, `traffic-${crypto.randomUUID().slice(0, 8)}`, options, callsigns);
        if (await onAdd(next, gate ? options.gateId : undefined, scenario && scheduled ? at : 0) === false) throw new Error("Aircraft was not added. Check the session connection and try again.");
        onClose();
      } catch (reason) {setError(reason instanceof Error ? reason.message : "Aircraft could not be added.");}
      finally {pending.current = false; setBusy(false);}
    }}>
      <header><h2 id={titleId}>Add aircraft</h2><p>{airport.icao} · Ground & Tower{scenario ? " scenario" : " session"}</p></header>
      <fieldset disabled={busy} className={styles.fields}>
        <label>Starting situation<select aria-label="Starting situation" value={options.placement} onChange={event => changePlacement(event.target.value as LocalPlacement)}><option value="ground">{position ? "On the ground at scope click" : "On the ground"}</option><option value="gate">Parked at a gate</option><option value="final">On runway final</option><option value="circuit">In the circuit</option><option value="custom">Custom airborne position</option></select></label>
        <div className={styles.callsign}><label>Callsign<input autoFocus required maxLength={80} value={options.callsign} onChange={event => patch({callsign: event.target.value})}/></label><button type="button" aria-label="Generate another callsign" onClick={() => patch({callsign: randomCallsign([...callsigns, options.callsign])})}>Shuffle</button></div>
        <div className={styles.pair}><label>Aircraft type<AircraftTypeSelect value={options.type} onChange={type => {const p=AIRCRAFT_PERFORMANCE.find(p=>p.id===type);patch({type,speed:options.speed === "auto" ? "auto" : Math.min(Math.floor((p?.max ?? 600)/10)*10, Math.max(Math.ceil((p?.min ?? 80)/10)*10, Math.round((p?.inbound ?? 250)/10)*10))});}}/></label><label>Runway<select aria-label="Runway" value={options.runway} onChange={event => patch({runway: event.target.value})}>{runwayEnds(airport).map(end => <option key={end.id} value={end.id}>{end.id}</option>)}</select></label></div>
        {gate ? <><label>Gate<select aria-label="Gate" required value={options.gateId ?? ""} onChange={event => patch({gateId: event.target.value})}><option value="" disabled>Choose an available gate</option>{gates.map(gate => <option key={gate.id} value={gate.id}>Gate {gate.name || gate.id}{occupied.some(g => g.id === gate.id) ? " · Occupied" : ""}</option>)}</select></label>{!gates.length ? <p role="alert">No connected mapped gates are available. Choose On the ground to set a surface position.</p> : null}<label>After takeoff<select aria-label="After takeoff" value={options.flight} onChange={event => patch({flight: event.target.value as LocalAircraftOptions["flight"]})}><option value="departure">Depart the area</option><option value="pattern">Remain in the pattern</option></select></label></> : options.placement === "ground" ? <><div className={styles.pair}><label>East (NM)<input type="number" step=".01" value={customPosition.x} onChange={event => patch({position: {...customPosition, x: Number(event.target.value)}})}/></label><label>North (NM)<input type="number" step=".01" value={customPosition.y} onChange={event => patch({position: {...customPosition, y: Number(event.target.value)}})}/></label></div><label>Heading (°M)<input required type="number" min={0} max={360} value={options.heading} onChange={event => patch({heading: Number(event.target.value)})}/></label></> : <>
          {options.placement === "final" ? <label>Distance from threshold (NM)<input required type="number" min={1} max={25} step={.5} value={options.distance} onChange={event => patch({distance: Number(event.target.value), height: Math.round(Number(event.target.value) * 6076 * Math.tan(3 * Math.PI / 180) / 100) * 100})}/></label> : null}
          {options.placement === "circuit" ? <label>Pattern leg<select aria-label="Pattern leg" value={options.leg} onChange={event => patch({leg: event.target.value as LocalAircraftOptions["leg"]})}>{["upwind", "crosswind", "downwind", "base", "final"].map(leg => <option key={leg} value={leg}>{leg}</option>)}</select></label> : null}
          {options.placement === "custom" ? <label>Heading (°M)<input required type="number" min={0} max={360} value={options.heading} onChange={event => patch({heading: Number(event.target.value)})}/></label> : null}
          <div className={styles.pair}><label>Height above airport (ft AGL)<input required type="number" min={1} max={(AIRCRAFT_PERFORMANCE.find(p=>p.id===options.type)?.ceiling??60000)-airport.elevation} value={options.height} onChange={event => patch({height: Number(event.target.value)})}/></label><label>Speed (kt IAS)<select aria-label="Speed (kt IAS)" value={options.speed} onChange={event => patch({speed: event.target.value === "auto" ? "auto" : Number(event.target.value)})}><option value="auto">Automatic</option>{speeds.map(speed => <option key={speed} value={speed}>{speed}</option>)}</select></label></div>
        </>}
        <div className={styles.pair}><label>Next landing<select aria-label="Next landing" value={options.landing} onChange={event => patch({landing: event.target.value as Aircraft["landing"]})}><option value="full-stop">Full stop</option><option value="touch-and-go">Touch and go</option></select></label><label>Starting frequency<select aria-label="Starting frequency" value={options.frequency ?? "none"} onChange={event => patch({frequency: event.target.value === "none" ? null : event.target.value as "ground" | "tower"})}><option value="ground">Ground</option><option value="tower">Tower</option><option value="none">No frequency</option></select></label></div>
        {scenario ? <><label>Appears<select aria-label="Appears" value={scheduled ? "scheduled" : "start"} onChange={event => setScheduled(event.target.value === "scheduled")}><option value="start">At Start</option><option value="scheduled">At a scheduled time</option></select></label>{scheduled ? <label>Time after Start (seconds)<input required type="number" min={1} max={86400} value={at} onChange={event => setAt(Number(event.target.value))}/></label> : null}</> : null}
      </fieldset>
      {scenario && scheduled ? <p className={styles.summary}>A spawn event will be added to the timeline.</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <footer className={styles.actions}><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className={styles.primary} disabled={!enabled || busy || aircraft.length >= MAX_AIRCRAFT}>{busy ? "Adding…" : "Add aircraft"}</button></footer>
    </form>
  </dialog>;
}
