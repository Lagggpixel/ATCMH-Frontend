"use client";
import {useEffect, useRef} from "react";
import type {Point} from "./model";
import {CONFLICT_LABELS, type ConflictKind} from "./training-conflicts";
import styles from "./Simulator.module.css";
export interface ScopeContext {point: Point; screen: Point; aircraftId?: string; originIcao?: string}
export default function MentorContextMenu({target, callsign, enabled, local, onConflict, onSpawn, onSpawnAirport, onDelete, onClose}: {
  target: ScopeContext; callsign?: string; enabled: boolean; local?: boolean; onConflict: (kind: ConflictKind) => void;
  onSpawn: () => void; onSpawnAirport: (icao: string) => void; onDelete: () => void; onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {menu.current?.querySelector("button")?.focus(); const outside = (event: PointerEvent) => {if (event.target instanceof Node && !menu.current?.contains(event.target)) onClose();}; window.addEventListener("pointerdown", outside); return () => window.removeEventListener("pointerdown", outside);}, [onClose]);
  return <div ref={menu} className={styles.mentorContext} role="menu" aria-label="Mentor scope actions" style={{left: Math.max(8, Math.min(window.innerWidth - 248, target.screen.x)), top: Math.max(8, Math.min(window.innerHeight - 230, target.screen.y))}} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
    if (["Escape", "Tab"].includes(event.key)) onClose();
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {event.preventDefault(); const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]; const i = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(i + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();}
  }}>
    <strong>{callsign ?? "Scope"}</strong>{target.aircraftId ? <>
      {local ? (Object.keys(CONFLICT_LABELS) as ConflictKind[]).map(kind => <button key={kind} role="menuitem" disabled={!enabled || !callsign} onClick={() => onConflict(kind)}>{kind === "cancel-takeoff" ? "Cancel takeoff" : CONFLICT_LABELS[kind]}</button>) : null}
      <button role="menuitem" disabled={!enabled || !callsign} onClick={onDelete}>Delete</button>
    </> : <><button role="menuitem" disabled={!enabled} onClick={onSpawn}>Spawn aircraft</button>{target.originIcao ? <button role="menuitem" disabled={!enabled} onClick={() => onSpawnAirport(target.originIcao!)}>Spawn aircraft at {target.originIcao}</button> : null}</>}
  </div>;
}
