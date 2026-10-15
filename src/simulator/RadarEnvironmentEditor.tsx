"use client";
import {useState} from "react";
import type {RadarEnvironment} from "./model";
import styles from "./ScenarioSetup.module.css";

export default function RadarEnvironmentEditor({value, onChange}: {value: RadarEnvironment; onChange: (value: RadarEnvironment) => void}) {
  const [selected, setSelected] = useState(value.approaches[0]?.id ?? "");
  const approach = value.approaches.find(p => p.id === selected);
  return <details className={styles.radarEnvironment}><summary>Sector, fixes & approaches</summary>
    <label>Sector name<input maxLength={100} value={value.name} onChange={e => onChange({...value, name: e.target.value})}/></label>
    <label>Sector range (NM)<input type="number" min="10" max="500" value={value.range} onChange={e => {const range = Number(e.target.value); onChange({...value, range, boundary: [{x: -range, y: -range}, {x: range, y: -range}, {x: range, y: range}, {x: -range, y: range}]});}}/></label>
    <label>Approach<select value={selected} onChange={e => setSelected(e.target.value)}>{value.approaches.map(p => <option key={p.id} value={p.id}>{p.type.toUpperCase()} · Runway {p.runway}</option>)}</select></label>
    {approach ? <>{([{key: "finalDistance", label: "Final capture distance (NM)", min: 3, max: 50, step: .5}, {key: "captureWidth", label: "Capture width (NM)", min: .05, max: 2, step: .05}, {key: "glideAngle", label: "Descent angle (°)", min: 1, max: 6, step: .1}, {key: "missedHeading", label: "Missed approach heading (°)", min: 0, max: 360, step: 1}] as const).map(field => <label key={field.key}>{field.label}<input type="number" min={field.min} max={field.max} step={field.step} value={approach[field.key]} onChange={e => onChange({...value, approaches: value.approaches.map(p => p.id === selected ? {...p, [field.key]: Number(e.target.value)} : p)})}/></label>)}</> : null}
    {value.fixes.map((fix, index) => <fieldset key={index}><legend>Fix {index + 1}</legend><label>Name<input maxLength={32} value={fix.id} onChange={e => onChange({...value, fixes: value.fixes.map((p, i) => i === index ? {...p, id: e.target.value} : p)})}/></label>{(["x", "y"] as const).map(axis => <label key={axis}>{axis === "x" ? "East" : "North"} (NM)<input type="number" min="-2000" max="2000" step=".1" value={fix.point[axis]} onChange={e => onChange({...value, fixes: value.fixes.map((p, i) => i === index ? {...p, point: {...p.point, [axis]: Number(e.target.value)}} : p)})}/></label>)}<button type="button" onClick={() => onChange({...value, fixes: value.fixes.filter((_, i) => i !== index)})}>Remove fix</button></fieldset>)}
    <button type="button" disabled={value.fixes.length >= 200} onClick={() => onChange({...value, fixes: [...value.fixes, {id: `FIX-${value.fixes.length + 1}`, point: {x: 0, y: 0}}]})}>Add fix</button>
  </details>;
}
