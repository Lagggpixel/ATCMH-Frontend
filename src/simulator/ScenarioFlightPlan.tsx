"use client";
import {useRef, useState} from "react";
import {Plus} from "@phosphor-icons/react/dist/csr/Plus";
import {DotsThreeVertical} from "@phosphor-icons/react/dist/csr/DotsThreeVertical";
import {DotsSixVertical} from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import {ArrowUp} from "@phosphor-icons/react/dist/csr/ArrowUp";
import {ArrowDown} from "@phosphor-icons/react/dist/csr/ArrowDown";
import {Trash} from "@phosphor-icons/react/dist/csr/Trash";
import FlightPlanAddDialog from "./FlightPlanAddDialog";
import RouteSetup from "./RouteSetup";
import {ALTITUDES, altitudeFeet, altitudeLabel} from "./radar";
import {appendFlightPlan, fetchNavigationRoute, flightPlanPatch, legAltitudeLabel, moveFlightPlanLeg, parseTypedRoute} from "./scenario-flight-plan";
import {useNavigationCatalog} from "./use-navigation-catalog";
import type {Aircraft, Airport, RoutePoint} from "./model";
import styles from "./ScenarioFlightPlan.module.css";

/** Flight plans are built from navigation data: typed, searched or reordered, never drawn on the scope. */
export default function ScenarioFlightPlan({aircraft: a, airport, onEdit, live = false}: {aircraft: Aircraft; airport: Airport; onEdit: (patch: Partial<Aircraft>) => void; live?: boolean}) {
  const [open, setOpen] = useState(false), [notice, setNotice] = useState("");
  const [typed, setTyped] = useState(""), [typedError, setTypedError] = useState(""), [adding, setAdding] = useState(false);
  // Only the leg row arms dragging, so text fields in an open leg editor stay selectable.
  const [grab, setGrab] = useState<number | null>(null), [dragged, setDragged] = useState<number | null>(null), [dropAt, setDropAt] = useState<number | null>(null);
  const {catalog, error: catalogError} = useNavigationCatalog(airport.icao);
  const working = useRef(false);
  const change = (points: RoutePoint[]) => onEdit(flightPlanPatch(a, points, live));
  const move = (from: number, to: number) => change(moveFlightPlanLeg(a.flightPlan, from, to));
  const addTyped = async () => {
    if (!catalog || working.current || !typed.trim()) return;
    const parsed = parseTypedRoute(catalog, typed, a.flightPlan.at(-1) ?? a.position);
    if (parsed.error) {setTypedError(parsed.error); return;}
    working.current = true; setAdding(true); setTypedError("");
    try {
      let points = a.flightPlan, source: Aircraft["navigationSource"] = {revision: catalog.revision}, star: string | undefined;
      for (const entry of parsed.entries) {
        if ("point" in entry) {points = appendFlightPlan(points, [entry.point]); continue;}
        const route = await fetchNavigationRoute(catalog, entry.procedure.id, entry.route.id);
        points = appendFlightPlan(points, route.points);
        source = {revision: route.revision, procedureId: route.procedureId, routeId: route.routeId};
        if (route.type === "STAR") star = route.name;
      }
      onEdit({...flightPlanPatch(a, points, live), navigationSource: source, ...(star ? {arrivalProcedure: star} : {})});
      setNotice(`Added ${parsed.entries.map(entry => entry.name).join(", ")}.`); setTyped("");
    } catch (reason) {setTypedError(reason instanceof Error ? reason.message : "Unable to add this route.");}
    finally {working.current = false; setAdding(false);}
  };
  return <section className={styles.plan} aria-label={live ? "Flight plan" : "Scenario flight plan"}>
    <div className={styles.heading}><h3>Flight plan</h3><span>{a.flightPlan.length} / 200 fixes{live && !a.radar ? " · display only" : ""}</span></div>
    <div className={styles.typed}><label>Type a route<input value={typed} disabled={adding} placeholder={catalog ? "e.g. TLA DCT GOW or TLA1A.TLA" : catalogError ? "Navigation data unavailable" : "Loading navigation data…"} aria-describedby={typedError ? `${a.id}-typed-error` : undefined} onChange={event => {setTyped(event.target.value); setTypedError("");}} onKeyDown={event => {if (event.key === "Enter") {event.preventDefault(); void addTyped();}}}/></label><button type="button" disabled={!catalog || adding || !typed.trim()} onClick={() => void addTyped()}>{adding ? "Adding…" : "Add"}</button></div>
    {typedError ? <p role="alert" id={`${a.id}-typed-error`} className={styles.error}>{typedError}</p> : null}
    <button type="button" className={styles.addButton} onClick={() => setOpen(true)}><Plus size={19} aria-hidden="true"/>Search waypoints and procedures</button>
    {notice ? <p role="status" className={styles.help}>{notice}</p> : null}
    {!a.flightPlan.length ? <p className={styles.empty}>The flight plan is empty. Type fixes and procedures above, or search for a waypoint, departure, arrival or approach.</p> : <ol className={styles.legs} onDragLeave={event => {if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropAt(null);}}>{a.flightPlan.map((point, index) => <li key={index} className={`${styles.leg} ${dropAt === index && dragged !== index ? styles.dropTarget : ""} ${live && a.radar && index < a.radar.routeIndex ? styles.passed : ""}`}
      draggable={grab === index} onDragStart={event => {event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); setDragged(index);}} onDragEnd={() => {setGrab(null); setDragged(null); setDropAt(null);}}
      onDragOver={event => {if (dragged === null) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropAt(index);}} onDrop={event => {event.preventDefault(); if (dragged !== null) move(dragged, index); setGrab(null); setDragged(null); setDropAt(null);}}>
      <div className={styles.legRow} onPointerDown={() => setGrab(index)} onPointerUp={() => setGrab(null)}><DotsSixVertical size={16} aria-hidden="true" className={styles.dragHandle}/><span className={styles.number}>{index + 1}</span><div className={styles.legName}><strong>{point.name ?? `Waypoint ${index + 1}`}{point.finalApproachFix ? " · FAF" : ""}{live && a.radar?.navigation === "route" && index === a.radar.routeIndex ? " · next" : ""}</strong><span className={styles.profile}>{legAltitudeLabel(a.flightPlan, index, a.altitude)}</span></div><small className={styles.coordinates}>{point.x.toFixed(1)} E · {point.y.toFixed(1)} N</small></div>
      <details className={styles.legEditor}><summary aria-label={`Edit leg ${index + 1}`}><DotsThreeVertical size={20} aria-hidden="true"/></summary><div className={styles.legFields}>
        {a.radar ? <label className={styles.check}><input type="checkbox" checked={!!point.finalApproachFix} onChange={event => change(a.flightPlan.map((p, i) => ({...p, finalApproachFix: i === index && event.target.checked ? true : undefined})))}/>Final approach fix (GPS)</label> : null}
        <label>Leg {index + 1} altitude target<select value={point.altitude ?? ""} onChange={event => {const altitude = event.target.value ? Number(event.target.value) : undefined; onEdit({...flightPlanPatch(a, a.flightPlan.map((p, i) => i === index ? {...p, altitude} : p), live), ...(altitude !== undefined && a.followRouteAltitudes === undefined ? {followRouteAltitudes: true} : {})});}}><option value="">Maintain previous altitude</option>{ALTITUDES.map(altitude => <option key={altitudeLabel(altitude)} value={altitudeFeet(altitude)}>{altitude.unit === "feet" ? `${altitude.value} ft MSL` : altitudeLabel(altitude)}</option>)}</select></label>
        <label>Leg {index + 1} speed target (kt)<input type="number" min={80} max={600} step={1} placeholder="Automatic" key={`${a.id}:${index}:${point.speed}`} defaultValue={point.speed ?? ""} onBlur={event => {if (event.currentTarget.validity.valid) {const speed = event.target.value ? Number(event.target.value) : undefined; change(a.flightPlan.map((p, i) => i === index ? {...p, speed} : p));}}}/></label>
        <div className={styles.actions}><button type="button" disabled={index === 0} aria-label={`Move leg ${index + 1} earlier`} onClick={() => move(index, index - 1)}><ArrowUp size={16}/></button><button type="button" disabled={index === a.flightPlan.length - 1} aria-label={`Move leg ${index + 1} later`} onClick={() => move(index, index + 1)}><ArrowDown size={16}/></button><button type="button" aria-label={`Remove leg ${index + 1}`} onClick={() => change(a.flightPlan.filter((_, i) => i !== index))}><Trash size={16}/>Remove</button></div>
      </div></details>
    </li>)}</ol>}
    {a.flightPlan.length > 1 ? <p className={styles.help}>Drag a fix to reorder it, or use its menu to move, edit or remove it.</p> : null}
    {a.radar ? <div className={styles.guidance}><label>{live ? "Guidance" : "Initial guidance"}<select disabled={live && !!a.radar.departure} value={a.radar.navigation} onChange={event => onEdit({radar: {...a.radar!, navigation: event.target.value as "heading" | "route", routeIndex: 0, cleared: undefined, captured: false, localizer: false, glideslope: false, clearanceAltitudeChecked: false}})}><option value="heading">Fly heading</option><option value="route" disabled={!a.flightPlan.length}>Follow flight plan</option>{!["heading", "route"].includes(a.radar.navigation) ? <option value={a.radar.navigation}>{a.radar.navigation}</option> : null}</select></label>
      <label className={styles.check}><input type="checkbox" disabled={!a.flightPlan.length} checked={!!a.followRouteAltitudes} onChange={event => onEdit({followRouteAltitudes: event.target.checked, starDescent: undefined})}/>Follow planned climbs and descents</label><p className={styles.help}>Controller instructions override planned altitude targets. For GPS approaches, mark the final approach fix; an unmarked straight-in plan uses its last fix before the runway as a schematic FAF.</p></div> : null}
    <details className={styles.secondary}><summary>Destination and diversion</summary><RouteSetup aircraft={a} onEdit={onEdit} includeWaypoints={false}/></details>
    {a.flightPlan.length ? <button type="button" className={styles.clearButton} onClick={() => {onEdit({...flightPlanPatch(a, [], live), navigationSource: undefined, followRouteAltitudes: undefined, arrivalProcedure: undefined}); setNotice("Flight plan cleared.");}}>Clear flight plan</button> : null}
    {open ? <FlightPlanAddDialog aircraft={a} airport={airport} live={live} onEdit={onEdit} onClose={() => setOpen(false)} onAdded={setNotice}/> : null}
  </section>;
}
