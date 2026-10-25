"use client";
import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import {Warning} from "@phosphor-icons/react/dist/csr/Warning";
import MenteePicker, {assignMentee, type Mentee} from "./MenteePicker";
import {trainingRequest} from "./TrainingLibrary";
import {sessionJson} from "./shared-transport";
import {environmentLabel} from "./airports";
import type {SessionSummary} from "./sessions";
import type {ScenarioRecord} from "./scenarios";
import staff from "./StaffSessions.module.css";
import ui from "./Sweatbox.module.css";

export type SessionDialogState = {kind: "new"; scenarioId?: string} | {kind: "assign"; session: SessionSummary} | {kind: "end"; session: SessionSummary} | null;
export interface SessionDialogResult {notice: string; created?: string; updated?: SessionSummary; ended?: string}

/** Archive with the feedback a Mentor writes while closing; an empty body keeps the old contract. */
export const archiveSession = (csrf: string, id: string, feedback?: string) => fetch(`/api/simulator/sessions/${id}`, {method: "DELETE",
  headers: {"x-csrf-token": csrf, ...(feedback ? {"content-type": "application/json"} : {})}, ...(feedback ? {body: JSON.stringify({feedback})} : {})}).then(sessionJson);

const assignedMentee = (session: SessionSummary): Mentee | null => session.assignedMenteeId ? {discordId: session.assignedMenteeId, ...(session.assignedMenteeName ? {name: session.assignedMenteeName} : {})} : null;

/** New session, Mentee assignment and archive dialogs shared by Home and Sessions. */
export default function SessionDialogs(props: {
  state: SessionDialogState; csrf: string; canAssign: boolean; scenarios: ScenarioRecord[];
  onClose: () => void; onDone: (result: SessionDialogResult) => void; onBusy?: (busy: boolean) => void;
}) {
  const {state, onClose, onBusy} = props;
  const modal = useRef<HTMLDialogElement>(null), busy = useRef(false);
  useEffect(() => {
    if (!state) modal.current?.close();
    else if (!modal.current?.open) modal.current?.showModal();
  }, [state]);
  const label = state?.kind === "end" ? "Archive this session?" : state?.kind === "assign" ? "Assign Mentee" : "Start a session";
  // Each opening remounts the form, so it starts from the session or scenario it was opened for.
  const key = !state ? "closed" : state.kind === "new" ? `new:${state.scenarioId ?? ""}` : `${state.kind}:${state.session.id}`;
  return <div className={`${staff.library} ${ui.dialogHost}`}><dialog ref={modal} aria-label={label} className={`${staff.dialog} ${state?.kind === "end" ? ui.wideDialog : ""}`} onCancel={event => {event.preventDefault(); if (!busy.current) onClose();}}>
    {state ? <DialogBody key={key} {...props} state={state} onBusy={value => {busy.current = value; onBusy?.(value);}}/> : null}
  </dialog></div>;
}

