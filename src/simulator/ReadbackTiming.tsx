"use client";
import {useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent} from "react";
import {DEFAULT_READBACK_DELAY, type Action, type ReadbackDelay} from "./model";
import styles from "./ReadbackTiming.module.css";

interface Props {delay: ReadbackDelay; enabled: boolean; dispatch: (action: Action) => void | boolean | Promise<boolean>}
type Limit = "min" | "max";
const seconds = (value: number) => `${value.toFixed(1)} s`;

/** Two keyboard-accessible handles share one track. Pointer input always selects the nearest handle. */
export default function ReadbackTiming({delay, enabled, dispatch}: Props) {
  const [draft, setDraft] = useState(delay), [error, setError] = useState("");
  const current = useRef(draft), saving = useRef(0), saveVersion = useRef(0);
  const track = useRef<HTMLDivElement>(null), handles = useRef<Partial<Record<Limit, HTMLDivElement | null>>>({});
  const dragging = useRef<Limit | null>(null), lastHandle = useRef<Limit>("min");
  const id = useId(), disabled = !enabled;
  const {min, max} = delay;
  useEffect(() => {
    if (!dragging.current && !saving.current) {current.current = {min, max}; setDraft({min, max});}
  }, [min, max]);
  async function persist(value: ReadbackDelay) {
    // The transport already orders actions. Enqueue each change immediately so a command
    // sent next cannot overtake a newer timing change waiting in a component-local queue.
    const version = ++saveVersion.current;
    saving.current++; setError("");
    try {
      if (await dispatch({kind: "readback-delay", delay: value}) === false) throw new Error("Save failed");
    } catch {if (version === saveVersion.current) setError("Timing wasn’t saved.");}
    finally {saving.current--;}
  }
  function change(limit: Limit, value: number) {
    setError("");
    const previous = current.current;
    const next = {...previous, [limit]: Math.max(limit === "min" ? 0 : previous.min, Math.min(limit === "max" ? 10 : previous.max, Math.round(value * 10) / 10))};
    if (next[limit] === previous[limit]) return;
    current.current = next; setDraft(next);
    if (!dragging.current) void persist(next);
  }
  function position(event: PointerEvent<HTMLDivElement>) {
    const box = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(10, (event.clientX - box.left) / box.width * 10));
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const value = position(event), nearest = Math.abs(value - draft.min) - Math.abs(value - draft.max);
    const limit = nearest === 0 ? lastHandle.current === "min" ? "max" : "min" : nearest < 0 ? "min" : "max";
    dragging.current = lastHandle.current = limit;
    handles.current[limit]?.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    change(limit, value);
  }
  function key(event: KeyboardEvent<HTMLDivElement>, limit: Limit) {
    const step = event.key === "ArrowRight" || event.key === "ArrowUp" ? .1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -.1 : event.key === "PageUp" ? 1 : event.key === "PageDown" ? -1 : 0;
    if (!step && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (!disabled) change(limit, event.key === "Home" ? 0 : event.key === "End" ? 10 : current.current[limit] + step);
  }
  function finish() {
    if (!dragging.current) return;
    dragging.current = null;
    void persist(current.current);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const value = position(event);
    if (current.current.min === current.current.max && value !== current.current.min) {
      dragging.current = lastHandle.current = value < current.current.min ? "min" : "max";
      handles.current[dragging.current]?.focus();
    }
    change(dragging.current, value);
  }
  return <section className={styles.timing} aria-labelledby={`${id}-title`}>
    <div className={styles.heading}><h3 id={`${id}-title`}>Readback delay</h3><button type="button" disabled={disabled || !error && draft.min === DEFAULT_READBACK_DELAY.min && draft.max === DEFAULT_READBACK_DELAY.max} onClick={() => {const next = {...DEFAULT_READBACK_DELAY}; current.current = next; setDraft(next); void persist(next);}}>Reset</button></div>
    <div className={styles.values}><span>Minimum <strong>{seconds(draft.min)}</strong></span><span>Maximum <strong>{seconds(draft.max)}</strong></span></div>
    <div className={styles.track} ref={track} data-disabled={disabled || undefined} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      <span className={styles.rail} aria-hidden="true"/><span className={styles.selection} style={{left: `${draft.min * 10}%`, width: `${(draft.max - draft.min) * 10}%`}} aria-hidden="true"/>
      {(["min", "max"] as const).map(limit => <div key={limit} ref={element => {handles.current[limit] = element;}} className={styles.handle} style={{left: `${draft[limit] * 10}%`}} role="slider" tabIndex={disabled ? -1 : 0} aria-label={`${limit === "min" ? "Minimum" : "Maximum"} readback delay`} aria-valuemin={limit === "min" ? 0 : draft.min} aria-valuemax={limit === "max" ? 10 : draft.max} aria-valuenow={draft[limit]} aria-valuetext={`${draft[limit].toFixed(1)} seconds`} aria-disabled={disabled} onFocus={() => {lastHandle.current = limit;}} onKeyDown={event => key(event, limit)}/>)}
    </div>
    <div className={styles.ticks} aria-hidden="true">{[0, 2, 4, 6, 8, 10].map(value => <span key={value}>{value}s</span>)}</div>
    {error ? <p className={styles.status} role="alert">{error} <button type="button" disabled={disabled} onClick={() => void persist(current.current)}>Retry</button></p> : null}
  </section>;
}
