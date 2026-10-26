"use client";
import {useEffect, useRef, useState} from "react";
import {ListBullets} from "@phosphor-icons/react/dist/csr/ListBullets";
import {Warning} from "@phosphor-icons/react/dist/csr/Warning";
import {X} from "@phosphor-icons/react/dist/csr/X";
import {trainingRequest} from "./TrainingLibrary";
import {timeLabel, type ScenarioEvent, type ScenarioStaffView} from "./scenarios";
import styles from "./Training.module.css";

type LiveEvent = ScenarioStaffView["events"][number];
const closed = (e: LiveEvent) => e.status === "completed" || e.status === "skipped";
const needsTrainer = (e: LiveEvent) => e.status === "blocked" || e.trigger.type === "manual" && e.status === "waiting";
const triggerLabel = (e: ScenarioEvent) => e.trigger.type === "time" ? timeLabel(e.trigger.at) : e.trigger.type === "manual" ? "Manual" : "When";

export function conditionLabel(event: ScenarioEvent, events: ScenarioEvent[]) {
  if (event.trigger.type !== "condition") return "";
  const c = event.trigger.condition;
  const text = c.type === "controller-position" ? `an aircraft checks in with ${c.positionId}` : c.type === "hold" ? "an aircraft reaches a hold point" : c.type === "frequency" ? `an aircraft tunes to ${c.frequency}` : c.type === "leg" ? `an aircraft enters ${c.leg}` : c.type === "overhead" ? "an aircraft is overhead" : c.type === "position" ? "an aircraft reaches a location" : c.type === "altitude" ? `an aircraft reaches ${c.altitude.toLocaleString()} ft` : c.type === "radar" ? `radar state is ${c.state}` : `“${events.find(e => e.id === c.eventId)?.title ?? "another event"}” completes`;
  return `When ${text}${event.trigger.delay ? `, then ${event.trigger.delay} s` : ""}`;
}

