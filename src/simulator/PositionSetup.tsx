"use client";
import {useId} from "react";
import {facilities} from "./aviation";
import {getAirport, trainingMode, type AirportSelection} from "./airports";
import {positionColor, type ControllerPosition} from "./positions";
import {positionSwatch} from "./PositionSummary";
import type {RadarEnvironment} from "./model";
import styles from "./Positions.module.css";

type Selection = AirportSelection & {radarEnvironment?: RadarEnvironment};
/** The approach channels a split can use at this airport. */
export const approachChannels = (selection: Selection) => {
  const airport = getAirport(selection);
  return (selection.radarEnvironment?.facilities ?? facilities).filter(f => f.airport === airport.icao && f.type === "approach");
};
const MAX_POSITIONS = 12;
const LAYOUTS = [
  {id: "single", label: "Single", hint: "One controller", names: ["Approach"]},
  {id: "initial-final", label: "Initial / Final", hint: "Outer and inner ring", names: ["Initial", "Final"]},
  {id: "north-south", label: "North / South", hint: "Two halves", names: ["North", "South"]},
  {id: "three", label: "North / South / Final", hint: "Halves plus final", names: ["North", "South", "Final"]},
] as const;

/** Small airspace sketches; the colours match each position's colour. */
function LayoutSketch({id}: {id: typeof LAYOUTS[number]["id"]}) {
  const [a, b, c] = [positionColor(0), positionColor(1), positionColor(2)];
  return <svg viewBox="0 0 72 44" aria-hidden="true">
    {id === "single" ? <circle cx="36" cy="22" r="20" fill="#6b7680"/> : null}
    {id === "initial-final" ? <><circle cx="36" cy="22" r="20" fill={a}/><circle cx="36" cy="22" r="9" fill={b}/></> : null}
    {id === "north-south" || id === "three" ? <><path d="M16 22a20 20 0 0 1 40 0z" fill={a}/><path d="M16 22a20 20 0 0 0 40 0z" fill={b}/></> : null}
    {id === "three" ? <circle cx="36" cy="22" r="8" fill={c}/> : null}
    <circle cx="36" cy="22" r="2.5" fill="#fff"/>
  </svg>;
}

export default function PositionSetup({selection, value, onChange, disabled = false, aircraft}: {
  selection: Selection; value?: ControllerPosition[];
  onChange: (positions: ControllerPosition[]) => void; disabled?: boolean;
  /** Aircraft that start on each position, by position id. */
  aircraft?: Record<string, number>;
}) {
  const name = useId();
  if (trainingMode(selection) !== "approach") return null;
  const airport = getAirport(selection), channels = approachChannels(selection);
  const positions = value ?? [];
  const current = LAYOUTS.find(l => positions.length ? l.names.length === positions.length && l.names.every((n, i) => positions[i].name === n) : l.id === "single")?.id;
  const preset = (names: readonly string[]) => {
    if (channels.length < names.length) return;
    onChange(names.map((name, i) => ({id: value?.[i]?.id ?? `approach-${i + 1}`, name, service: "approach", facilityId: channels[i].id, mhz: channels[i].mhz, ...(value?.[i]?.briefing ? {briefing: value[i].briefing} : {})})));
  };
  const update = (id: string, patch: Partial<ControllerPosition>) => onChange(positions.map(p => p.id === id ? {...p, ...patch} : p));
  const free = channels.filter(f => !positions.some(p => p.facilityId === f.id || p.mhz === f.mhz));
  const room = Math.min(MAX_POSITIONS, channels.length) - positions.length;
  return <fieldset disabled={disabled} className={styles.fields}>
    <legend>Positions<small>{airport.icao} · {channels.length} approach {channels.length === 1 ? "channel" : "channels"}</small></legend>
    <div className={styles.layouts} role="radiogroup" aria-label="Position layout">{LAYOUTS.map(l => <label key={l.id}>
      <input type="radio" name={name} checked={current === l.id} disabled={channels.length < l.names.length} onChange={() => preset(l.names)}/>
      <LayoutSketch id={l.id}/>{l.label}<small>{channels.length < l.names.length ? `Needs ${l.names.length} channels` : l.hint}</small>
    </label>)}</div>
    {positions.length ? <div className={styles.cards}>{positions.map((p, index) => <section key={p.id} className={styles.card} style={positionSwatch(index)} aria-label={`Position ${index + 1}: ${p.name}`}>
      <div className={styles.cardHead}><span>{index + 1}</span><input aria-label="Position name" maxLength={60} value={p.name} onChange={e => update(p.id, {name: e.target.value})}/>
        {positions.length > 1 ? <button type="button" className={styles.remove} aria-label={`Remove ${p.name}`} onClick={() => onChange(positions.filter((_, i) => i !== index))}>✕</button> : null}</div>
      <label>Frequency<select value={p.facilityId} onChange={e => {const channel = channels.find(f => f.id === e.target.value); if (channel) update(p.id, {facilityId: channel.id, mhz: channel.mhz});}}>{channels.map(f => <option key={f.id} value={f.id} disabled={positions.some(other => other.id !== p.id && other.facilityId === f.id)}>{f.name} · {f.mhz}</option>)}</select></label>
      {aircraft || index === 0 ? <div className={styles.tags}>{aircraft ? <span>{aircraft[p.id] ?? 0} {(aircraft[p.id] ?? 0) === 1 ? "aircraft starts" : "aircraft start"} here</span> : null}{index === 0 ? <span className={styles.atis}>Publishes ATIS</span> : null}</div> : null}
      <label>Briefing for this position<textarea rows={3} maxLength={2000} value={p.briefing ?? ""} onChange={e => update(p.id, {briefing: e.target.value})}/></label>
    </section>)}</div> : null}
    {positions.length ? <div className={styles.add}>
      {room > 0 && free.length ? <button type="button" onClick={() => onChange([...positions, {id: `position-${crypto.randomUUID().slice(0, 8)}`, name: `Approach ${positions.length + 1}`, service: "approach", facilityId: free[0].id, mhz: free[0].mhz}])}>+ Add position</button> : null}
      <span>{free.length ? `${free.length} ${free.length === 1 ? "channel" : "channels"} left at ${airport.icao}` : `Every ${airport.icao} approach channel is in use`}</span>
    </div> : null}
    <div className={styles.notes}>
      <p><strong>One shared sky</strong>All positions fly the same traffic. Aircraft move between positions only after a frequency handoff.</p>
      <p><strong>One mentee each</strong>Assign a mentee to each position when you start a session. You can work an empty position yourself.</p>
      <p><strong>Starting owner</strong>Set it on each aircraft. The first position publishes the shared ATIS.</p>
    </div>
  </fieldset>;
}
