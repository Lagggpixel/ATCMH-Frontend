"use client";
import {useEffect, useRef, useState, type KeyboardEvent, type PointerEvent} from "react";
import {DotsThreeVertical} from "@phosphor-icons/react/dist/csr/DotsThreeVertical";
import {DotsSixVertical} from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import {CaretDown} from "@phosphor-icons/react/dist/csr/CaretDown";
import {CaretUp} from "@phosphor-icons/react/dist/csr/CaretUp";
import {ArrowUp} from "@phosphor-icons/react/dist/csr/ArrowUp";
import {ArrowDown} from "@phosphor-icons/react/dist/csr/ArrowDown";
import {Trash} from "@phosphor-icons/react/dist/csr/Trash";
import {AirplaneTakeoff} from "@phosphor-icons/react/dist/csr/AirplaneTakeoff";
import {AirplaneLanding} from "@phosphor-icons/react/dist/csr/AirplaneLanding";
import {Path} from "@phosphor-icons/react/dist/csr/Path";
import FlightPlanAddPanel from "./FlightPlanAddPanel";
import RouteSetup from "./RouteSetup";
import {ALTITUDES, altitudeFeet, altitudeLabel} from "./radar";
import {flightPlanItems, flightPlanPatch, legAltitudeLabel, moveFlightPlanItem, moveFlightPlanRange, type FlightPlanItem} from "./scenario-flight-plan";
import {setFlightPlanPreview} from "./flight-plan-preview";
import type {Aircraft, Airport, RoutePoint} from "./model";
import styles from "./ScenarioFlightPlan.module.css";

const PROCEDURE = {SID: {label: "Departure", Icon: AirplaneTakeoff}, STAR: {label: "Arrival", Icon: AirplaneLanding}, Approach: {label: "Approach", Icon: Path}} as const;
const fixName = (point: RoutePoint, index: number) => point.name ?? `Waypoint ${index + 1}`;
const itemName = (points: RoutePoint[], item: FlightPlanItem) => item.procedure?.name ?? fixName(points[item.start], item.start);
// Pointer travel before a press on a row becomes a drag, so clicks on the row still work.
const DRAG_THRESHOLD = 4;

type Drag = {start: number; end: number; pointerId: number; originY: number; top: number; offset: number; moved: boolean; slot: number | null};

/**
 * Flight plans are built from navigation data: typed, searched or reordered, never drawn on the scope.
 * Fixes added from one procedure stay together as a group, and a drag moves only the grabbed fix or group.
 */