export default function LiveScenarioPanel({scenario, elapsed, running, connected, onEvent, canControl = connected}: {canControl?: boolean; scenario: ScenarioStaffView; elapsed: number; running: boolean; connected: boolean; onEvent: (id: string, decision: "run" | "retry" | "skip") => void}) {
  const [open, setOpen] = useState(false);
  const events = scenario.events, done = events.filter(closed), active = scenario.finished ? [] : events.filter(e => !closed(e));
  const attention = active.filter(needsTrainer);
  const next = active.filter(e => e.trigger.type === "time" && e.status === "scheduled").sort((a, b) => (a.trigger.type === "time" ? a.trigger.at : 0) - (b.trigger.type === "time" ? b.trigger.at : 0))[0];
  const nextAt = next?.trigger.type === "time" ? next.trigger.at : undefined;
  const later = active.filter(e => e !== next && !needsTrainer(e));
  const disabled = !connected || !canControl;
  return <div className={styles.liveAnchor}>
    <button data-simulator-tour="timeline" className={styles.liveToggle} disabled={!connected} aria-expanded={open} onClick={() => setOpen(!open)}><ListBullets aria-hidden="true"/>Scenario{scenario.finished ? <span className={styles.liveMuted}>· finished</span> : nextAt !== undefined ? <span className={styles.liveMuted}>· next <time>{timeLabel(Math.max(0, nextAt - elapsed))}</time></span> : !active.length ? <span className={styles.liveMuted}>· all events done</span> : null}{attention.length ? <span className={styles.liveBadge} aria-label={`${attention.length} need you`}>{attention.length}</span> : null}</button>
    {open ? <section className={styles.livePanel} aria-label="Scenario">
      <header><div><h2>{scenario.title}</h2><p>{done.length} of {events.length} events done{scenario.finished ? " · Attempt finished" : ""}</p></div><button className={styles.liveIcon} onClick={() => setOpen(false)} aria-label="Close scenario"><X aria-hidden="true"/></button></header>
      <div className={styles.liveProgress} aria-hidden="true"><span style={{width: `${events.length ? done.length / events.length * 100 : 0}%`}}/></div>
      <div className={styles.liveBody}>
        {scenario.instructorNotes ? <details className={styles.liveNotes}><summary>Mentor notes</summary><p>{scenario.instructorNotes}</p></details> : null}
        {attention.length ? <section className={styles.liveSection}><h3>Needs you · {attention.length}</h3>{attention.map(e => <article key={e.id} className={`${styles.liveCard} ${e.status === "blocked" ? styles.liveBlocked : ""}`}>
          <div>{e.status === "blocked" ? <Warning weight="fill" aria-hidden="true"/> : null}<span><strong>{e.title}</strong><small>{e.status === "blocked" ? e.error ?? "Blocked" : "Mentor release · run it when you are ready"}</small></span></div>
          <div className={styles.liveActions}><button disabled={disabled} onClick={() => onEvent(e.id, "skip")}>Skip</button><button className={styles.livePrimary} disabled={disabled || !running} title={running ? undefined : "Start the session first"} onClick={() => onEvent(e.id, e.status === "blocked" ? "retry" : "run")}>{e.status === "blocked" ? "Retry" : "Run"}</button></div>
        </article>)}</section> : null}
        {next && nextAt !== undefined ? <section className={styles.liveSection}><h3>Up next</h3><article className={styles.liveNext}>
          <span className={styles.liveCountdown}><time>{timeLabel(Math.max(0, nextAt - elapsed))}</time><small>at {timeLabel(nextAt)}</small></span>
          <span><strong>{next.title}</strong><small>{next.actions.length} action{next.actions.length === 1 ? "" : "s"}{running ? "" : " · paused"}</small></span>
          <button disabled={disabled} onClick={() => onEvent(next.id, "skip")}>Skip</button>
        </article></section> : null}
        {later.length ? <section className={styles.liveSection}><h3>Later</h3>{later.map(e => <div key={e.id} className={styles.liveRow}>
          <time>{triggerLabel(e)}</time>
          <span><strong>{e.title}</strong>{e.trigger.type === "condition" ? <small>{conditionLabel(e, events)}</small> : null}</span>
          {e.status === "waiting" ? <span className={styles.liveTag}>waiting</span> : <button disabled={disabled} onClick={() => onEvent(e.id, "skip")} aria-label={`Skip ${e.title}`}>Skip</button>}
        </div>)}</section> : null}
        {!active.length && !scenario.finished ? <p className={styles.liveMuted}>Every event has run. Finish the attempt from the Session menu.</p> : null}
        {done.length ? <details className={styles.liveDone}><summary>Done · {done.length}</summary>{done.map(e => <div key={e.id} className={styles.liveRow}>
          <time>{triggerLabel(e)}</time><span><strong>{e.title}</strong></span><span className={styles.liveTag}>{e.status === "skipped" ? "skipped" : "done"}</span>
        </div>)}</details> : null}
      </div>
    </section> : null}
  </div>;
}

export function FinishAttemptDialog({sessionId, csrf, scenario, elapsed, canControl, onClose}: {sessionId: string; csrf: string; scenario: ScenarioStaffView; elapsed: number; canControl: boolean; onClose: () => void}) {
  const [feedback, setFeedback] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {form.current?.querySelector("textarea")?.focus();}, []);
  const completed = scenario.events.filter(e => e.status === "completed").length, skipped = scenario.events.filter(e => e.status === "skipped").length;
  return <div className={styles.finishBackdrop} onKeyDown={e => {if (e.key === "Escape" && !busy) onClose();}}>
    <form ref={form} role="dialog" aria-modal="true" aria-labelledby="finish-attempt-title" className={styles.finishDialog} onSubmit={async e => {
      e.preventDefault(); if (!canControl) return; setBusy(true); setError("");
      try {await trainingRequest(csrf, `attempts/${sessionId}`, {action: "finish", feedback, attemptId: scenario.attemptId}); onClose();}
      catch (reason) {setError((reason as Error).message); setBusy(false);}
    }}>
      <header><h2 id="finish-attempt-title">Finish attempt</h2><button type="button" className={styles.liveIcon} onClick={onClose} aria-label="Close"><X aria-hidden="true"/></button></header>
      <div className={styles.finishStats}><span><strong>{completed}</strong>done</span><span><strong>{skipped}</strong>skipped</span><span><strong>{timeLabel(elapsed)}</strong>run time</span></div>
      <label>Feedback for mentee<textarea rows={7} maxLength={6000} value={feedback} onChange={e => setFeedback(e.target.value)}/></label>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <footer><button type="button" onClick={onClose}>Cancel</button><button className={styles.livePrimary} disabled={busy || !canControl}>Finish and save</button></footer>
    </form>
  </div>;
}
