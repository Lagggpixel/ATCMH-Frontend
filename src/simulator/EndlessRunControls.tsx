
"use client";

import {useEffect, useId, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {endlessRequest} from "./endless/client";
import type {SessionSummary} from "./sessions";
import styles from "./EndlessRun.module.css";

type Incident = NonNullable<NonNullable<SessionSummary["endless"]>["incident"]>;
const penalty: Record<Incident["kind"], string> = {separation: "Loss of separation · −10 points", runway: "Runway conflict · −15 points",
  collision: "Collision · score capped at 49", terrain: "Terrain impact · score capped at 49"};
const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map(part => String(part).padStart(2, "0")).join(":");
};

/** The Endless run bar: traffic state, run time, Stop traffic and End run, plus the draining banner and incident pop-up. */
export default function EndlessRunControls({session, csrf, home, connected, elapsed}: {session: SessionSummary; csrf: string; home: string; connected: boolean; elapsed: number}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [pending, setPending] = useState<"drain" | "end">();
  const [error, setError] = useState("");
  const [endError, setEndError] = useState("");
  const [toast, setToast] = useState<Incident>();
  const seen = useRef<number | undefined>(undefined);
  const run = session.endless;
  const hasRun = !!run;
  const {ordinal = -1, at, kind, label} = run?.incident ?? {};
  useEffect(() => {
    if (!hasRun) return;
    // The first summary after joining only records the latest incident; only new ones are announced.
    if (seen.current === undefined) {seen.current = ordinal; return;}
    if (ordinal <= seen.current || at === undefined || kind === undefined || label === undefined) return;
    seen.current = ordinal;
    setToast({ordinal, at, kind, label});
  }, [hasRun, ordinal, at, kind, label]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  if (!run) return null;
  const active = Math.max(0, run.released - run.completed - (run.unresolved ?? 0));
  const handled = run.draining && active === 0;
  const send = async (action: "drain" | "end") => {
    setError(""); setEndError(""); setPending(action);
    try {
      const result = await endlessRequest(csrf, {id: session.id, action});
      if (action === "end") {
        if (!result.replayId) throw new Error("The replay could not be opened. Try again.");
        dialog.current?.close();
        router.replace(`${home}/replays/${result.replayId}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Try again.";
      if (action === "end") setEndError(message);
      else setError(message);
    } finally {setPending(undefined);}
  };
  const askEnd = () => {setEndError(""); dialog.current?.showModal();};
  return <>
    <span className={styles.status} data-stopped={run.draining || undefined} role="status">{run.draining ? "Traffic stopped" : "Traffic on"}</span>
    <span className={styles.time}><small>Time</small>{clock(elapsed)}</span>
    <span className={styles.divider} aria-hidden="true"/>
    {!run.draining ? <button className={styles.action} type="button" disabled={!connected || !!pending} onClick={() => void send("drain")}>Stop traffic</button> : null}
    <button className={styles.action} type="button" aria-haspopup="dialog" data-ready={handled || undefined} disabled={!connected || !!pending} onClick={askEnd}>End run</button>
    {error ? <span className={styles.error} role="alert">{error}</span> : null}
    {run.draining ? <div className={styles.banner} role="status">
      <span>{handled ? "All traffic handled. Your run is ready to score." : `No new aircraft will appear. Finish the ${active === 1 ? "aircraft" : `${active} aircraft`} still with you, or end the run now.`}</span>
      {handled ? <button type="button" disabled={!connected || !!pending} onClick={askEnd}>See my score</button> : null}
    </div> : null}
    {toast ? <div className={styles.toast} role="alert">
      <strong>{penalty[toast.kind]}</strong>
      <span>{toast.label}</span>
      <button type="button" aria-label="Dismiss" onClick={() => setToast(undefined)}>×</button>
    </div> : null}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={title} onCancel={event => {if (pending) event.preventDefault();}}>
      <h2 id={title}>End this run?</h2>
      <p>{active ? `${active === 1 ? "1 aircraft is" : `${active} aircraft are`} still with you. They count as unfinished, which lowers the completion part of your score. ` : ""}Sweatbox saves a replay and opens your results.</p>
      {endError ? <p role="alert">{endError}</p> : null}
      <div>
        <button type="button" autoFocus disabled={!!pending} onClick={() => dialog.current?.close()}>Keep practising</button>
        <button type="button" disabled={!!pending} onClick={() => void send("end")}>{pending === "end" ? "Saving…" : "End and see results"}</button>
      </div>
    </dialog>
  </>;
}