export default function ScenarioFlightPlan({aircraft: a, airport, onEdit, live = false}: {aircraft: Aircraft; airport: Airport; onEdit: (patch: Partial<Aircraft>) => void; live?: boolean}) {
  const [notice, setNotice] = useState(""), [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null), [picked, setPicked] = useState<{start: number; original: RoutePoint[]} | null>(null);
  const [hovered, setHovered] = useState<string>();
  const section = useRef<HTMLElement>(null), list = useRef<HTMLOListElement>(null);
  const points = a.flightPlan, items = flightPlanItems(points), routeIndex = live && a.radar ? a.radar.routeIndex : -1;
  const next = live && a.radar?.navigation === "route" ? routeIndex : -1;
  const change = (plan: RoutePoint[]) => onEdit(flightPlanPatch(a, plan, live));
  const removeRange = (start: number, end: number) => change(points.filter((_, i) => i < start || i > end));

  const highlighted = drag ? undefined : items.find(item => item.procedure && item.procedure.key === hovered);
  const highlightPoints = highlighted ? points.slice(highlighted.start, highlighted.end + 1) : [];
  useEffect(() => {setFlightPlanPreview("highlight", highlightPoints.length > 1 ? {aircraftId: a.id, points: highlightPoints} : null);});
  useEffect(() => () => setFlightPlanPreview("highlight", null), []);
  // Keyboard moves re-render the list; keep focus on the handle of the item being moved.
  useEffect(() => {if (picked) list.current?.querySelector<HTMLElement>(`[data-handle="${picked.start}"]`)?.focus();}, [picked]);

  const slotAt = (y: number, start: number) => {
    for (const node of list.current?.querySelectorAll<HTMLElement>(":scope > li[data-start]") ?? []) {
      const itemStart = Number(node.dataset.start), bounds = node.getBoundingClientRect();
      if (itemStart !== start && y < bounds.top + bounds.height / 2) return itemStart;
    }
    return points.length;
  };
  const autoScroll = (y: number) => {
    for (let node = list.current?.parentElement; node; node = node.parentElement) {
      if (!/(auto|scroll)/.test(getComputedStyle(node).overflowY) || node.scrollHeight <= node.clientHeight) continue;
      const bounds = node.getBoundingClientRect();
      if (y < bounds.top + 48) node.scrollBy(0, -14); else if (y > bounds.bottom - 48) node.scrollBy(0, 14);
      return;
    }
  };
  // Pointer events instead of native drag and drop: the browser's drag image captured every row below the grabbed one.
  const pointerDown = (item: FlightPlanItem) => (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || picked || (event.target as Element).closest("button:not([data-handle]), summary, input, select, label, a")) return;
    const bounds = event.currentTarget.closest("li")!.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({start: item.start, end: item.end, pointerId: event.pointerId, originY: event.clientY, top: bounds.top - (section.current?.getBoundingClientRect().top ?? 0), offset: event.clientY - bounds.top, moved: false, slot: null});
  };
  const pointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.abs(event.clientY - drag.originY) < DRAG_THRESHOLD) return;
    event.preventDefault(); autoScroll(event.clientY);
    const slot = slotAt(event.clientY, drag.start);
    const top = event.clientY - drag.offset - (section.current?.getBoundingClientRect().top ?? 0);
    setDrag({...drag, moved: true, top, slot: slot >= drag.start && slot <= drag.end + 1 ? null : slot});
  };
  const pointerEnd = (event: PointerEvent<HTMLElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.moved && drag.slot !== null && event.type === "pointerup") {
      change(moveFlightPlanRange(points, drag.start, drag.end, drag.slot));
      setNotice(`Moved ${itemName(points, {start: drag.start, end: drag.end, procedure: points[drag.start].procedure})}.`);
    }
    setDrag(null);
  };
  const moveItem = (item: FlightPlanItem, direction: -1 | 1) => {
    const neighbour = items[items.indexOf(item) + direction];
    if (!neighbour) return item.start;
    change(moveFlightPlanItem(points, item.start, direction));
    return direction < 0 ? neighbour.start : item.start + neighbour.end - neighbour.start + 1;
  };
  const handleKey = (item: FlightPlanItem) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const name = itemName(points, item);
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (picked) {setPicked(null); setNotice(`Dropped ${name} at fix ${item.start + 1}.`);}
      else {setPicked({start: item.start, original: points}); setNotice(`Picked up ${name}. Use the up and down arrow keys to move it, Space to drop, or Escape to cancel.`);}
    } else if (picked && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const start = moveItem(item, event.key === "ArrowUp" ? -1 : 1);
      setPicked({...picked, start}); setNotice(`${name} is now fix ${start + 1}.`);
    } else if (picked && event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      change(picked.original); setPicked(null); setNotice(`Cancelled moving ${name}.`);
    }
  };
  const toggle = (key: string) => setExpanded(current => {const next = new Set(current); if (!next.delete(key)) next.add(key); return next;});

  const fixEditor = (point: RoutePoint, index: number, item?: FlightPlanItem) => <details className={styles.legEditor}><summary aria-label={`Edit ${fixName(point, index)}`}><DotsThreeVertical size={20} aria-hidden="true"/></summary><div className={styles.legFields}>
    {a.radar ? <label className={styles.check}><input type="checkbox" checked={!!point.finalApproachFix} onChange={event => change(points.map((p, i) => ({...p, finalApproachFix: i === index && event.target.checked ? true : undefined})))}/>Final approach fix (GPS)</label> : null}
    <label>Altitude target at {fixName(point, index)}<select value={point.altitude ?? ""} onChange={event => {const altitude = event.target.value ? Number(event.target.value) : undefined; onEdit({...flightPlanPatch(a, points.map((p, i) => i === index ? {...p, altitude} : p), live), ...(altitude !== undefined && a.followRouteAltitudes === undefined ? {followRouteAltitudes: true} : {})});}}><option value="">Maintain previous altitude</option>{ALTITUDES.map(altitude => <option key={altitudeLabel(altitude)} value={altitudeFeet(altitude)}>{altitude.unit === "feet" ? `${altitude.value} ft MSL` : altitudeLabel(altitude)}</option>)}</select></label>
    <label>Speed target at {fixName(point, index)} (kt)<input type="number" min={80} max={600} step={1} placeholder="Automatic" key={`${a.id}:${index}:${point.speed}`} defaultValue={point.speed ?? ""} onBlur={event => {if (event.currentTarget.validity.valid) {const speed = event.target.value ? Number(event.target.value) : undefined; change(points.map((p, i) => i === index ? {...p, speed} : p));}}}/></label>
    <div className={styles.actions}>{item ? <><button type="button" disabled={item === items[0]} onClick={() => moveItem(item, -1)}><ArrowUp size={16} aria-hidden="true"/>Earlier</button><button type="button" disabled={item === items.at(-1)} onClick={() => moveItem(item, 1)}><ArrowDown size={16} aria-hidden="true"/>Later</button></> : null}<button type="button" onClick={() => removeRange(index, index)}><Trash size={16} aria-hidden="true"/>Remove</button></div>
  </div></details>;

  const fixLabel = (point: RoutePoint, index: number) => <>{fixName(point, index)}{point.finalApproachFix ? <span className={styles.tag}>FAF</span> : null}{index === next ? <span className={`${styles.tag} ${styles.nextTag}`}>Next</span> : null}</>;

  const row = (item: FlightPlanItem) => {
    const {start, end, procedure} = item, moving = drag?.moved ? drag : undefined;
    const className = [styles.item, procedure ? styles.group : styles.fix, moving?.start === start ? styles.placeholder : "", moving?.slot === start ? styles.dropBefore : "",
      moving?.slot === points.length && item === items.at(-1) ? styles.dropAfter : "", picked?.start === start ? styles.picked : "",
      end < routeIndex ? styles.passed : "", procedure && highlighted?.procedure?.key === procedure.key ? styles.hovered : ""].filter(Boolean).join(" ");
    const handle = <button type="button" data-handle={start} className={styles.handle} aria-label={`Move ${itemName(points, item)}`} aria-pressed={picked?.start === start} onKeyDown={handleKey(item)} onBlur={() => {if (picked?.start === start) setPicked(null);}}><DotsSixVertical size={16} aria-hidden="true"/></button>;
    const rowEvents = {onPointerDown: pointerDown(item), onPointerMove: pointerMove, onPointerUp: pointerEnd, onPointerCancel: pointerEnd};
    if (!procedure) {
      const point = points[start];
      return <li key={`fix-${start}`} data-start={start} className={className}>
        <div className={styles.itemRow} {...rowEvents}>{handle}<span className={styles.number}>{start + 1}</span><div className={styles.legName}><strong>{fixLabel(point, start)}</strong><span className={styles.profile}>{legAltitudeLabel(points, start, a.altitude)}</span></div><small className={styles.direct}>DCT</small></div>
        {fixEditor(point, start, item)}
      </li>;
    }
    const {label, Icon} = PROCEDURE[procedure.type], open = expanded.has(procedure.key) && !moving, fixes = points.slice(start, end + 1);
    const nextFix = next >= start && next <= end ? fixName(points[next], next) : undefined;
    return <li key={procedure.key} data-start={start} className={className} onPointerEnter={() => setHovered(procedure.key)} onPointerLeave={() => setHovered(current => current === procedure.key ? undefined : current)}>
      <div className={styles.itemRow} {...rowEvents}>{handle}<Icon size={18} aria-hidden="true" className={styles.groupIcon}/>
        <div className={styles.legName}><strong>{procedure.name}{nextFix ? <span className={`${styles.tag} ${styles.nextTag}`}>Next {nextFix}</span> : null}</strong><span className={styles.groupMeta}>{label}{procedure.transition ? ` · via ${procedure.transition}` : ""} · {start === end ? `fix ${start + 1}` : `fixes ${start + 1}–${end + 1}`}</span>{open ? null : <span className={styles.groupFixes}>{fixes.map((point, offset) => fixName(point, start + offset)).join(" · ")}</span>}</div>
        <button type="button" className={styles.iconButton} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${procedure.name} fixes`} onClick={() => toggle(procedure.key)}>{open ? <CaretUp size={16} aria-hidden="true"/> : <CaretDown size={16} aria-hidden="true"/>}</button>
      </div>
      <details className={styles.legEditor}><summary aria-label={`${procedure.name} options`}><DotsThreeVertical size={20} aria-hidden="true"/></summary><div className={`${styles.legFields} ${styles.actions}`}>
        <button type="button" disabled={item === items[0]} onClick={() => moveItem(item, -1)}><ArrowUp size={16} aria-hidden="true"/>Earlier</button>
        <button type="button" disabled={item === items.at(-1)} onClick={() => moveItem(item, 1)}><ArrowDown size={16} aria-hidden="true"/>Later</button>
        <button type="button" onClick={() => {change(points.map((p, i) => i < start || i > end ? p : {...p, procedure: undefined})); setNotice(`${procedure.name} is now ${fixes.length} separate ${fixes.length === 1 ? "fix" : "fixes"}.`);}}>Ungroup into fixes</button>
        <button type="button" className={styles.danger} onClick={() => {removeRange(start, end); setNotice(`Removed ${procedure.name}.`);}}><Trash size={16} aria-hidden="true"/>Remove procedure</button>
      </div></details>
      {open ? <ol className={styles.groupLegs} aria-label={`${procedure.name} fixes`}>{fixes.map((point, offset) => {const index = start + offset; return <li key={index} className={`${styles.groupLeg} ${index < routeIndex ? styles.passed : ""}`}>
        <div className={styles.groupLegRow}><span className={styles.number}>{index + 1}</span><div className={styles.legName}><strong>{fixLabel(point, index)}</strong><span className={styles.profile}>{legAltitudeLabel(points, index, a.altitude)}</span></div></div>
        {fixEditor(point, index)}
      </li>;})}</ol> : null}
    </li>;
  };

  const ghost = drag?.moved ? items.find(item => item.start === drag.start) : undefined;
  return <section ref={section} className={styles.plan} aria-label={live ? "Flight plan" : "Scenario flight plan"}>
    <div className={styles.heading}><h3>Flight plan</h3><span>{points.length} / 200 fixes{items.some(item => item.procedure) ? ` · ${items.filter(item => item.procedure).length} procedures` : ""}{live && !a.radar ? " · display only" : ""}</span></div>
    <FlightPlanAddPanel aircraft={a} airport={airport} live={live} onEdit={onEdit} onAdded={setNotice}/>
    <p role="status" className={notice ? styles.help : styles.visuallyHidden}>{notice}</p>
    {!points.length ? <p className={styles.empty}>The flight plan is empty. Search above for a waypoint, departure, arrival or approach, or type a route such as TLA DCT GOW.</p>
      : <ol ref={list} className={`${styles.legs} ${drag?.moved ? styles.dragging : ""}`} aria-label="Flight plan fixes">{items.map(row)}</ol>}
    {ghost && drag ? <div className={styles.ghost} aria-hidden="true" style={{top: drag.top}}><DotsSixVertical size={16}/><strong>{itemName(points, ghost)}</strong>{ghost.procedure ? <span className={styles.tag}>{ghost.end - ghost.start + 1} fixes</span> : <small className={styles.direct}>DCT</small>}</div> : null}
    {items.length > 1 ? <p className={styles.help}>Drag a fix or procedure to reorder it. With the keyboard, focus its handle, press Space, then use the arrow keys.</p> : null}
    {a.radar ? <div className={styles.guidance}><label>{live ? "Guidance" : "Initial guidance"}<select disabled={live && !!a.radar.departure} value={a.radar.navigation} onChange={event => onEdit({radar: {...a.radar!, navigation: event.target.value as "heading" | "route", routeIndex: 0, cleared: undefined, captured: false, localizer: false, glideslope: false, clearanceAltitudeChecked: false}})}><option value="heading">Fly heading</option><option value="route" disabled={!points.length}>Follow flight plan</option>{!["heading", "route"].includes(a.radar.navigation) ? <option value={a.radar.navigation}>{a.radar.navigation}</option> : null}</select></label>
      <label className={styles.check}><input type="checkbox" disabled={!points.length} checked={!!a.followRouteAltitudes} onChange={event => onEdit({followRouteAltitudes: event.target.checked, starDescent: undefined})}/>Follow planned climbs and descents</label><p className={styles.help}>Controller instructions override planned altitude targets. For GPS approaches, mark the final approach fix; an unmarked straight-in plan uses its last fix before the runway as a schematic FAF.</p></div> : null}
    <details className={styles.secondary}><summary>Destination and diversion</summary><RouteSetup aircraft={a} onEdit={onEdit} includeWaypoints={false}/></details>
    {points.length ? <button type="button" className={styles.clearButton} onClick={() => {onEdit({...flightPlanPatch(a, [], live), navigationSource: undefined, followRouteAltitudes: undefined, arrivalProcedure: undefined}); setNotice("Flight plan cleared.");}}>Clear flight plan</button> : null}
  </section>;
}
