"use client";
import {useId, useState} from "react";
import type {Aircraft} from "./model";
import styles from "./LandingOutcomeControl.module.css";

export type LandingChange = (value: Aircraft["landing"]) => void | boolean | Promise<void | boolean>;

export default function LandingOutcomeControl({value, onChange, compact = false}: {value: Aircraft["landing"]; onChange: LandingChange; compact?: boolean}) {
  const name = useId();
  const [request, setRequest] = useState<{value: Aircraft["landing"]; waiting: boolean} | null>(null);
  const [error, setError] = useState("");
  // An HTTP acknowledgement alone does not confirm the shared session state.
  if (request && !request.waiting && request.value === value) setRequest(null);
  const pending = !!request && (request.waiting || request.value !== value);
  const change = async (next: Aircraft["landing"]) => {
    if (pending || next === value) return;
    setError(""); setRequest({value: next, waiting: true});
    try {
      if (await onChange(next) === false) throw new Error("Landing intention was not saved. Try again.");
      setRequest({value: next, waiting: false});
    } catch (reason) {
      setRequest(null); setError(reason instanceof Error ? reason.message : "Landing intention was not saved. Try again.");
    }
  };
  if (compact) return <label>Next landing<select aria-label="Landing intention" disabled={pending} aria-busy={pending} value={pending ? request!.value : value} onChange={event => void change(event.target.value as Aircraft["landing"])}><option value="full-stop">Full stop</option><option value="touch-and-go">Touch and go</option></select>{error || pending ? <small role={error ? "alert" : "status"}>{error || "Saving landing intention…"}</small> : null}</label>;
  return <fieldset className={styles.control} disabled={pending} aria-busy={pending}>
    <legend>Landing intention</legend>
    <div className={styles.choices}>
      {([['full-stop', 'Full stop'], ['touch-and-go', 'Touch and go']] as const).map(([outcome, label]) => <label key={outcome} className={styles.choice}>
        <input type="radio" name={name} value={outcome} checked={(pending ? request!.value : value) === outcome} onChange={() => void change(outcome)}/>
        <span><span className={styles.check} aria-hidden="true">✓</span>{label}</span>
      </label>)}
    </div>
    <small className={styles.status} role={error ? "alert" : "status"}>{error || (pending ? "Saving landing intention…" : `Next landing: ${value === "full-stop" ? "Full stop" : "Touch and go"}`)}</small>
  </fieldset>;
}
