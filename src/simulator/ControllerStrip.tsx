"use client";
import {useRef, useState} from "react";
import type {Aircraft} from "./model";
import styles from "./Simulator.module.css";

/** Dismissing a strip only changes this controller's list, never the exercise aircraft. */
export default function ControllerStrip({aircraft: a, runway, selected, pending, reminder, connected, onSelect, onFocus, onMessages, onDismiss}: {
  aircraft: Aircraft; runway: string; selected: boolean; pending: boolean; reminder: boolean; connected: boolean;
  onSelect: () => void; onFocus: () => void; onMessages: () => void; onDismiss: () => void;
}) {
  const drag = useRef<{x: number; y: number; pointer: number} | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  return <div className={`${styles.strip} ${selected ? styles.selectedStrip : ""} ${reminder ? styles.reminder : ""}`} style={{transform: `translateX(${offset}px)`}}
    onPointerDown={event => {if (!event.isPrimary || event.button !== 0) return; drag.current = {x: event.clientX, y: event.clientY, pointer: event.pointerId}; suppressClick.current = false;}}
    onPointerMove={event => {const start = drag.current; if (!start || start.pointer !== event.pointerId) return; const x = event.clientX - start.x, y = event.clientY - start.y;
      if (Math.abs(y) > 15 && !suppressClick.current) {drag.current = null; return;}
      if (Math.abs(x) > 15) {suppressClick.current = true; event.currentTarget.setPointerCapture(event.pointerId); setOffset(x);}
    }}
    onPointerUp={event => {const start = drag.current; drag.current = null; setOffset(0); if (start && suppressClick.current && Math.abs(event.clientX - start.x) > event.currentTarget.getBoundingClientRect().width / 2) onDismiss();}}
    onPointerCancel={() => {drag.current = null; setOffset(0);}}
    onClickCapture={event => {if (suppressClick.current) {event.stopPropagation(); event.preventDefault(); suppressClick.current = false;}}}>
    <button className={styles.stripBody} onClick={onSelect} onDoubleClick={onFocus} aria-label={`Select strip ${a.callsign}`} title="Double-click to center the view; swipe sideways to dismiss this strip"><span>{a.callsign}</span><span style={{color: a.clearedToLand ? "#4bae4f" : undefined}}>{runway}</span><span>{a.type}</span></button>
    <button className={`${styles.atcButton} ${pending ? styles.pendingRequest : ""}`} disabled={!connected} onClick={onMessages}>ATC{pending ? " (1)" : ""}<i className={a.active ? styles.activePilot : styles.inactivePilot}/></button>
  </div>;
}
