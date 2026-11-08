"use client";
import type {ReactNode} from "react";
import GroundRouteOverlay from "./GroundRouteOverlay";
import {messageMenu} from "./MessagePanel";
import type {DemoState} from "./demonstration";
import type {Aircraft, Airport, Exercise, Point, RadarEnvironment} from "./model";
import {vectorPreview} from "./radar";
import {TRAINEE_BLUE, traineeFocus, traineeGroundRoute} from "./trainee-overlay";
import {outsideVectorCircle, VECTOR_CANCEL_RADIUS} from "./vector-drag";
import styles from "./Simulator.module.css";

/** What a staff radar draws for the trainee: everything is read-only and drawn over the staff's own view. */
export interface TraineeScopeView {name?: string; state: DemoState | null; followZoom: boolean; messages?: ReactNode}

/** The toolbar switches. Positions appear only when the session is split. */
export function TraineeControlsSwitch({show, followZoom, onShow, onFollowZoom, positions, position, onPosition, disabled}: {show: boolean; followZoom: boolean; onShow: (show: boolean) => void; onFollowZoom: (follow: boolean) => void; positions?: readonly {id: string; name: string}[]; position?: string; onPosition?: (id: string) => void; disabled?: boolean}) {
  return <span className={styles.traineeControls}>
    <button type="button" role="switch" className={styles.demoSwitch} aria-checked={show} disabled={disabled} title="Show your mentee's selection, drags and open messages on your radar (V)" aria-keyshortcuts="V" onClick={() => onShow(!show)}><span aria-hidden="true"/>Mentee controls</button>
    {show && positions && positions.length > 1 ? <select aria-label="Mentee position to show" value={position} onChange={event => onPosition?.(event.target.value)}>{positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : null}
    {show ? <label><input type="checkbox" checked={followZoom} onChange={event => onFollowZoom(event.target.checked)}/>Follow mentee&apos;s zoom</label> : null}
  </span>;
}

/** The trainee's selection ring and drags, in the staff radar's own projection. */
export function TraineeScopeLayer({state, name, aircraft, airport, environment, project, scale, size}: {state: DemoState; name?: string; aircraft: readonly Aircraft[]; airport: Airport; environment?: RadarEnvironment; project: (p: Point) => Point; scale: number; size: {width: number; height: number}}) {
  const focus = traineeFocus(state), focused = focus ? aircraft.find(a => a.id === focus) : undefined;
  const ring = focused ? project(focused.position) : null;
  const dragged = state.vectorDraft ? aircraft.find(a => a.id === state.vectorDraft!.aircraftId) : undefined;
  const preview = dragged && state.vectorDraft && !state.vectorDraft.initial && outsideVectorCircle(dragged.position, state.vectorDraft.point, scale) ? vectorPreview(dragged, state.vectorDraft.point, airport, environment, scale) : null;
  const from = dragged ? project(dragged.position) : null, to = preview ? project(preview.point) : null;
  const route = traineeGroundRoute(airport, state.ground);
  const routeAircraft = state.ground ? aircraft.find(a => a.id === state.ground!.aircraftId) : undefined;
  const who = name ?? "Mentee";
  return <>
    {route ? <GroundRouteOverlay airport={airport} route={route} aircraftType={routeAircraft?.type} project={project} scale={scale} bounds={size} onMove={() => {}} color={TRAINEE_BLUE} label={`${who}'s draft ground route`}/> : null}
    {from && dragged ? <svg className={`${styles.vectorOverlay} ${styles.traineeVector}`} width={size.width} height={size.height} role="img" aria-label={`${who} is vectoring ${dragged.callsign}`} fill="none" stroke={TRAINEE_BLUE}>
      <circle cx={from.x} cy={from.y} r={VECTOR_CANCEL_RADIUS}/>
      {to ? <><line x1={from.x} y1={from.y} x2={to.x} y2={to.y}/><circle cx={to.x} cy={to.y} r={VECTOR_CANCEL_RADIUS / 2}/></> : null}
    </svg> : null}
    {to && preview ? <span className={styles.traineeVectorLabel} style={{left: to.x, top: to.y}}>{String(preview.heading || 360).padStart(3, "0")}° {String(Math.floor(preview.nm)).padStart(3, "0")}NM{preview.target ? ` · ${preview.target.name}` : ""}</span> : null}
    {ring && focused ? <span className={styles.traineeRing} role="img" aria-label={`${who} has ${focused.callsign} selected`} style={{left: ring.x, top: ring.y}}><span>{who}</span></span> : null}
  </>;
}

/** The trainee's open message list, read-only, for the staff radar's bottom-right corner. */
export function TraineeMessages({name, state, exercise}: {name?: string; state: DemoState | null; exercise: Exercise}) {
  const aircraft = state?.messageId ? exercise.aircraft.find(a => a.id === state.messageId) : undefined;
  if (!state || !aircraft) return null;
  const frequency = aircraft.frequency ?? state.frequency;
  const {path, entries} = messageMenu(exercise, aircraft, frequency, state.menuPath, true);
  return <section className={styles.traineeMessages} aria-label={`${name ?? "Mentee"}'s open messages`}>
    <header><strong>{aircraft.callsign}</strong><small>{name ?? "Mentee"}</small></header>
    {path.length ? <p className={styles.traineeMenuPath}>{path.map(entry => entry.label).join(" › ")}</p> : null}
    <ul>{entries.slice(0, 12).map((entry, i) => <li key={entry.id ?? `${i}-${entry.label}`} className={entry.suggested ? styles.suggestedCommand : undefined}>{entry.label}{entry.children ? <span aria-hidden="true"> ›</span> : null}</li>)}</ul>
  </section>;
}
