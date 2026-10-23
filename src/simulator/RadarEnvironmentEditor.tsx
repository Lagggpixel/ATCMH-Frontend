"use client";
import {magneticHeadingLabel, magneticToTrue} from "./magnetic-headings";
import {useState} from "react";
import {ILS_CAPTURE_DISTANCE_NM, type Airport, type RadarEnvironment} from "./model";
import styles from "./ScenarioSetup.module.css";

export default function RadarEnvironmentEditor({value, airport, onChange}: {value: RadarEnvironment; airport: Airport; onChange: (value: RadarEnvironment) => void}) {
  const [selected, setSelected] = useState(value.approaches[0]?.id ?? "");
  const approach = value.approaches.find(p => p.id === selected);
  return <details className={styles.radarEnvironment}><summary>Sector & approaches</summary>
    <p>Navigation fixes load automatically from InfiniteHorizon for the selected airport.</p>
    <label>Sector name<input maxLength={100} value={value.name} onChange={e => onChange({...value, name: e.target.value})}/></label>
    <label>Sector range (NM)<input type="number" min="10" max="500" value={value.range} onChange={e => {const range = Number(e.target.value); onChange({...value, range, boundary: [{x: -range, y: -range}, {x: range, y: -range}, {x: range, y: range}, {x: -range, y: range}]});}}/></label>
    <label>Approach<select value={selected} onChange={e => setSelected(e.target.value)}>{value.approaches.map(p => <option key={p.id} value={p.id}>{p.type.toUpperCase()} · Runway {p.runway}</option>)}</select></label>
    {approach ? <>{([{key: "finalDistance", label: "Final capture distance (NM)", min: approach.type === "ils" ? ILS_CAPTURE_DISTANCE_NM : 3, max: 50, step: .5}, {key: "captureWidth", label: "Capture width (NM)", min: .05, max: 2, step: .05}, {key: "glideAngle", label: "Descent angle (°)", min: 1, max: 6, step: .1}, {key: "missedHeading", label: "Missed approach heading (°M)", min: 0, max: 360, step: 1}] as const).map(field => <label key={field.key}>{field.label}<input type="number" min={field.min} max={field.max} step={field.step} value={field.key === "missedHeading" ? magneticHeadingLabel(approach.missedHeading, airport) : field.key === "finalDistance" && approach.type === "ils" ? Math.max(ILS_CAPTURE_DISTANCE_NM, approach.finalDistance) : approach[field.key]} onChange={e => onChange({...value, approaches: value.approaches.map(p => p.id === selected ? {...p, [field.key]: field.key === "missedHeading" ? magneticToTrue(Number(e.target.value), airport) : Number(e.target.value)} : p)})}/></label>)}</> : null}
  </details>;
}
