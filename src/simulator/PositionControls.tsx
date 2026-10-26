"use client";
import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import type {Exercise} from "./model";
import type {SessionSummary} from "./sessions";
import {sessionPath} from "./sessions";
import {aircraftPosition, bandboxName, type ControllerPosition, type PositionPresence} from "./positions";
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
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [working, setWorking] = useState<string[]>([]);
  const post = async (operation: string, body: object) => {
    setBusy(true); setError("");
    try {await fetch(`/api/simulator/sessions/${session.id}/${operation}`, {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrf}, body: JSON.stringify(body)}).then(sessionJson); setDraft(null); setEditing(false); setDrawer(null); return true;}
    catch (reason) {setError((reason as Error).message); return false;} finally {setBusy(false);}
  };
  if (!exercise.trainingStation?.endsWith(":approach")) return null;
  const positions = session.positions ?? [], connected = positions.filter(p => p.occupied).length;
  const toggle = (id: string, kind: "trainee" | "feedback") => setDrawer(current => current?.id === id && current.kind === kind ? null : {id, kind});
  // One section per bandbox (several positions, one person) or lone position.
  const groups: PositionPresence[][] = positions.filter(p => !p.bandboxId || p.bandboxId === p.id).map(p => p.bandboxId ? positions.filter(q => q.bandboxId === p.bandboxId) : [p]);
  const people = groups.flatMap(g => g[0].assignedId ? [{discordId: g[0].assignedId, name: g[0].assignedName ?? g[0].traineeName ?? "the mentee", primary: g[0].id}] : []);
  const free = positions.filter(p => !p.occupied && !p.assignedId);
  /** Assign (or clear) the same mentee on each position; one person on several positions is a bandbox. */
  const assign = async (ids: string[], person: Mentee | null) => {for (const positionId of ids) if (!await post("position-assignment", {positionId, mentee: person ? {discordId: person.discordId, name: person.name} : null})) return;};
  return <details ref={menu} className={styles.controls} onKeyDown={event => {if (event.key === "Escape" && menu.current) {event.stopPropagation(); menu.current.open = false; menu.current.querySelector("summary")?.focus();}}}>
    <summary><PositionBar count={Math.max(1, positions.length)}/>{positions.length > 1 ? `Positions ${connected}/${positions.length}` : "Positions · 1"}</summary>
    <div className={`${styles.panel} ${styles.setup}`}>
      <div className={styles.panelHead}><strong>Positions</strong>{positions.length ? <span>{connected} of {positions.length} connected</span> : null}</div>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {groups.map(group => {
        const p = group[0], index = positions.indexOf(p), bandbox = group.length > 1, ids = group.map(g => g.id);
        const person = p.traineeName ?? p.assignedName, owned = exercise.aircraft.filter(a => ids.includes(aircraftPosition(exercise, a) ?? "")).length;
        const demonstrating = exercise.demonstration?.positionId === p.id, open = drawer?.id === p.id ? drawer.kind : null;
        const splitting = group.find(g => g !== p && drawer?.id === g.id && drawer.kind === "trainee");
        return <section key={p.id} className={styles.position} style={positionSwatch(index)} aria-label={`${bandboxName(group)} ${p.mhz}`}>
          <div className={styles.positionHead}>{bandbox ? <span className={styles.swatches} aria-hidden="true">{group.map(g => <span key={g.id} style={positionSwatch(positions.indexOf(g))}/>)}</span> : null}<strong>{bandboxName(group)}</strong><span className={styles.mhz}>{p.mhz}</span>{bandbox ? <span className={styles.bandboxTag}>Bandbox</span> : null}
            {person ? <span className={styles.person}><span className={styles.dot} data-on={p.occupied || undefined} aria-hidden="true"/>{person}<span className={styles.srOnly}> · {positionState(p)}</span></span> : <span className={`${styles.person} ${styles.muted}`}>Open position</span>}</div>
          <p className={styles.positionMeta}>{owned} aircraft{bandbox ? ` · one frequency, ${p.mhz}` : ""}{demonstrating ? " · Demonstrating now" : p.occupied ? "" : person ? " · Not joined yet" : " · No mentee assigned"}</p>
          <div className={styles.positionActions}>
            {onMonitor ? <button type="button" aria-pressed={monitor === p.id} onClick={() => onMonitor(p.id)}>{monitor === p.id ? "Monitoring" : "Monitor"}</button> : null}
            {p.occupied ? <button type="button" disabled={!enabled || !!exercise.demonstration} onClick={() => onDemonstrate(p.id)}>{demonstrating ? "Demonstrating" : bandbox ? group.length === 2 ? "Demonstrate both" : "Demonstrate all" : "Demonstrate"}</button> : null}
            <button type="button" aria-expanded={open === "trainee"} disabled={!enabled} onClick={() => toggle(p.id, "trainee")}>{p.assignedId ? "Change mentee" : "Assign mentee"}</button>
            <button type="button" aria-expanded={open === "feedback"} onClick={() => toggle(p.id, "feedback")}>Feedback</button>
            {!person ? people.filter(x => x.primary !== p.id).map(x => <button key={x.discordId} type="button" className={styles.accent} disabled={!enabled || busy} onClick={() => void assign([p.id], x)}>Add to {x.name}&apos;s bandbox</button>) : null}
            {!p.occupied && !person ? <Link href={`${sessionPath("mentee", session.id)}?position=${encodeURIComponent(p.id)}`} target="_blank" rel="noopener">Work it in a new window ↗</Link> : null}
          </div>
          {bandbox ? <div className={styles.members}><span>In this bandbox</span>{group.map((g, i) => <div key={g.id} style={positionSwatch(positions.indexOf(g))}>
            <span className={styles.swatch} aria-hidden="true"/><strong>{g.name}</strong><span className={styles.mhz}>{g.mhz}{i === 0 ? " · primary" : ""} · {exercise.aircraft.filter(a => aircraftPosition(exercise, a) === g.id).length} aircraft</span>
            {i > 0 ? <button type="button" aria-expanded={drawer?.id === g.id} disabled={!enabled} onClick={() => toggle(g.id, "trainee")}>Split off…</button> : null}
          </div>)}</div> : null}
          {splitting ? <div className={styles.drawer}>
            <label>Hand {splitting.name} to<MenteePicker value={Object.hasOwn(chosen, splitting.id) ? chosen[splitting.id] : null} onChange={person => setChosen({...chosen, [splitting.id]: person})} disabled={!enabled || busy}/></label>
            <p className={styles.help}>{person ?? "The mentee"} keeps {bandboxName(group.filter(g => g !== splitting))}. Leave it empty to make {splitting.name} an open position.</p>
            <div><button type="button" onClick={() => setDrawer(null)}>Cancel</button><button type="button" className={styles.primary} disabled={!enabled || busy} onClick={() => void assign([splitting.id], chosen[splitting.id] ?? null)}>Split off {splitting.name}</button></div>
          </div> : null}
          {open === "trainee" ? <div className={styles.drawer}>
            <MenteePicker value={Object.hasOwn(chosen, p.id) ? chosen[p.id] : p.assignedId ? {discordId: p.assignedId, name: p.assignedName ?? "Assigned mentee"} : null} onChange={person => setChosen({...chosen, [p.id]: person})} disabled={!enabled || busy}/>
            {bandbox ? <p className={styles.help}>The new mentee takes the whole bandbox: {bandboxName(group)}.</p> : null}
            <div><button type="button" onClick={() => setDrawer(null)}>Cancel</button><button type="button" className={styles.primary} disabled={!enabled || busy || !Object.hasOwn(chosen, p.id)} onClick={() => void assign(ids, chosen[p.id] ?? null)}>Save mentee</button></div>
          </div> : null}
          {open === "feedback" ? <div className={styles.drawer}>
            <label>Feedback for {person ? `${person} (${bandboxName(group)})` : p.name}<textarea rows={3} maxLength={6000} value={feedback[p.id] ?? exercise.positionFeedback?.[p.id] ?? ""} onChange={e => setFeedback({...feedback, [p.id]: e.target.value})}/></label>
            <div><button type="button" className={styles.primary} disabled={!enabled || busy || feedback[p.id] === undefined} onClick={() => void post("position-assignment", {positionId: p.id, mentee: p.assignedId ? {discordId: p.assignedId, name: p.assignedName} : null, feedback: feedback[p.id]})}>Save feedback</button></div>
          </div> : null}
        </section>;
      })}
      {free.length ? <div className={styles.work}>
        <strong>Work positions yourself</strong>
        <fieldset><legend className={styles.srOnly}>Open positions to work</legend>{free.map(p => <label key={p.id}><input type="checkbox" checked={working.includes(p.id)} onChange={e => setWorking(current => e.target.checked ? [...current, p.id] : current.filter(id => id !== p.id))}/>{p.name}</label>)}</fieldset>
        <p className={styles.help}>Tick several open positions to bandbox them yourself on one frequency.</p>
        {working.length ? <div><Link href={`${sessionPath("mentee", session.id)}?position=${encodeURIComponent(free.filter(p => working.includes(p.id)).map(p => p.id).join(","))}`} target="_blank" rel="noopener">Work {bandboxName(free.filter(p => working.includes(p.id)))} in a new window ↗</Link></div> : null}
      </div> : null}
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
