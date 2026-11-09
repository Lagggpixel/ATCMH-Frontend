"use client";
import {useEffect, useRef, useState, type ReactNode, type RefObject} from "react";
import {Crosshair} from "@phosphor-icons/react/dist/csr/Crosshair";
import {Eye} from "@phosphor-icons/react/dist/csr/Eye";
import {CaretDown} from "@phosphor-icons/react/dist/csr/CaretDown";
import AircraftContextMenu from "./AircraftContextMenu";
import AircraftPopupAnchor from "./AircraftPopupAnchor";
import {trainingMode} from "./airports";
import RadarQuickPopup from "./RadarQuickPopup";
import {airborne} from "./radar";
import {vectorMenuAircraft} from "./vector-drag";
import VectorPreviewBox, {VectorDetails} from "./VectorPreviewBox";
import GroundRouteOverlay from "./GroundRouteOverlay";
import {messageMenu} from "./MessagePanel";
import type {Aircraft, Airport, Exercise, Point, RadarEnvironment} from "./model";
import {vectorPreview} from "./radar";
import {TRAINEE_BLUE, traineeFocus, traineeGroundRoute, traineeMenuAircraft, type TraineeView} from "./trainee-overlay";
import {outsideVectorCircle, VECTOR_CANCEL_RADIUS} from "./vector-drag";
import styles from "./Simulator.module.css";

/** What a staff radar draws for the trainee: everything is read-only and drawn over the staff's own view. */
export interface TraineeScopeView {
  name?: string; state: TraineeView | null;
  /** Show exactly the trainee's view; the staff radar's own zoom and pan pause meanwhile. */ follow: boolean;
  onStopFollow?: () => void;
  messages?: ReactNode;
  /** The trainee's open aircraft menu, drawn read-only beside their aircraft. */ menu?: (aircraft: Aircraft, state: TraineeView) => ReactNode;
}

export interface TraineeChoice {id: string; name: string; trainee?: string}
const possessive = (name: string) => `${name}${name.endsWith("s") ? "\u2019" : "\u2019s"}`;

/** One fixed-width control: whose controls are shown, and whether to follow their view. Nothing moves when it toggles. */
export function TraineeControlsSwitch({show, follow, onShow, onFollow, positions, position, onPosition, disabled, name}: {
  show: boolean; follow: boolean; onShow: (show: boolean) => void; onFollow: (follow: boolean) => void;
  positions?: readonly TraineeChoice[]; position?: string; onPosition?: (id: string) => void; disabled?: boolean; name?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {if (!(event.target instanceof Node) || !root.current?.contains(event.target)) setOpen(false);};
    const escape = (event: KeyboardEvent) => {if (event.key === "Escape") setOpen(false);};
    document.addEventListener("pointerdown", close, true); document.addEventListener("keydown", escape);
    return () => {document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", escape);};
  }, [open]);
  const several = !!positions && positions.length > 1;
  const current = positions?.find(p => p.id === position) ?? positions?.[0];
  const who = (several ? current?.trainee : undefined) ?? name ?? current?.trainee;
  const label = show && who ? `${possessive(who)} controls` : "Mentee controls";
  const pickerLabel = show && current ? `${current.trainee ?? "Mentee"} · ${current.name}` : "Mentee controls";
  return <span ref={root} className={styles.traineeControls} data-on={show || undefined}>
    {several ? <button type="button" className={styles.traineeShow} aria-haspopup="menu" aria-expanded={open} disabled={disabled} aria-keyshortcuts="V" title="Choose whose selection, drags and open messages show on your radar (V toggles)" onClick={() => setOpen(!open)}>
      <Eye aria-hidden="true" weight={show ? "fill" : "regular"}/><span>{pickerLabel}</span><CaretDown aria-hidden="true"/>
    </button> : <button type="button" role="switch" className={styles.traineeShow} aria-checked={show} disabled={disabled} aria-keyshortcuts="V" title="Show your mentee's selection, drags and open messages on your radar (V)" onClick={() => onShow(!show)}>
      <Eye aria-hidden="true" weight={show ? "fill" : "regular"}/><span>{label}</span>
    </button>}
    <button type="button" role="switch" className={styles.traineeFollow} aria-checked={show && follow} disabled={disabled || !show} title={show ? "Follow your mentee's zoom and panning" : "Show mentee controls to follow them"} onClick={() => onFollow(!follow)}>
      <Crosshair aria-hidden="true" weight="bold"/><span>Follow</span>
    </button>
    {several && open ? <div className={styles.traineePicker} role="menu" aria-label="Show controls for">
      <p>Show controls for</p>
      {positions!.map(p => <button key={p.id} type="button" role="menuitemradio" aria-checked={show && p.id === current?.id} onClick={() => {onPosition?.(p.id); if (!show) onShow(true); setOpen(false);}}>
        <span>{p.trainee ?? "No mentee"}</span><small>{p.name}</small>
      </button>)}
      <button type="button" role="menuitem" className={styles.traineePickerHide} disabled={!show} onClick={() => {onShow(false); setOpen(false);}}>Hide mentee controls</button>
    </div> : null}
  </span>;
}

