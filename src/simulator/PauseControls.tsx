"use client";
import {useEffect, useRef, useState} from "react";
import {ArrowCounterClockwise} from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import {Pause} from "@phosphor-icons/react/dist/csr/Pause";
import {Play} from "@phosphor-icons/react/dist/csr/Play";
import type {Action, Exercise} from "./model";
import {clock, rewindLength} from "./RadarNotices";
import styles from "./Simulator.module.css";

export type PauseVisibility = "hidden" | "visible";
export const REWIND_CHOICES = [30, 60, 120, 300] as const;

/** Play/pause, speed and rewind: the controls a trainer reaches for during a session. */
export default function PauseControls({exercise, owner, dispatch, visibility}: {exercise: Exercise; owner: boolean; dispatch: (action: Action) => void; visibility?: PauseVisibility}) {
  const pauseAs = visibility ?? exercise.pauseVisibility ?? "visible";
  return <div className={styles.pauseControls}>
    <button data-simulator-tour="play-pause" className={styles.playButton} disabled={!owner} aria-label={exercise.running ? "Pause" : "Play"} onClick={() => dispatch(exercise.running ? {kind: "pause", visibility: pauseAs} : {kind: "play"})}>
      {exercise.running ? <Pause weight="fill" aria-hidden="true"/> : <Play weight="fill" aria-hidden="true"/>}<span className={styles.toolbarText}>{exercise.running ? "Pause" : "Play"}</span>
    </button>
    <select className={styles.speedSelect} aria-label="Simulation speed" title="Simulation speed" disabled={!owner} value={exercise.timeScale ?? 1} onChange={event => dispatch({kind: "time-scale", scale: Number(event.target.value) as 1 | 2 | 4})}>
      <option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
    </select>
    <RewindButton exercise={exercise} owner={owner} dispatch={dispatch}/>
  </div>;
}

/** What the trainee sees while the trainer has paused: kept with the other session settings. */
export function PauseVisibilitySelect({exercise, owner, dispatch, visibility, onVisibility}: {exercise: Exercise; owner: boolean; dispatch: (action: Action) => void; visibility: PauseVisibility; onVisibility: (value: PauseVisibility) => void}) {
  return <label className={styles.pauseVisibility}>When paused<select aria-label="Mentee view when paused" disabled={!owner} value={exercise.pausedByStaff ? exercise.pauseVisibility ?? "hidden" : visibility} onChange={event => {
    const value = event.target.value as PauseVisibility; onVisibility(value);
    if (exercise.pausedByStaff) dispatch({kind: "pause", visibility: value});
  }}><option value="visible">Show mentee view</option><option value="hidden">Hide mentee view</option></select></label>;
}

/** Rewind opens a small panel: pick how far back, see where that lands, then confirm. */
export function RewindButton({exercise, owner, dispatch}: {exercise: Exercise; owner: boolean; dispatch: (action: Action) => void}) {
  const [open, setOpen] = useState(false);
  const [seconds, setSeconds] = useState<number>(120);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {if (!(event.target instanceof Node) || !root.current?.contains(event.target)) setOpen(false);};
    const escape = (event: KeyboardEvent) => {if (event.key === "Escape") setOpen(false);};
    document.addEventListener("pointerdown", close, true); document.addEventListener("keydown", escape);
    return () => {document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", escape);};
  }, [open]);
  const available = REWIND_CHOICES.filter(choice => exercise.elapsed >= choice);
  const chosen = available.includes(seconds as never) ? seconds : available.at(-1) ?? REWIND_CHOICES[0];
  const disabled = !owner || exercise.elapsed < 1;
  return <div className={styles.rewindControl} ref={root}>
    <button type="button" aria-haspopup="dialog" aria-expanded={open} disabled={disabled} title="Go back in the recording and pause, so you can brief and replay the moment" onClick={() => setOpen(!open)}>
      <ArrowCounterClockwise aria-hidden="true" weight="bold"/><span className={styles.toolbarText}>Rewind</span>
    </button>
    {open ? <section className={styles.rewindPanel} role="dialog" aria-label="Rewind">
      <h2>Rewind</h2>
      <p id="rewind-how-far">How far back</p>
      <div className={styles.rewindChoices} role="radiogroup" aria-labelledby="rewind-how-far">
        {REWIND_CHOICES.map(choice => <button key={choice} type="button" role="radio" aria-checked={chosen === choice} disabled={exercise.elapsed < choice} onClick={() => setSeconds(choice)}>{rewindLength(choice)}</button>)}
      </div>
      <p className={styles.rewindLanding}>Back to <strong>{clock(Math.max(0, exercise.elapsed - chosen))}</strong> paused</p>
      <div className={styles.rewindActions}>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className={styles.rewindConfirm} disabled={disabled || exercise.elapsed < chosen} onClick={() => {dispatch({kind: "rewind", seconds: chosen}); setOpen(false);}}>Rewind {rewindLength(chosen)}</button>
      </div>
    </section> : null}
  </div>;
}
