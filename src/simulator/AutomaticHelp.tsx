"use client";
import {useRef} from "react";
import styles from "./Simulator.module.css";

export default function AutomaticHelp() {
  const dialog = useRef<HTMLDialogElement>(null);
  return <><button className={styles.automaticHelpButton} aria-label="About Automatic mode" onClick={() => dialog.current?.showModal()}>?</button>
    <dialog ref={dialog} className={styles.automaticHelp} aria-labelledby="automatic-help-title" onKeyDown={e => {if (e.key === "Escape") e.stopPropagation();}}><h2 id="automatic-help-title">Automatic</h2>
      <p>Applies to all aircraft. Every new session starts with Automatic on. Staff can turn it off for that session; reconnecting preserves that choice.</p>
      <ul><li>Reads back and follows valid controller instructions after 1.5 exercise seconds. Invalid assignments receive an Unable response.</li>
        <li>Requests taxi after pushback, using the aircraft’s taxi intention and latest published ATIS.</li>
        <li>After Contact Tower when ready, changes to Tower at the departure holding point and requests departure from the assigned taxi runway. Pattern work adds “remaining in the pattern”.</li>
        <li>After a full-stop runway exit, requests frequency change, then taxi to parking after Contact Ground. An assigned exit-runway command changes to Ground once clear and requests parking directly.</li>
        <li>Goes around and announces it when landing or option clearance is missing. Each circuit needs a new clearance; a landing-only clearance requires a full stop.</li>
        <li>When configured in Intentions or scenario setup, requests inbound touch and go overhead after transition approval.</li></ul>
      <p>Requests never grant clearance. Pausing freezes automatic actions. Turning Automatic off leaves staff in control of requests and readbacks while assigned movement continues.</p>
      <button autoFocus onClick={() => dialog.current?.close()}>Close</button>
    </dialog></>;
}
