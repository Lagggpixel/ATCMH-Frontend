"use client";
import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import type {Exercise} from "./model";
import type {SessionSummary} from "./sessions";
import {sessionPath} from "./sessions";
import {aircraftPosition, type ControllerPosition} from "./positions";
import PositionSetup from "./PositionSetup";
import {PositionBar, positionState, positionSwatch} from "./PositionSummary";
import MenteePicker, {type Mentee} from "./MenteePicker";
import {sessionJson} from "./shared-transport";
import styles from "./Positions.module.css";

export default function PositionControls({exercise, session, csrf, enabled, onDemonstrate, monitor, onMonitor}: {
  exercise: Exercise; session: SessionSummary; csrf: string; enabled: boolean; onDemonstrate: (positionId: string) => void;
  /** The position whose radio is being monitored, or "" for all. */
  monitor?: string; onMonitor?: (positionId: string) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) menu.current.open = false;};
    document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close);
  }, []);
  const [draft, setDraft] = useState<ControllerPosition[] | null>(null), [editing, setEditing] = useState(false);
  const [drawer, setDrawer] = useState<{id: string; kind: "trainee" | "feedback"} | null>(null);
  const [chosen, setChosen] = useState<Record<string, Mentee | null>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const post = async (operation: string, body: object) => {
    setBusy(true); setError("");
    try {await fetch(`/api/simulator/sessions/${session.id}/${operation}`, {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrf}, body: JSON.stringify(body)}).then(sessionJson); setDraft(null); setEditing(false); setDrawer(null); return true;}
    catch (reason) {setError((reason as Error).message); return false;} finally {setBusy(false);}
  };
  if (!exercise.trainingStation?.endsWith(":approach")) return null;
  const positions = session.positions ?? [], connected = positions.filter(p => p.occupied).length;
  const toggle = (id: string, kind: "trainee" | "feedback") => setDrawer(current => current?.id === id && current.kind === kind ? null : {id, kind});
  return <details ref={menu} className={styles.controls} onKeyDown={event => {if (event.key === "Escape" && menu.current) {event.stopPropagation(); menu.current.open = false; menu.current.querySelector("summary")?.focus();}}}>
    <summary><PositionBar count={Math.max(1, positions.length)}/>{positions.length > 1 ? `Positions ${connected}/${positions.length}` : "Positions · 1"}</summary>
    <div className={`${styles.panel} ${styles.setup}`}>
      <div className={styles.panelHead}><strong>Positions</strong>{positions.length ? <span>{connected} of {positions.length} connected</span> : null}</div>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {positions.map((p, index) => {
        const person = p.traineeName ?? p.assignedName, owned = exercise.aircraft.filter(a => aircraftPosition(exercise, a) === p.id).length;
        const demonstrating = exercise.demonstration?.positionId === p.id, open = drawer?.id === p.id ? drawer.kind : null;
        return <section key={p.id} className={styles.position} style={positionSwatch(index)} aria-label={`${p.name} ${p.mhz}`}>
          <div className={styles.positionHead}><strong>{p.name}</strong><span className={styles.mhz}>{p.mhz}</span>
            {person ? <span className={styles.person}><span className={styles.dot} data-on={p.occupied || undefined} aria-hidden="true"/>{person}<span className={styles.srOnly}> · {positionState(p)}</span></span> : <span className={`${styles.person} ${styles.muted}`}>Open position</span>}</div>
          <p className={styles.positionMeta}>{owned} aircraft{demonstrating ? " · Demonstrating now" : p.occupied ? "" : person ? " · Not joined yet" : " · No mentee assigned"}</p>
          <div className={styles.positionActions}>
            {onMonitor ? <button type="button" aria-pressed={monitor === p.id} onClick={() => onMonitor(p.id)}>{monitor === p.id ? "Monitoring" : "Monitor"}</button> : null}
            {p.occupied ? <button type="button" disabled={!enabled || !!exercise.demonstration} onClick={() => onDemonstrate(p.id)}>{demonstrating ? "Demonstrating" : "Demonstrate"}</button> : null}
            <button type="button" aria-expanded={open === "trainee"} disabled={!enabled} onClick={() => toggle(p.id, "trainee")}>{p.assignedId ? "Change mentee" : "Assign mentee"}</button>
            <button type="button" aria-expanded={open === "feedback"} onClick={() => toggle(p.id, "feedback")}>Feedback</button>
            {!p.occupied ? <Link href={`${sessionPath("mentee", session.id)}?position=${encodeURIComponent(p.id)}`} target="_blank" rel="noopener">Work it in a new window ↗</Link> : null}
          </div>
          {open === "trainee" ? <div className={styles.drawer}>
            <MenteePicker value={Object.hasOwn(chosen, p.id) ? chosen[p.id] : p.assignedId ? {discordId: p.assignedId, name: p.assignedName ?? "Assigned mentee"} : null} onChange={person => setChosen({...chosen, [p.id]: person})} disabled={!enabled || busy}/>
            <div><button type="button" onClick={() => setDrawer(null)}>Cancel</button><button type="button" className={styles.primary} disabled={!enabled || busy || !Object.hasOwn(chosen, p.id)} onClick={() => void post("position-assignment", {positionId: p.id, mentee: chosen[p.id] ? {discordId: chosen[p.id]!.discordId, name: chosen[p.id]!.name} : null})}>Save mentee</button></div>
          </div> : null}
          {open === "feedback" ? <div className={styles.drawer}>
            <label>Feedback for {person ? `${person} (${p.name})` : p.name}<textarea rows={3} maxLength={6000} value={feedback[p.id] ?? exercise.positionFeedback?.[p.id] ?? ""} onChange={e => setFeedback({...feedback, [p.id]: e.target.value})}/></label>
            <div><button type="button" className={styles.primary} disabled={!enabled || busy || feedback[p.id] === undefined} onClick={() => void post("position-assignment", {positionId: p.id, mentee: p.assignedId ? {discordId: p.assignedId, name: p.assignedName} : null, feedback: feedback[p.id]})}>Save feedback</button></div>
          </div> : null}
        </section>;
      })}
      <div className={styles.panelFoot}>
        {editing ? <>
          <PositionSetup selection={exercise} value={draft ?? exercise.positions} onChange={setDraft} disabled={!enabled || busy || exercise.running}/>
          <div><button type="button" onClick={() => {setDraft(null); setEditing(false);}}>Cancel</button><button type="button" className={styles.primary} disabled={!enabled || busy || exercise.running || !draft} onClick={() => void post("positions", {positions: draft})}>Apply layout</button></div>
          <p>{exercise.running ? "Pause the session to change the layout. " : ""}Removed positions merge into {(draft ?? exercise.positions)?.[0]?.name ?? "the first position"}.</p>
        </> : <div><button type="button" disabled={!enabled} onClick={() => setEditing(true)}>Change layout…</button>{exercise.running ? <p>Pause first to change the layout.</p> : null}</div>}
      </div>
    </div>
  </details>;
}
