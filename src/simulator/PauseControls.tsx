"use client";
import {useState} from "react";
import {Pause} from "@phosphor-icons/react/dist/csr/Pause";
import {Play} from "@phosphor-icons/react/dist/csr/Play";
import type {Action, Exercise} from "./model";
import styles from "./Simulator.module.css";

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
  </div>;
}
