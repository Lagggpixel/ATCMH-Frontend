"use client";
import {useState} from "react";
import {Pause} from "@phosphor-icons/react/dist/csr/Pause";
import {Play} from "@phosphor-icons/react/dist/csr/Play";
import type {Action, Exercise} from "./model";
import styles from "./Simulator.module.css";

const REWIND_LABELS: Record<number, string> = {30: "30 seconds", 60: "1 minute", 120: "2 minutes", 300: "5 minutes"};
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export default function PauseControls({exercise, owner, dispatch}: {exercise: Exercise; owner: boolean; dispatch: (action: Action) => void}) {
  const [visibility, setVisibility] = useState<"hidden" | "visible">(exercise.pauseVisibility ?? "visible");
  return <div className={styles.pauseControls}>
    <button data-simulator-tour="play-pause" className={styles.playButton} disabled={!owner} onClick={() => dispatch(exercise.running ? {kind: "pause", visibility} : {kind: "play"})}>
      {exercise.running ? <Pause weight="fill"/> : <Play weight="fill"/>}{exercise.running ? "Pause" : "Play"}
    </button>
    <label>When paused<select aria-label="Mentee view when paused" disabled={!owner} value={exercise.pausedByStaff ? exercise.pauseVisibility ?? "hidden" : visibility} onChange={event => {
      const value = event.target.value as "hidden" | "visible"; setVisibility(value);
      if (exercise.pausedByStaff) dispatch({kind: "pause", visibility: value});
    }}><option value="visible">Show mentee view</option><option value="hidden">Hide mentee view</option></select></label>
    <label>Speed<select aria-label="Simulation speed" disabled={!owner} value={exercise.timeScale ?? 1} onChange={event => dispatch({kind: "time-scale", scale: Number(event.target.value) as 1 | 2 | 4})}>
      <option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
    </select></label>
    <label title="Go back in the recording and pause, so you can brief and replay the moment">Rewind<select aria-label="Rewind the session" disabled={!owner || exercise.elapsed < 1} value="" onChange={event => {
      const seconds = Number(event.target.value);
      if (seconds && window.confirm(`Rewind ${REWIND_LABELS[seconds]}? Traffic and the radio log go back to that moment and the session pauses.`)) dispatch({kind: "rewind", seconds});
    }}><option value="">Choose…</option>{Object.entries(REWIND_LABELS).map(([seconds, label]) => <option key={seconds} value={seconds} disabled={exercise.elapsed < Number(seconds)}>{label}</option>)}</select></label>
    {exercise.rewind ? <span role="status">Rewound from {clock(exercise.rewind.from)} to {clock(exercise.rewind.to)}</span> : null}
  </div>;
}
