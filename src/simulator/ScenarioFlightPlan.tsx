"use client";
import {useState} from "react";
import {Plus} from "@phosphor-icons/react/dist/csr/Plus";
import {DotsThreeVertical} from "@phosphor-icons/react/dist/csr/DotsThreeVertical";
import {ArrowUp} from "@phosphor-icons/react/dist/csr/ArrowUp";
import {ArrowDown} from "@phosphor-icons/react/dist/csr/ArrowDown";
import {Trash} from "@phosphor-icons/react/dist/csr/Trash";
import FlightPlanAddDialog from "./FlightPlanAddDialog";
import RouteSetup from "./RouteSetup";
import {ALTITUDES, altitudeFeet, altitudeLabel} from "./radar";
import {flightPlanPatch, legAltitudeLabel} from "./scenario-flight-plan";
import type {Aircraft, Airport, RoutePoint} from "./model";
import styles from "./ScenarioFlightPlan.module.css";

export default function ScenarioFlightPlan({aircraft: a, airport, onEdit}: {aircraft: Aircraft; airport: Airport; onEdit: (patch: Partial<Aircraft>) => void}) {
  const [open, setOpen] = useState(false), [notice, setNotice] = useState("");
  const change = (points: RoutePoint[]) => onEdit(flightPlanPatch(a, points));
  const move = (index: number, direction: number) => {
    const points = [...a.flightPlan]; [points[index], points[index + direction]] = [points[index + direction], points[index]]; change(points);
  };
  return <section className={styles.plan} aria-label="Scenario flight plan">
    <div className={styles.heading}><h3>Flight plan</h3><span>{a.flightPlan.length} / 200 fixes</span></div>
    <button type="button" className={styles.addButton} onClick={() => setOpen(true)}><Plus size={19} aria-hidden="true"/>Add waypoint or procedure</button>
    {notice ? <p role="status" className={styles.help}>{notice}</p> : null}
    {!a.flightPlan.length ? <p className={styles.empty}>Your flight plan is empty. Add a waypoint, departure, arrival or approach to get started.</p> : <ol className={styles.legs}>{a.flightPlan.map((point, index) => <li key={index} className={styles.leg}>
      <div className={styles.legRow}><span className={styles.number}>{index + 1}</span><div className={styles.legName}><strong>{point.name ?? `Waypoint ${index + 1}`}{point.finalApproachFix ? " · FAF" : ""}</strong><span className={styles.profile}>{legAltitudeLabel(a.flightPlan, index, a.altitude)}</span></div><small className={styles.coordinates}>{point.x.toFixed(1)} E · {point.y.toFixed(1)} N</small></div>
      <details className={styles.legEditor}><summary aria-label={`Edit leg ${index + 1}`}><DotsThreeVertical size={20} aria-hidden="true"/></summary><div className={styles.legFields}>
        {a.radar ? <label className={styles.check}><input type="checkbox" checked={!!point.finalApproachFix} onChange={event => change(a.flightPlan.map((p, i) => ({...p, finalApproachFix: i === index && event.target.checked ? true : undefined})))}/>Final approach fix (GPS)</label> : null}
        <label>Leg {index + 1} altitude target<select value={point.altitude ?? ""} onChange={event => {const altitude = event.target.value ? Number(event.target.value) : undefined; onEdit({...flightPlanPatch(a, a.flightPlan.map((p, i) => i === index ? {...p, altitude} : p)), ...(altitude !== undefined && a.followRouteAltitudes === undefined ? {followRouteAltitudes: true} : {})});}}><option value="">Maintain previous altitude</option>{ALTITUDES.map(altitude => <option key={altitudeLabel(altitude)} value={altitudeFeet(altitude)}>{altitude.unit === "feet" ? `${altitude.value} ft MSL` : altitudeLabel(altitude)}</option>)}</select></label>
        <label>Leg {index + 1} speed target (kt)<input type="number" min={80} max={600} step={1} placeholder="Automatic" key={`${a.id}:${index}:${point.speed}`} defaultValue={point.speed ?? ""} onBlur={event => {if (event.currentTarget.validity.valid) {const speed = event.target.value ? Number(event.target.value) : undefined; change(a.flightPlan.map((p, i) => i === index ? {...p, speed} : p));}}}/></label>
        <div className={styles.actions}><button type="button" disabled={index === 0} aria-label={`Move leg ${index + 1} earlier`} onClick={() => move(index, -1)}><ArrowUp size={16}/></button><button type="button" disabled={index === a.flightPlan.length - 1} aria-label={`Move leg ${index + 1} later`} onClick={() => move(index, 1)}><ArrowDown size={16}/></button><button type="button" aria-label={`Remove leg ${index + 1}`} onClick={() => change(a.flightPlan.filter((_, i) => i !== index))}><Trash size={16}/>Remove</button></div>
      </div></details>
    </li>)}</ol>}
    {a.radar ? <div className={styles.guidance}><label>Initial guidance<select value={a.radar.navigation} onChange={event => onEdit({radar: {...a.radar!, navigation: event.target.value as "heading" | "route", routeIndex: 0}})}><option value="heading">Fly heading</option><option value="route" disabled={!a.flightPlan.length}>Follow flight plan</option>{!["heading", "route"].includes(a.radar.navigation) ? <option value={a.radar.navigation}>{a.radar.navigation}</option> : null}</select></label>
      <label className={styles.check}><input type="checkbox" disabled={!a.flightPlan.length} checked={!!a.followRouteAltitudes} onChange={event => onEdit({followRouteAltitudes: event.target.checked, starDescent: undefined})}/>Follow planned climbs and descents</label><p className={styles.help}>Controller instructions override planned altitude targets. For GPS approaches, mark the final approach fix; an unmarked straight-in plan uses its last fix before the runway as a schematic FAF.</p></div> : null}
    <details className={styles.secondary}><summary>Destination and diversion</summary><RouteSetup aircraft={a} onEdit={onEdit} includeWaypoints={false}/></details>
    {a.flightPlan.length ? <button type="button" className={styles.clearButton} onClick={() => {onEdit({...flightPlanPatch(a, []), navigationSource: undefined, followRouteAltitudes: undefined, arrivalProcedure: undefined}); setNotice("Flight plan cleared.");}}>Clear flight plan</button> : null}
    {open ? <FlightPlanAddDialog aircraft={a} airport={airport} onEdit={onEdit} onClose={() => setOpen(false)} onAdded={setNotice}/> : null}
  </section>;
}
