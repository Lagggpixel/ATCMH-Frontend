"use client";
import LibraryFooter from "./LibraryFooter";
import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import {ArrowSquareOut} from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import {Trash} from "@phosphor-icons/react/dist/csr/Trash";
import LearningFrame from "../learning/LearningFrame";
import {Copy} from "@phosphor-icons/react/dist/csr/Copy";
import {TrainingNav, trainingRequest} from "./TrainingLibrary";
import SessionAccess from "./SessionAccess";
import {sessionLibrary} from "./session-library";
import StaffTutorial from "./StaffTutorial";
import {sessionJson} from "./shared-transport";
import {getAirport, environmentLabel} from "./airports";
import {sessionCode, sessionPath, type SessionSummary} from "./sessions";
import type {ScenarioRecord} from "./scenarios";
import styles from "./StaffSessions.module.css";

export default function SessionPicker() {
  return <LearningFrame product="Sweatbox"><SessionAccess embedded role="staff" returnTo="/sweatbox/staff">{(csrf, accountId) => <Library key={accountId} csrf={csrf} accountId={accountId}/>}</SessionAccess></LearningFrame>;
}
const participant = (occupied: boolean, name?: string, id?: string) => occupied ? name?.trim() || id || "Connected" : "None";
function ActiveDate({time}: {time: number}) {
  const value = new Date(time);
  return <time dateTime={value.toISOString()}>{new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"}).format(value)}<small>{new Intl.DateTimeFormat("en-GB", {hour: "2-digit", minute: "2-digit", timeZone: "UTC"}).format(value)} UTC</small></time>;
}
function Library({csrf, accountId}: {csrf: string; accountId: string}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]), [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"new" | "end" | null>(null), [scenarioId, setScenarioId] = useState(""), [busy, setBusy] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [ending, setEnding] = useState<SessionSummary | null>(null);
  const modal = useRef<HTMLDialogElement>(null), active = sessions.find(s => s.id === selectedId);
  const library = useRef<ReturnType<typeof sessionLibrary> | null>(null), pending = useRef(false);
  const launch = useRef<{scenarioId: string; revision: number; requestId: string} | null>(null);
  useEffect(() => {
    const sync = sessionLibrary((data, definitions) => {setSessions(data); setScenarios(definitions); setLoading(false); const requested = new URL(window.location.href).searchParams.get("session"); setSelectedId(current => data.some(s => s.id === current) ? current : data.find(s => s.id === requested)?.id ?? data[0]?.id ?? "");}, message => {setLoadError(message); setLoading(false);});
    library.current = sync; void sync.refresh();
    return () => {sync.stop(); library.current = null;};
  }, []);
  useEffect(() => {if (dialog) modal.current?.showModal(); else modal.current?.close();}, [dialog]);
  const create = async () => {
    const scenario = scenarios.find(s => s.id === scenarioId) ?? scenarios[0];
    if (!scenario || pending.current) return;
    pending.current = true; library.current?.invalidate(); setBusy(true); setError("");
    if (launch.current?.scenarioId !== scenario.id)
      launch.current = {scenarioId: scenario.id, revision: scenario.publishedRevision, requestId: crypto.randomUUID()};
    try {
      const data = await trainingRequest(csrf, `scenarios/${scenario.id}`, {action: "launch", revision: launch.current.revision, requestId: launch.current.requestId});
      if (!data.sessionId) throw new Error("The session could not be confirmed. Try again.");
      setDialog(null); setSelectedId(data.sessionId); setNotice("Session created and paused."); launch.current = null;
    } catch (reason) {setError((reason as Error).message);}
    finally {pending.current = false; setBusy(false); void library.current?.refresh();}
  };
  const copy = async () => {
    if (!active) return;
    try {await navigator.clipboard.writeText(new URL(sessionPath("mentee", active.id), window.location.origin).href); setNotice("Mentee link copied.");}
    catch {setNotice("Copy the mentee link below.");}
  };
  const end = async () => {
    if (!ending || pending.current) return; pending.current = true; library.current?.invalidate(); setBusy(true); setError("");
    try {
      await fetch(`/api/simulator/sessions/${ending.id}`, {method: "DELETE", headers: {"x-csrf-token": csrf}}).then(sessionJson);
      setSessions(current => current.filter(s => s.id !== ending.id)); setSelectedId(""); setDialog(null); setNotice("Session ended. Its recording is saved in Replays.");
    } catch (reason) {setError((reason as Error).message);}
    finally {pending.current = false; setBusy(false); void library.current?.refresh();}
  };
  return <div className={styles.library}>
    <TrainingNav active="sessions"/>
    <main className={styles.content}>
      <div className={styles.heading}><h1>Sweatbox sessions</h1><div className={styles.headingActions}><StaffTutorial accountId={accountId}/><button data-simulator-tour="new-session" className={styles.primary} disabled={loading} onClick={() => {launch.current = null; setScenarioId(scenarios[0]?.id ?? ""); setError(""); setDialog("new");}}>New session</button></div></div>
      {loadError ? <p role="alert" className={styles.error}>Could not refresh sessions: {loadError} <button onClick={() => void library.current?.refresh()}>Try again</button></p> : null}
      {error && !dialog ? <p role="alert" className={styles.error}>{error}</p> : null}
      <div data-simulator-tour="session-library">{loading ? <p role="status" className={styles.loading}>Loading saved sessions…</p> : !sessions.length ? <section className={styles.empty}><h2>No saved sessions yet</h2></section> :
        <div className={styles.tableWrap}><table aria-label="Saved Sweatbox sessions"><thead><tr><th scope="col">Session</th><th scope="col">Airport</th><th scope="col">Created by</th><th scope="col">Last active (UTC)</th><th scope="col">Mentor</th><th scope="col">Mentee</th><th scope="col" className={styles.actionColumn}>Action</th></tr></thead><tbody>{sessions.map(s => <tr key={s.id} className={s.id === selectedId ? styles.selected : undefined}>
          <td data-label="Session"><button className={styles.sessionName} aria-pressed={s.id === selectedId} onClick={() => {setSelectedId(s.id); setNotice("");}}><strong>{s.title}</strong><small>{sessionCode(s.id)}</small></button></td>
          <td data-label="Airport">{s.airport ?? "EGPH"}<small>{environmentLabel(s).split(" · ")[1]}</small></td>
          <td data-label="Created by">{s.ownerName || s.ownerId || "Unknown"}</td>
          <td data-label="Last active" className={styles.date}><ActiveDate time={s.updatedAt}/></td>
          <td data-label="Mentor">{participant(s.staffOccupied, s.staffName, s.staffId)}</td>
          <td data-label="Mentee">{participant(s.menteeOccupied, s.menteeName, s.menteeId)}</td>
          <td className={styles.actionColumn}>{s.staffOccupied ? <button aria-label={`View details for ${s.title}`} onClick={() => {setSelectedId(s.id); setNotice("");}}>View details</button> : <Link data-simulator-tour="staff-radar-link" className={styles.primary} href={sessionPath("staff", s.id)}>Open staff radar<span className={styles.srOnly}> for {s.title}</span></Link>}</td>
        </tr>)}</tbody></table></div>}</div>
      {active ? <section className={styles.selectedSession} aria-label="Selected session">
        <div className={styles.selectedIdentity}><span className={styles.eyebrow}>Selected session</span><h2>{active.title}</h2><small>{environmentLabel(active)} · {getAirport(active).name} · Created by {active.ownerName || active.ownerId || "Unknown"}</small></div>
        <div className={styles.selectedPeople}><span><span className={styles.eyebrow}>Mentor</span>{participant(active.staffOccupied, active.staffName, active.staffId)}</span><span><span className={styles.eyebrow}>Mentee</span>{participant(active.menteeOccupied, active.menteeName, active.menteeId)}</span></div>
        <div className={styles.sharing}><span className={styles.eyebrow}>Mentee access</span><div className={styles.linkRow}><button data-simulator-tour="mentee-sharing" onClick={() => void copy()}><Copy size={17}/>Copy mentee link</button><Link href={sessionPath("mentee", active.id)} target="_blank" rel="noreferrer">Open mentee page<ArrowSquareOut size={17}/></Link></div>{notice === "Copy the mentee link below." ? <details open className={styles.manualLink}><summary>Show mentee link</summary><input aria-label="Mentee link" readOnly value={typeof window === "undefined" ? sessionPath("mentee", active.id) : new URL(sessionPath("mentee", active.id), window.location.origin).href} onFocus={e => e.currentTarget.select()}/></details> : null}</div>
        <button className={styles.endAction} onClick={() => {setEnding(active); setError(""); setDialog("end");}}><Trash size={18}/>End session</button>
      </section> : null}
      <LibraryFooter/>
    </main>
    {notice ? <div className={styles.notification}><p role="status">{notice}</p><button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div> : null}
    <dialog ref={modal} aria-label={dialog === "end" ? "End this session?" : "New session"} className={styles.dialog} onCancel={e => {if (busy) e.preventDefault(); else setDialog(null);}}>
      {dialog === "new" ? <form onSubmit={e => {e.preventDefault(); void create();}}><h2>Create training session</h2>{scenarios.length ? <><label>Published scenario<select value={scenarioId || scenarios[0]?.id} onChange={e => setScenarioId(e.target.value)}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.draft.title} · {s.ownerName || s.ownerId} · Revision {s.publishedRevision}</option>)}</select></label></> : <p>No published scenarios. <Link href="/sweatbox/scenarios">Open scenarios →</Link></p>}<p className={styles.airport}>{scenarios.length ? environmentLabel((scenarios.find(s => s.id === scenarioId) ?? scenarios[0]).published ?? (scenarios.find(s => s.id === scenarioId) ?? scenarios[0]).draft) : ""}</p>{error ? <p role="alert" className={styles.error}>{error}</p> : null}<div className={styles.dialogActions}><button type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className={styles.primary} disabled={busy || !scenarios.length}>{busy ? "Creating…" : "Create session"}</button></div></form> : dialog === "end" ? <><h2>End this session?</h2><p><strong>{ending?.title}</strong> will close permanently. Its recording will be saved in Replays.</p>{error ? <p role="alert" className={styles.error}>{error}</p> : null}<div className={styles.dialogActions}><button autoFocus disabled={busy} onClick={() => setDialog(null)}>Keep session</button><button className={styles.danger} disabled={busy} onClick={() => void end()}>{busy ? "Ending…" : "End session"}</button></div></> : null}
    </dialog>
  </div>;
}
