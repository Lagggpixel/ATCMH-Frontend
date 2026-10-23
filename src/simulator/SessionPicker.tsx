"use client";
import LibraryFooter from "./LibraryFooter";
import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import {Trash} from "@phosphor-icons/react/dist/csr/Trash";
import LearningFrame from "../learning/LearningFrame";
import {Copy} from "@phosphor-icons/react/dist/csr/Copy";
import {trainingRequest} from "./TrainingLibrary";
import SessionAccess from "./SessionAccess";
import {sessionLibrary} from "./session-library";
import StaffTutorial from "./StaffTutorial";
import {sessionJson} from "./shared-transport";
import {environmentLabel, trainingMode} from "./airports";
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
  const [sessions, setSessions] = useState<SessionSummary[]>([]), [manualLinkId, setManualLinkId] = useState("");
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"new" | "end" | null>(null), [scenarioId, setScenarioId] = useState(""), [busy, setBusy] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [ending, setEnding] = useState<SessionSummary | null>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const library = useRef<ReturnType<typeof sessionLibrary> | null>(null), pending = useRef(false);
  const launch = useRef<{scenarioId: string; revision: number; requestId: string} | null>(null);
  useEffect(() => {
    const sync = sessionLibrary((data, definitions) => {setSessions(data); setScenarios(definitions); setLoading(false);}, message => {setLoadError(message); setLoading(false);});
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
      setDialog(null); setNotice("Session created and paused."); launch.current = null;
    } catch (reason) {setError((reason as Error).message);}
    finally {pending.current = false; setBusy(false); void library.current?.refresh();}
  };
  const copy = async (session: SessionSummary) => {
    setManualLinkId("");
    try {await navigator.clipboard.writeText(new URL(sessionPath("mentee", session.id), window.location.origin).href); setNotice("Trainee link copied.");}
    catch {setManualLinkId(session.id); setNotice("Could not copy automatically. Copy the trainee link shown in the session row.");}
  };
  const end = async () => {
    if (!ending || pending.current) return; pending.current = true; library.current?.invalidate(); setBusy(true); setError("");
    try {
      await fetch(`/api/simulator/sessions/${ending.id}`, {method: "DELETE", headers: {"x-csrf-token": csrf}}).then(sessionJson);
      setSessions(current => current.filter(s => s.id !== ending.id)); setDialog(null); setEnding(null); setNotice("Session moved to Replays.");
    } catch (reason) {setError((reason as Error).message);}
    finally {pending.current = false; setBusy(false); void library.current?.refresh();}
  };
  return <div className={`${styles.library} ${styles.workspaceLibrary}`}>

    <main className={styles.content}>
      <div className={styles.heading}><div><h1>Sessions</h1></div><div className={styles.headingActions}><StaffTutorial accountId={accountId}/><button data-simulator-tour="new-session" className={styles.primary} disabled={loading} onClick={() => {launch.current = null; setScenarioId(scenarios[0]?.id ?? ""); setError(""); setDialog("new");}}>New session</button></div></div>
      {loadError ? <p role="alert" className={styles.error}>Could not refresh sessions: {loadError} <button onClick={() => void library.current?.refresh()}>Try again</button></p> : null}
      {error && !dialog ? <p role="alert" className={styles.error}>{error}</p> : null}
      <div data-simulator-tour="session-library">{loading ? <p role="status" className={styles.loading}>Loading saved sessions…</p> : !sessions.length ? <section className={styles.empty}><h2>No sessions yet</h2><p>Start a session from one of your published scenarios.</p></section> :
        <div className={styles.tableWrap}><table aria-label="Saved Sweatbox sessions"><thead><tr><th scope="col">Session</th><th scope="col">Airport</th><th scope="col">Created by</th><th scope="col">Last active</th><th scope="col">Mentor</th><th scope="col">Mentee</th><th scope="col" className={styles.actionColumn}>Actions</th></tr></thead><tbody>{sessions.map(s => <tr key={s.id}>
          <td data-label="Session"><div className={styles.sessionName}><strong>{s.title}</strong><small>{sessionCode(s.id, s.airport)}</small></div></td>
          <td data-label="Airport">{s.airport ?? "EGPH"}<small>{{local: "(GT)", approach: "(A)", center: "(C)"}[trainingMode(s)]}</small></td>
          <td data-label="Created by">{s.ownerName || s.ownerId || "Unknown"}</td>
          <td data-label="Last active" className={styles.date}><ActiveDate time={s.updatedAt}/></td>
          <td data-label="Mentor">{participant(s.staffOccupied, s.staffName, s.staffId)}</td>
          <td data-label="Mentee">{participant(s.menteeOccupied, s.menteeName, s.menteeId)}</td>
          <td className={styles.actionColumn}><div className={styles.rowActions}>
            <button data-simulator-tour="mentee-sharing" onClick={() => void copy(s)}><Copy size={17} aria-hidden="true"/>Trainee link<span className={styles.srOnly}> for {s.title}</span></button>
            <Link data-simulator-tour="staff-radar-link" className={styles.primary} href={sessionPath("staff", s.id)}>Enter<span className={styles.srOnly}> {s.title}</span></Link>
            <button className={styles.deleteAction} onClick={() => {setEnding(s); setError(""); setDialog("end");}}><Trash size={17} aria-hidden="true"/>Archive<span className={styles.srOnly}> {s.title}</span></button>
          </div>{manualLinkId === s.id ? <label className={styles.manualLink}>Trainee link<input aria-label={`Trainee link for ${s.title}`} readOnly value={new URL(sessionPath("mentee", s.id), window.location.origin).href} onFocus={e => e.currentTarget.select()}/></label> : null}</td>
        </tr>)}</tbody></table></div>}</div>
      <LibraryFooter/>
    </main>
    {notice ? <div className={styles.notification}><p role="status">{notice}</p><button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div> : null}
    <dialog ref={modal} aria-label={dialog === "end" ? "Archive this session?" : "New session"} className={styles.dialog} onCancel={e => {if (busy) e.preventDefault(); else setDialog(null);}}>
      {dialog === "new" ? <form onSubmit={e => {e.preventDefault(); void create();}}><h2>Create training session</h2>{scenarios.length ? <><label>Published scenario<select value={scenarioId || scenarios[0]?.id} onChange={e => setScenarioId(e.target.value)}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.draft.title} · {s.ownerName || s.ownerId} · Revision {s.publishedRevision}</option>)}</select></label></> : <p>No published scenarios. <Link href="/sweatbox/scenarios">Open scenarios →</Link></p>}<p className={styles.airport}>{scenarios.length ? environmentLabel((scenarios.find(s => s.id === scenarioId) ?? scenarios[0]).published ?? (scenarios.find(s => s.id === scenarioId) ?? scenarios[0]).draft) : ""}</p>{error ? <p role="alert" className={styles.error}>{error}</p> : null}<div className={styles.dialogActions}><button type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className={styles.primary} disabled={busy || !scenarios.length}>{busy ? "Creating…" : "Create session"}</button></div></form> : dialog === "end" ? <><h2>Archive this session?</h2><p><strong>{ending?.title}</strong> will close permanently. Its recording will be saved in Replays.</p>{error ? <p role="alert" className={styles.error}>{error}</p> : null}<div className={styles.dialogActions}><button autoFocus disabled={busy} onClick={() => setDialog(null)}>Keep session</button><button className={styles.danger} disabled={busy} onClick={() => void end()}>{busy ? "Archiving…" : "Archive session"}</button></div></> : null}
    </dialog>
  </div>;
}