/** Draws the trainee's popup as their screen shows it: the radar quick menu, or the local aircraft menu. Nothing can be sent. */
export function traineeMenuRenderer(exercise: Exercise, airport: Airport) {
  const mode = trainingMode(exercise), none = () => {};
  return function TraineeMenuContent(a: Aircraft, state: TraineeView): ReactNode {
    return exercise.pausedByStaff ? null : mode !== "local" && airborne(a, airport)
    ? <RadarQuickPopup aircraft={vectorMenuAircraft(a, state.frequency, mode, a.frequency === state.frequency && !a.radar?.transferred)} exercise={exercise} frequency={state.frequency} heading={state.vectorHeading} target={state.vectorTarget} initialPicker={state.quickPicker} connected dispatch={none} onMessages={none} onAction={none} onSent={none}/>
    : <AircraftContextMenu exercise={exercise} aircraft={a} frequency={state.frequency} elapsed={exercise.elapsed} connected dispatch={none} onAction={none} onClose={none}/>;
  };
}

/** Around the radar while following: says why the map no longer moves, with the way out. */
export function TraineeFollowFrame({name, onStop}: {name?: string; onStop?: () => void}) {
  return <>
    <div className={styles.traineeFollowFrame} aria-hidden="true"/>
    <div className={styles.traineeFollowChip} role="status">
      <Crosshair aria-hidden="true" weight="bold"/><span>Following {name ? possessive(name) : "your mentee\u2019s"} view. Your zoom and pan are paused.</span>
      {onStop ? <button type="button" onClick={onStop}>Stop following</button> : null}
    </div>
  </>;
}

/** The trainee's open popup menu, a read-only copy beside their aircraft. */
export function TraineeMenu({state, name, aircraft, scope, project, menu}: {state: TraineeView; name?: string; aircraft: readonly Aircraft[]; scope: RefObject<HTMLDivElement | null>; project: (p: Point) => Point; menu: (aircraft: Aircraft, state: TraineeView) => ReactNode}) {
  const id = traineeMenuAircraft(state), target = id ? aircraft.find(a => a.id === id) : undefined;
  const content = target ? menu(target, state) : null;
  if (!target || !content) return null;
  // A new list or vector reopens the copy at the aircraft's current place.
  const key = `${target.id}:${state.quickPicker ?? "root"}:${state.vectorHeading ?? "click"}:${state.vectorTarget?.index ?? "free"}`;
  return <AircraftPopupAnchor key={key} scope={scope} point={project(target.position)} readOnly className={styles.traineeMenu}>
    <span className={styles.traineeMenuTag}>{name ? possessive(name) : "Mentee\u2019s"} menu · view only</span>
    {content}
  </AircraftPopupAnchor>;
}

/** The trainee's selection ring and drags, in the staff radar's own projection. */
export function TraineeScopeLayer({state, name, aircraft, airport, environment, project, scale, size}: {state: TraineeView; name?: string; aircraft: readonly Aircraft[]; airport: Airport; environment?: RadarEnvironment; project: (p: Point) => Point; scale: number; size: {width: number; height: number}}) {
  const focus = traineeFocus(state), focused = focus ? aircraft.find(a => a.id === focus) : undefined;
  const ring = focused ? project(focused.position) : null;
  const dragged = state.vectorDraft ? aircraft.find(a => a.id === state.vectorDraft!.aircraftId) : undefined;
  const preview = dragged && state.vectorDraft && outsideVectorCircle(dragged.position, state.vectorDraft.point, scale) ? vectorPreview(dragged, state.vectorDraft.point, airport, environment, scale) : null;
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
    {dragged && state.vectorDraft && from ? <VectorPreviewBox className={styles.traineeVectorBox} label={`${who}'s vector details`} point={to ?? project(state.vectorDraft.point)} size={size}>
      <VectorDetails initial={state.vectorDraft.initial} callsign={dragged.callsign} vector={preview} airport={airport} aircraftId={dragged.id}/>
    </VectorPreviewBox> : null}
    {ring && focused ? <span className={styles.traineeRing} role="img" aria-label={`${who} has ${focused.callsign} selected`} style={{left: ring.x, top: ring.y}}><span>{who}</span></span> : null}
  </>;
}

/** The trainee's open message list, read-only, for the staff radar's bottom-right corner. */
export function TraineeMessages({name, state, exercise}: {name?: string; state: TraineeView | null; exercise: Exercise}) {
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
