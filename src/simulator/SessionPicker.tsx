"use client";
import LibraryFooter from "./LibraryFooter";
import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import {Trash} from "@phosphor-icons/react/dist/csr/Trash";
import LearningFrame from "../learning/LearningFrame";
import {ShareNetwork} from "@phosphor-icons/react/dist/csr/ShareNetwork";
import {UserPlus} from "@phosphor-icons/react/dist/csr/UserPlus";
import {CaretDown} from "@phosphor-icons/react/dist/csr/CaretDown";
import MenteePicker, {assignMentee, type Mentee} from "./MenteePicker";
import {trainingRequest} from "./TrainingLibrary";
import SessionAccess from "./SessionAccess";
import {sessionLibrary} from "./session-library";
import StaffTutorial from "./StaffTutorial";
import {sessionJson} from "./shared-transport";
import {environmentLabel, trainingMode} from "./airports";
import {joinPath, sessionCode, sessionPath, type SessionSummary} from "./sessions";
import type {ScenarioRecord} from "./scenarios";
import styles from "./StaffSessions.module.css";

export default function SessionPicker() {
  return <LearningFrame product="Sweatbox"><SessionAccess embedded role="staff" returnTo="/sweatbox/staff">{(csrf, accountId, access) => <Library key={accountId} csrf={csrf} accountId={accountId} canAssign={access.canAssign}/>}</SessionAccess></LearningFrame>;
}
const participant = (occupied: boolean, name?: string, id?: string) => occupied ? name?.trim() || id || "Connected" : "None";
function ActiveDate({time}: {time: number}) {
  const value = new Date(time);
  return <time dateTime={value.toISOString()}>{new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"}).format(value)}<small>{new Intl.DateTimeFormat("en-GB", {hour: "2-digit", minute: "2-digit", timeZone: "UTC"}).format(value)} UTC</small></time>;
}
const initials = (name: string) => name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("") || "?";
function Library({csrf, accountId, canAssign}: {csrf: string; accountId: string; canAssign: boolean}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]), [manualLinkId, setManualLinkId] = useState("");
  const [sharing, setSharing] = useState(""), [assigning, setAssigning] = useState<SessionSummary | null>(null), [mentee, setMentee] = useState<Mentee | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"new" | "end" | "assign" | null>(null), [scenarioId, setScenarioId] = useState(""), [busy, setBusy] = useState(false);
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
      launch.current = null;
      if (mentee) {
        try {await assignMentee(csrf, data.sessionId, mentee); setNotice(`Session created, paused and assigned to ${mentee.name ?? mentee.discordId}.`);}
        catch (reason) {setNotice(`Session created and paused, but it could not be assigned: ${(reason as Error).message}`);}
      } else setNotice("Session created and paused.");
      setDialog(null);
    } catch (reason) {setError((reason as Error).message);}
    finally {pending.current = false; setBusy(false); void library.current?.refresh();}
  };
  const traineeLink = (session: SessionSummary) => new URL(joinPath(sessionCode(session.id, session.airport)), window.location.origin).href;
  const copy = async (session: SessionSummary, kind: "link" | "code") => {
    setManualLinkId(""); setSharing("");
    try {await navigator.clipboard.writeText(kind === "link" ? traineeLink(session) : sessionCode(session.id, session.airport)); setNotice(kind === "link" ? "Mentee link copied." : "Session code copied.");}
    catch {setManualLinkId(session.id); setNotice("Could not copy automatically. Copy the mentee link shown in the session row.");}
  };
  const openAssign = (session: SessionSummary) => {
    setAssigning(session); setError(""); setSharing("");
    setMentee(session.assignedMenteeId ? {discordId: session.assignedMenteeId, ...(session.assignedMenteeName ? {name: session.assignedMenteeName} : {})} : null);
    setDialog("assign");
  };
  const assign = async (value: Mentee | null) => {
    if (!assigning || pending.current) return; pending.current = true; library.current?.invalidate(); setBusy(true); setError("");
    try {
      const data = await assignMentee(csrf, assigning.id, value);
      setSessions(current => current.map(s => s.id === assigning.id ? data.session : s));
      setDialog(null); setAssigning(null);
      setNotice(value ? `Assigned to ${value.name ?? value.discordId}. They will see it in Your sweatbox.` : "Assignment removed.");
    } catch (reason) {setError((reason as Error).message);}
    finally {pending.current = false; setBusy(false); void library.current?.refresh();}
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
      <div className={styles.heading}><div><h1>Sessions</h1></div><div className={styles.headingActions}><StaffTutorial accountId={accountId}/><button data-simulator-tour="new-session" className={styles.primary} disabled={loading} onClick={() => {launch.current = null; setScenarioId(scenarios[0]?.id ?? ""); setMentee(null); setError(""); setDialog("new");}}>New session</button></div></div>
      {loadError ? <p role="alert" className={styles.error}>Could not refresh sessions: {loadError} <button onClick={() => void library.current?.refresh()}>Try again</button></p> : null}
      {error && !dialog ? <p role="alert" className={styles.error}>{error}</p> : null}
      <div data-simulator-tour="session-library">{loading ? <p role="status" className={styles.loading}>Loading saved sessions…</p> : !sessions.length ? <section className={styles.empty}><h2>No sessions yet</h2><p>Start a session from one of your published scenarios.</p></section> :
        <div className={styles.tableWrap}><table aria-label="Saved Sweatbox sessions"><thead><tr><th scope="col">Session</th><th scope="col">Airport</th><th scope="col">Created by</th><th scope="col">Last active</th><th scope="col">Mentor</th><th scope="col">Mentee</th><th scope="col" className={styles.actionColumn}>Actions</th></tr></thead><tbody>{sessions.map(s => <tr key={s.id}>
          <td data-label="Session"><div className={styles.sessionName}><strong>{s.title}</strong><small>{sessionCode(s.id, s.airport)}</small></div></td>
          <td data-label="Airport">{s.airport ?? "EGPH"}<small>{{local: "(GT)", approach: "(A)", center: "(C)"}[trainingMode(s)]}</small></td>
          <td data-label="Created by">{s.ownerName || s.ownerId || "Unknown"}</td>
          <td data-label="Last active" className={styles.date}><ActiveDate time={s.updatedAt}/></td>
          <td data-label="Mentor">{participant(s.staffOccupied, s.staffName, s.staffId)}</td>
          <td data-label="Mentee"><MenteeCell session={s} canAssign={canAssign} onAssign={() => openAssign(s)}/></td>
          <td className={styles.actionColumn}><div className={styles.rowActions}>
            <span className={styles.shareMenu}>
              <button data-simulator-tour="mentee-sharing" aria-expanded={sharing === s.id} aria-haspopup="menu" onClick={() => setSharing(current => current === s.id ? "" : s.id)}><ShareNetwork size={17} aria-hidden="true"/>Share<span className={styles.srOnly}> {s.title}</span></button>
              {sharing === s.id ? <span role="menu" className={styles.shareOptions} onKeyDown={e => {if (e.key === "Escape") setSharing("");}}>
                <button role="menuitem" autoFocus onClick={() => void copy(s, "link")}>Copy mentee link</button>
                <button role="menuitem" onClick={() => void copy(s, "code")}>Copy code <code>{sessionCode(s.id, s.airport)}</code></button>
              </span> : null}
            </span>
            <Link data-simulator-tour="staff-radar-link" className={styles.primary} href={sessionPath("staff", s.id)}>Enter<span className={styles.srOnly}> {s.title}</span></Link>
            <button className={styles.deleteAction} onClick={() => {setEnding(s); setError(""); setDialog("end");}}><Trash size={17} aria-hidden="true"/>Archive<span className={styles.srOnly}> {s.title}</span></button>
          </div>{manualLinkId === s.id ? <label className={styles.manualLink}>Mentee link<input aria-label={`Mentee link for ${s.title}`} readOnly value={traineeLink(s)} onFocus={e => e.currentTarget.select()}/></label> : null}</td>
        </tr>)}</tbody></table></div>}</div>
      <LibraryFooter/>
    </main>
    {notice ? <div className={styles.notification}><p role="status">{notice}</p><button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div> : null}
    <dialog ref={modal} aria-label={dialog === "end" ? "Archive this session?" : dialog === "assign" ? "Assign mentee" : "New session"} className={styles.dialog} onCancel={e => {if (busy) e.preventDefault(); else setDialog(null);}}>
      {dialog === "new" ? <form onSubmit={e => {e.preventDefault(); void create();}}><h2>Create training session</h2>{scenarios.length ? <><label>Published scenario<select value={scenarioId || scenarios[0]?.id} onChange={e => setScenarioId(e.target.value)}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.draft.title} · {s.ownerName || s.ownerId} · Revision {s.publishedRevision}</option>)}</select></label></> : <p>No published scenarios. <Link href="/sweatbox/scenarios">Open scenarios →</Link></p>}{scenarios.length && canAssign ? <fieldset className={styles.pickerFieldset}><legend>Mentee <span>(optional)</span></legend><MenteePicker value={mentee} onChange={setMentee} disabled={busy}/></fieldset> : null}<p className={styles.airport}>{scenarios.length ? environmentLabel((scenarios.find(s => s.id === scenarioId) ?? scenarios[0]).published ?? (scenarios.find(s => s.id === scenarioId) ?? scenarios[0]).draft) : ""}</p>{error ? <p role="alert" className={styles.error}>{error}</p> : null}<div className={styles.dialogActions}><button type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className={styles.primary} disabled={busy || !scenarios.length}>{busy ? "Creating…" : "Create session"}</button></div></form> : dialog === "assign" && assigning ? <form onSubmit={e => {e.preventDefault(); void assign(mentee);}}><h2>Assign mentee</h2><p>{assigning.title} · {assigning.airport ?? "EGPH"}</p>
        <MenteePicker value={mentee} onChange={setMentee} disabled={busy}/>
        {mentee ? <p className={styles.assignNote}>{mentee.name ?? mentee.discordId} will see this session in Your sweatbox and get a Discord message. Only they can take the mentee seat while it is assigned{assigning.menteeOccupied && assigning.assignedMenteeId !== mentee.discordId ? ". Whoever holds the mentee seat now will be disconnected" : ""}.</p> : null}
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        <div className={styles.dialogActions}>{assigning.assignedMenteeId ? <button type="button" className={styles.danger} disabled={busy} onClick={() => void assign(null)}>Remove assignment</button> : null}<button type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className={styles.primary} disabled={busy || !mentee || mentee.discordId === assigning.assignedMenteeId}>{busy ? "Saving…" : mentee ? `Assign ${mentee.name ?? "mentee"}` : "Assign"}</button></div></form> : dialog === "end" ? <><h2>Archive this session?</h2><p><strong>{ending?.title}</strong> will close permanently. Its recording will be saved in Replays.</p>{error ? <p role="alert" className={styles.error}>{error}</p> : null}<div className={styles.dialogActions}><button autoFocus disabled={busy} onClick={() => setDialog(null)}>Keep session</button><button className={styles.danger} disabled={busy} onClick={() => void end()}>{busy ? "Archiving…" : "Archive session"}</button></div></> : null}
    </dialog>
  </div>;
}
function MenteeCell({session, canAssign, onAssign}: {session: SessionSummary; canAssign: boolean; onAssign: () => void}) {
  if (!session.assignedMenteeId) {
    const current = participant(session.menteeOccupied, session.menteeName, session.menteeId);
    return canAssign ? <div className={styles.menteeCell}>{session.menteeOccupied ? <span>{current}</span> : null}<button type="button" className={styles.assignButton} onClick={onAssign}><UserPlus size={18} aria-hidden="true"/>Assign mentee<span className={styles.srOnly}> to {session.title}</span></button></div> : <>{current}</>;
  }
  const name = session.assignedMenteeName || session.assignedMenteeId, state = session.menteeOccupied ? "In session" : "Assigned · not joined yet";
  const content = <><span className={styles.avatar} aria-hidden="true">{initials(name)}</span><span className={styles.personText} title={`${name} · ${state}`}><strong>{name}</strong><small className={session.menteeOccupied ? styles.live : undefined}>{state}</small></span></>;
  return canAssign ? <button type="button" className={styles.assignedButton} aria-label={`Change assigned mentee for ${session.title}: ${name}, ${state}`} onClick={onAssign}>{content}<CaretDown size={16} aria-hidden="true"/></button> : <span className={styles.assignedButton}>{content}</span>;
}