function DialogBody({state, csrf, canAssign, scenarios, onClose, onDone, onBusy}: {
  state: NonNullable<SessionDialogState>; csrf: string; canAssign: boolean; scenarios: ScenarioRecord[];
  onClose: () => void; onDone: (result: SessionDialogResult) => void; onBusy: (busy: boolean) => void;
}) {
  const pending = useRef(false);
  const launch = useRef<{scenarioId: string; revision: number; requestId: string} | null>(null);
  const [scenarioId, setScenarioId] = useState(state.kind === "new" ? state.scenarioId ?? "" : "");
  const [mentee, setMentee] = useState<Mentee | null>(state.kind === "assign" ? assignedMentee(state.session) : null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [feedback, setFeedback] = useState(""), [skipping, setSkipping] = useState(false), [sure, setSure] = useState(false);
  const kind = state.kind, subject = state.kind !== "new" ? state.session : null;
  const run = async (work: () => Promise<SessionDialogResult>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); onBusy(true); setError("");
    try {onDone(await work());}
    catch (reason) {setError((reason as Error).message);}
    finally {pending.current = false; setBusy(false); onBusy(false);}
  };
  const chosen = scenarios.find(s => s.id === scenarioId) ?? scenarios[0];
  const create = () => run(async () => {
    if (!chosen) throw new Error("Choose a published scenario.");
    if (launch.current?.scenarioId !== chosen.id) launch.current = {scenarioId: chosen.id, revision: chosen.publishedRevision, requestId: crypto.randomUUID()};
    const data = await trainingRequest(csrf, `scenarios/${chosen.id}`, {action: "launch", revision: launch.current.revision, requestId: launch.current.requestId});
    if (!data.sessionId) throw new Error("The session could not be confirmed. Try again.");
    launch.current = null;
    if (!mentee) return {notice: "Session created and paused.", created: data.sessionId};
    try {await assignMentee(csrf, data.sessionId, mentee); return {notice: `Session created, paused and assigned to ${mentee.name ?? mentee.discordId}.`, created: data.sessionId};}
    catch (reason) {return {notice: `Session created and paused, but it could not be assigned: ${(reason as Error).message}`, created: data.sessionId};}
  });
  const assign = (value: Mentee | null) => run(async () => {
    const data = await assignMentee(csrf, subject!.id, value);
    return {notice: value ? `Assigned to ${value.name ?? value.discordId}. They will see it in Your sweatbox.` : "Assignment removed.", updated: data.session};
  });
  const end = (withFeedback?: string) => run(async () => {
    await archiveSession(csrf, subject!.id, withFeedback);
    return {notice: withFeedback ? "Feedback saved. The session moved to Replays." : "Session moved to Replays.", ended: subject!.id};
  });
  const who = subject ? subject.assignedMenteeName || subject.menteeName || "" : "";
  const failure = error ? <p role="alert" className={staff.error}>{error}</p> : null;
  return <>
    {kind === "new" ? <form onSubmit={event => {event.preventDefault(); void create();}}>
      <h2>Start a session</h2>
      {scenarios.length ? <label>Published scenario<select value={chosen?.id} onChange={event => setScenarioId(event.target.value)}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.draft.title} · {s.ownerName || s.ownerId} · Revision {s.publishedRevision}</option>)}</select></label>
        : <p>No published scenarios yet. <Link href="/sweatbox/scenarios">Open Scenarios →</Link></p>}
      {scenarios.length && canAssign ? <fieldset className={staff.pickerFieldset}><legend>Mentee <span>(optional)</span></legend><MenteePicker value={mentee} onChange={setMentee} disabled={busy}/></fieldset> : null}
      {chosen ? <p className={staff.airport}>{environmentLabel(chosen.published ?? chosen.draft)} · Starts paused</p> : null}
      {failure}
      <div className={staff.dialogActions}><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className={staff.primary} disabled={busy || !scenarios.length}>{busy ? "Creating…" : "Create session"}</button></div>
    </form> : kind === "assign" && subject ? <form onSubmit={event => {event.preventDefault(); void assign(mentee);}}>
      <h2>Assign Mentee</h2><p>{subject.title} · {subject.airport ?? "EGPH"}</p>
      <MenteePicker value={mentee} onChange={setMentee} disabled={busy}/>
      {mentee ? <p className={staff.assignNote}>{mentee.name ?? mentee.discordId} will see this session in Your sweatbox and get a Discord message. Only they can take the Mentee seat while it is assigned{subject.menteeOccupied && subject.assignedMenteeId !== mentee.discordId ? ". Whoever holds the Mentee seat now will be disconnected" : ""}.</p> : null}
      {failure}
      <div className={staff.dialogActions}>{subject.assignedMenteeId ? <button type="button" className={staff.danger} disabled={busy} onClick={() => void assign(null)}>Remove assignment</button> : null}<button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className={staff.primary} disabled={busy || !mentee || mentee.discordId === subject.assignedMenteeId}>{busy ? "Saving…" : mentee ? `Assign ${mentee.name ?? "Mentee"}` : "Assign"}</button></div>
    </form> : kind === "end" && subject ? subject.hasFeedback ? <>
      <h2>Archive “{subject.title}”?</h2>
      <p>The session closes for good. Its recording and your feedback are saved in Replays.</p>
      {failure}
      <div className={staff.dialogActions}><button autoFocus disabled={busy} onClick={onClose}>Keep session</button><button className={staff.danger} disabled={busy} onClick={() => void end()}>{busy ? "Archiving…" : "Archive session"}</button></div>
    </> : skipping ? <form onSubmit={event => {event.preventDefault(); if (sure) void end();}}>
      <h2>Archive without feedback?</h2>
      <p>{who || "The Mentee"} will see this replay with no feedback from you. Feedback can’t be added once the session is archived.</p>
      <label className={ui.confirm}><input type="checkbox" checked={sure} disabled={busy} onChange={event => setSure(event.target.checked)}/>I’m sure. Archive without feedback.</label>
      {failure}
      <div className={staff.dialogActions}><button type="button" disabled={busy} onClick={() => {setSkipping(false); setSure(false); setError("");}}>Write feedback</button><button className={staff.danger} disabled={busy || !sure}>{busy ? "Archiving…" : "Archive without feedback"}</button></div>
    </form> : <form onSubmit={event => {event.preventDefault(); if (feedback.trim()) void end(feedback.trim());}}>
      <h2>Archive “{subject.title}”?</h2>
      <p>The session closes for good and its recording is saved to Replays.</p>
      <p className={ui.dialogNote}><Warning size={18} aria-hidden="true"/><span><strong>You haven’t left feedback{who ? ` for ${who}` : ""} yet.</strong> Write it now so {who || "your Mentee"} can read it with the replay. You can’t add it after archiving.</span></p>
      <label className={ui.dialogField}>Feedback{who ? ` for ${who}` : ""}
        <textarea autoFocus rows={6} maxLength={6000} value={feedback} disabled={busy} onChange={event => setFeedback(event.target.value)} placeholder="What went well, and what to work on next time"/>
        <small>{who || "The Mentee"} sees this in Your replays, next to the recording.</small>
      </label>
      {failure}
      <div className={`${staff.dialogActions} ${ui.dialogSpread}`}><button type="button" className={ui.dialogLink} disabled={busy} onClick={() => {setSkipping(true); setError("");}}>Archive without feedback</button><span/><button type="button" disabled={busy} onClick={onClose}>Keep session</button><button className={staff.primary} disabled={busy || !feedback.trim()}>{busy ? "Archiving…" : "Save feedback and archive"}</button></div>
    </form> : null}
  </>;
}
