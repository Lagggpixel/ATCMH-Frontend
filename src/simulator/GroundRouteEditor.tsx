"use client";
import {useEffect, useRef, useState} from "react";
import {buildGroundRoute, canRouteGround, destinationAt, groundPointKey, groundRouteKind} from "./ground-route";
import {groundRouteItems} from "./ground-route-display";
import type {Aircraft, Airport, GroundRoute, GroundRouteDestination, Instruction, Point} from "./model";
import styles from "./Simulator.module.css";

export type GroundClearance = Extract<Instruction, {type: "taxi" | "pushback"}>;
export type SendGroundClearance = (aircraftId: string, command: GroundClearance) => Promise<boolean>;
interface Draft {aircraftId: string; kind: GroundRoute["kind"]; controls: Point[]; destination: GroundRouteDestination; route?: GroundRoute; error?: string; holds: Record<string, boolean>; pending: boolean; invalid?: boolean}

export function useGroundRoute(airport: Airport, aircraft: Aircraft[], selected: string | null, enabled: boolean, onSend?: SendGroundClearance) {
  const [draft, setDraft] = useState<Draft | null>(null), [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const target = draft && aircraft.find(a => a.id === draft.aircraftId);
  const available = enabled && (!target || canRouteGround(target, airport) && target.frequency === "ground");
  if (draft && (!available || selected !== draft.aircraftId || !target)) setDraft(null);
  const controls = draft?.controls, destination = draft?.destination, kind = draft?.kind;
  useEffect(() => {
    if (!controls || !destination || !kind) return;
    const timer = setTimeout(() => {
      const built = buildGroundRoute(airport, kind, controls, destination);
      setDraft(current => current?.controls === controls ? {...current, ...built, invalid: !!built.error, route: built.route && {...built.route, points: built.route.points.map(p => ({...p, ...(groundPointKey(p) in current.holds ? {hold: current.holds[groundPointKey(p)]} : {})}))}, pending: false} : current);
    }, 60);
    return () => clearTimeout(timer);
  }, [airport, controls, destination, kind]);
  const start = (a: Aircraft, point: Point, destination: GroundRouteDestination = {type: "point"}) => {
    if (!enabled || sending.current || !canRouteGround(a, airport) || a.frequency !== "ground") return;
    setDraft({aircraftId: a.id, kind: groundRouteKind(a, airport), controls: [{...a.position}, {...point}], destination, holds: {}, pending: true});
  };
  const move = (index: number, point: Point, insert = false) => setDraft(current => {
    if (!current || sending.current || index < 1 || index >= current.controls.length) return current;
    const controls = current.controls.map(p => ({...p}));
    if (insert) controls.splice(index, 0, {...point}); else controls[index] = {...point};
    return {...current, controls, destination: !insert && index === controls.length - 1 ? destinationAt(airport, point) : current.destination, route: undefined, error: undefined, pending: true};
  });
  const cancel = () => {if (!sending.current) setDraft(null);};
  const send = async () => {
    if (sending.current || !onSend || !draft?.route || draft.pending || draft.invalid || !available) return;
    const submitted = draft;
    sending.current = true; setBusy(true);
    const route = structuredClone(draft.route);
    const command: GroundClearance = route.kind === "pushback" ? {type: "pushback", route} : {type: "taxi", route, ...(route.destination.type === "runway" ? {runway: route.destination.id, destination: "runway", contactTowerWhenReady: !route.points.some(p => p.hold)} : route.destination.type === "parking" ? {destination: "parking"} : {})};
    try {
      if (await onSend(draft.aircraftId, command)) setDraft(current => current === submitted ? null : current);
      else setDraft(current => current === submitted ? {...current, error: "Route was not sent. Review the connection or error, then retry."} : current);
    } catch {setDraft(current => current === submitted ? {...current, error: "Route was not sent. Try again."} : current);}
    finally {sending.current = false; setBusy(false);}
  };
  return {draft: available ? draft : null, busy, start, move, cancel, send,
    choose: (point: Point, destination: GroundRouteDestination) => setDraft(current => current && !sending.current ? {...current, controls: [current.controls[0], point], destination, holds: {}, route: undefined, error: undefined, pending: true} : current),
    hold: (index: number, hold: boolean) => setDraft(current => current?.route && !sending.current ? {...current, holds: {...current.holds, [groundPointKey(current.route.points[index])]: hold}, route: {...current.route, points: current.route.points.map((p, i) => i === index ? {...p, hold} : p)}} : current),
  };
}

export default function GroundRouteEditor({airport, aircraft, routing}: {airport: Airport; aircraft: Aircraft; routing: ReturnType<typeof useGroundRoute>}) {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const sendPressed = useRef(false);
  const {draft, busy} = routing;
  if (!draft || draft.aircraftId !== aircraft.id) return null;
  const route = draft.route, items = route ? groundRouteItems(airport, route) : [];
  return <section className={styles.groundRouteEditor} aria-label="Current Path" onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
    <header>Current Path</header>
    <div className={styles.groundRouteList}>
      <ol aria-label="Route legs" role="listbox">{items.map(item => <li key={item.key} role="option" aria-selected={selectedItem === item.key} tabIndex={-1} onFocus={() => setSelectedItem(item.key)} onClick={() => setSelectedItem(item.key)} onKeyDown={event => {if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {event.preventDefault(); setSelectedItem(item.key);}}}>
        {item.canHold ? <div className={styles.groundRouteRow}><input className={styles.groundRouteCheckbox} type="checkbox" disabled={busy} aria-label={`Hold at ${item.name}${item.type === "hold" ? " threshold" : ""}`} checked={item.hold} onChange={event => routing.hold(item.index, event.target.checked)}/><span>{item.text}</span></div> : <span className={styles.groundRouteFixedItem}>{item.text}</span>}
      </li>)}</ol>
      {draft.pending ? <p role="status">FINDING PATH...</p> : draft.error ? <p role={draft.controls.length === 2 && draft.controls[0].x === draft.controls[1].x && draft.controls[0].y === draft.controls[1].y ? "status" : "alert"}>{draft.controls[0].x === draft.controls[1].x && draft.controls[0].y === draft.controls[1].y ? "Drag the destination onto a taxiway, runway or stand." : draft.error}</p> : null}
    </div>
    <footer><button disabled={busy} onClick={routing.cancel}>Cancel</button><button disabled={busy || draft.pending || draft.invalid || !route} onPointerDown={() => {sendPressed.current = true;}} onPointerCancel={() => {sendPressed.current = false;}} onClick={event => {
      const pressed = sendPressed.current; sendPressed.current = false;
      if (event.detail && !pressed) return;
      void routing.send();
    }}>{busy ? "Sending…" : draft.kind === "pushback" ? draft.invalid ? "Invalid Path" : "Send Pushback" : "Send Taxi"}</button></footer>
  </section>;
}
