"use client";
import {useRef} from "react";
import styles from "./Simulator.module.css";

export default function AutomaticHelp() {
  const dialog = useRef<HTMLDialogElement>(null);
  return <><button className={styles.automaticHelpButton} aria-label="About Automatic mode" onClick={() => dialog.current?.showModal()}>?</button>
    <dialog ref={dialog} className={styles.automaticHelp} aria-labelledby="automatic-help-title" onKeyDown={e => {if (e.key === "Escape") e.stopPropagation();}}><h2 id="automatic-help-title">Automatic</h2>
      <p>On by default for new sessions. Pausing freezes automatic actions.</p>
      <ul><li>Reads back and follows valid instructions after 1.5 exercise seconds.</li>
        <li>Requests taxi after pushback and departure at the holding point.</li>
        <li>Handles frequency changes and parking requests after runway exit.</li>
        <li>Goes around without landing or option clearance. Each circuit needs clearance.</li>
        <li>Requests overhead touch and go when configured in Intentions.</li></ul>
      <p>Requests never grant clearance. Turning Automatic off leaves movement active.</p>
      <button autoFocus onClick={() => dialog.current?.close()}>Close</button>
    </dialog></>;
}
