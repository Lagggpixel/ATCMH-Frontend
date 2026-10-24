"use client";
import {useEffect, useRef, useState} from "react";
import {runwayEnds} from "./airports";
import {buildGroundRoute, canRouteGround, groundPointKey, groundRouteKind, groundRouteText, routeDestinationLabel} from "./ground-route";
import type {Aircraft, Airport, GroundRoute, GroundRouteDestination, Instruction, Point} from "./model";
import {standPoints} from "./stand-geometry";
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
    return {...current, controls, destination: !insert && index === controls.length - 1 ? {type: "point"} : current.destination, route: undefined, error: undefined, pending: true};
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
    remove: (index: number) => setDraft(current => current && !sending.current ? {...current, controls: current.controls.filter((_, i) => i !== index), route: undefined, pending: true} : current),
    hold: (index: number, hold: boolean) => setDraft(current => current?.route && !sending.current ? {...current, holds: {...current.holds, [groundPointKey(current.route.points[index])]: hold}, route: {...current.route, points: current.route.points.map((p, i) => i === index ? {...p, hold} : p)}} : current),
  };
}

export default function GroundRouteEditor({airport, aircraft, routing}: {airport: Airport; aircraft: Aircraft; routing: ReturnType<typeof useGroundRoute>}) {
  const {draft, busy} = routing;
  if (!draft || draft.aircraftId !== aircraft.id) return null;
  const route = draft.route, stands = airport.features.filter(f => f.kind === "parking_position" && f.points.length > 1);
  return <section className={styles.groundRouteEditor} aria-label="Current Path" onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
    <header><strong>Current Path · {aircraft.callsign}</strong><span>{draft.kind === "pushback" ? "Pushback" : "Taxi"} preview</span></header>
    {draft.kind === "taxi" ? <label>Destination<select aria-label="Taxi route destination" disabled={busy} value={draft.destination.type === "point" ? "point" : `${draft.destination.type}:${draft.destination.id}`} onChange={event => {
      const [type, id] = event.target.value.split(":");
      if (type === "runway") routing.choose(runwayEnds(airport).find(end => end.id === id)!.point, {type, id});
      else if (type === "parking") routing.choose(standPoints(airport, stands.find(f => f.id === id)!).at(-1)!, {type, id});
      else routing.move(draft.controls.length - 1, draft.controls.at(-1)!);
    }}><option value="point">Drag destination on map</option>{runwayEnds(airport).map(end => <option key={end.id} value={`runway:${end.id}`}>Runway {end.id}</option>)}{stands.map(stand => <option key={stand.id} value={`parking:${stand.id}`}>{routeDestinationLabel(airport, {type: "parking", id: stand.id})}</option>)}</select></label> : null}
    <p className={styles.groundRouteHelp}>Click the map to set the destination. Drag the magenta line to add a via point; drag a white control point to move it.</p>
    {draft.kind === "pushback" ? <p className={styles.groundRouteHelp}>For push and pull, set the final destination first, then drag the line to place the push endpoint. Each leg supports 300 metres.</p> : null}
    {draft.controls.slice(1, -1).map((_, i) => <p key={i} className={styles.groundRouteHelp}>Via point {i + 1} <button disabled={busy} aria-label={`Remove via point ${i + 1}`} onClick={() => routing.remove(i + 1)}>Remove</button></p>)}
    <ol aria-label="Route legs"><li>Start</li>{route ? route.points.map((p, i) => {
      const control = route.controlIndices.indexOf(i), last = i === route.points.length - 1;
      if (!i || !p.runway && (!p.name || p.name === route.points[i - 1]?.name) && control < 1) return null;
      return <li key={i}><span>{draft.kind === "pushback" && control > 0 ? control === 1 ? "Push to waypoint" : "Pull to waypoint" : last ? routeDestinationLabel(airport, route.destination) : p.runway ? `Runway ${p.runway}` : p.name || "Via waypoint"}</span>{draft.kind === "taxi" && (p.runway || control > 0) ? <label><input type="checkbox" disabled={busy} checked={!!p.hold} onChange={e => routing.hold(i, e.target.checked)}/>Hold</label> : null}</li>;
    }) : null}</ol>
    {draft.pending ? <p role="status">Finding path…</p> : draft.error ? <p role={draft.controls.length === 2 && draft.controls[0].x === draft.controls[1].x && draft.controls[0].y === draft.controls[1].y ? "status" : "alert"}>{draft.controls[0].x === draft.controls[1].x && draft.controls[0].y === draft.controls[1].y ? "Choose a runway or stand, or drag the destination on the map." : draft.error}</p> : route ? <p className={styles.groundRouteHelp}>{groundRouteText(route, airport)}</p> : null}
    <footer><button disabled={busy} onClick={routing.cancel}>Cancel</button><button disabled={busy || draft.pending || draft.invalid || !route} onClick={() => void routing.send()}>{busy ? "Sending…" : draft.kind === "pushback" ? "Send Pushback" : "Send Taxi"}</button></footer>
  </section>;
}
