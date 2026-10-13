"use client";
import {environmentLabel} from "./airports";
import TrainerNotice from "./TrainerNotice";
import {useEffect, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import SessionAccess from "./SessionAccess";
import LearningFrame from "../learning/LearningFrame";
import {sessionJson} from "./shared-transport";
import {sessionPath} from "./sessions";
import {type ScenarioRecord, type AssignmentSummary, timeLabel} from "./scenarios";
import legacyStyles from "./Training.module.css";
import libraryStyles from "./LibraryPages.module.css";

export const trainingRequest = (csrf: string, resource: string, value: object) => fetch(`/api/simulator/training/${resource}`, {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrf}, body: JSON.stringify(value)}).then(sessionJson);
export function TrainingNav({mentee = false, active}: {mentee?: boolean; active?: "scenarios" | "assignments" | "replays"}) {
  return <nav className={active ? libraryStyles.nav : legacyStyles.nav} aria-label="Simulator library">{mentee ? <><Link href="/simulator/mentee">Join session</Link><Link href="/simulator/mentee/assignments">My assignments</Link></> : <><Link href="/simulator/staff">Sessions</Link>{(["scenarios", "assignments", "replays"] as const).map(page => <Link key={page} href={`/simulator/${page}`} aria-current={page === active ? "page" : undefined}>{page[0].toUpperCase() + page.slice(1)}</Link>)}</>}</nav>;
}
export default function TrainingLibrary({mode, mentee = false}: {mode: "scenarios" | "assignments"; mentee?: boolean}) {
  const path = mentee ? "/simulator/mentee/assignments" : `/simulator/${mode}`;
  const library = <SessionAccess embedded={!mentee} role={mentee ? "mentee" : "staff"} returnTo={path}>{csrf => <Library csrf={csrf} mode={mode} mentee={mentee}/>}</SessionAccess>;
  return mentee ? library : <LearningFrame product="Simulator">{library}</LearningFrame>;
}
function Library({csrf, mode, mentee}: {csrf: string; mode: "scenarios" | "assignments"; mentee: boolean}) {
  const styles = mentee ? legacyStyles : libraryStyles;
  const router = useRouter();
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]), [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [assigning, setAssigning] = useState(false);
  const [scenarioId, setScenarioId] = useState(""), [learnerId, setLearnerId] = useState(""), [maxAttempts, setMaxAttempts] = useState(3), [due, setDue] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const resources = mode === "scenarios" ? ["scenarios"] : mentee ? ["assignments"] : ["assignments?role=staff", "scenarios"];
    Promise.all(resources.map(resource => fetch(`/api/simulator/training/${resource}`, {signal: controller.signal, cache: "no-store"}).then(sessionJson)))
      .then(values => {for (const value of values) {if (value.scenarios) setScenarios(value.scenarios); if (value.assignments) setAssignments(value.assignments);}})
      .catch(reason => {if (!controller.signal.aborted) setError(reason.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [mode, mentee]);
  const run = async (resource: string, value: object, follow?: (data: Awaited<ReturnType<typeof sessionJson>>) => void) => {
    setBusy(true); setError("");
    try {const data = await trainingRequest(csrf, resource, value); follow?.(data);}
    catch (reason) {setError((reason as Error).message);} finally {setBusy(false);}
  };
  const published = scenarios.filter(s => s.publishedRevision > 0);
  return <main className={styles.library}>
    {mentee ? <><header className={legacyStyles.libraryHeader}><Link href="/">ATCMH / Simulator</Link><TrainingNav mentee/></header><TrainerNotice/></> : <TrainingNav active={mode}/>}
    <div className={styles.libraryContent}><div className={styles.heading}><div><p className={styles.eyebrow}>{mentee ? "Your training" : "Training workspace"}</p><h1>{mode === "scenarios" ? "Scenarios" : mentee ? "My assignments" : "Assignments"}</h1><p>{mode === "scenarios" ? "Shared with all simulator staff. Build, edit and reuse exercises together." : mentee ? "Read your briefing and resume the exercise your mentor has started." : "Shared staff assignments. Assign a published scenario and follow each mentee’s attempts."}</p></div>{!mentee ? mode === "scenarios" ? <Link className={styles.primary} href="/simulator/scenarios/new">New scenario</Link> : <button className={styles.primary} onClick={() => setAssigning(!assigning)} disabled={loading || !published.length}>New assignment</button> : null}</div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {assigning ? <form className={styles.assignmentForm} onSubmit={e => {e.preventDefault(); const selected = published.find(s => s.id === scenarioId) ?? published[0]; if (selected) void run("assignments", {scenarioId: selected.id, revision: selected.publishedRevision, learnerId, maxAttempts, dueAt: due ? Date.parse(`${due}T23:59:59Z`) : null}, () => window.location.reload());}}><h2>New assignment</h2><label>Published scenario<select value={scenarioId || published[0]?.id} onChange={e => setScenarioId(e.target.value)}>{published.map(s => <option key={s.id} value={s.id}>{s.draft.title} · {s.ownerName || s.ownerId} · Revision {s.publishedRevision}</option>)}</select></label><label>Mentee account / Discord ID<input required pattern="[0-9]{5,32}" value={learnerId} onChange={e => setLearnerId(e.target.value)} placeholder="Mentee’s Discord user ID"/></label><label>Attempts allowed<input type="number" required min={1} max={20} value={maxAttempts} onChange={e => setMaxAttempts(Number(e.target.value))}/></label><label>Due date (end of day UTC, optional)<input type="date" value={due} onChange={e => setDue(e.target.value)}/></label><div className={styles.actions}><button type="button" onClick={() => setAssigning(false)}>Cancel</button><button className={styles.primary} disabled={busy}>Assign scenario</button></div></form> : null}
    {loading ? <p role="status">Loading training…</p> : mode === "scenarios" ? scenarios.length ? <div className={styles.rows}>{scenarios.map(s => <article key={s.id}><div><Link href={`/simulator/scenarios/${s.id}`}><h2>{s.draft.title}</h2></Link><p>Created by {s.ownerName || s.ownerId}</p><p>{environmentLabel(s.draft)} · {s.draft.aircraft.length} aircraft · {s.draft.events.length} {s.draft.events.length === 1 ? "event" : "events"}</p><small className={!mentee ? libraryStyles.status : undefined}>{s.publishedRevision ? `Published revision ${s.publishedRevision} · Editable draft` : "Draft · Not published"}</small></div><div className={styles.actions}><button disabled={busy} onClick={() => void run("scenarios", {draft: {...s.draft, title: `${s.draft.title.slice(0, 70)} (copy)`}}, data => router.push(`/simulator/scenarios/${data.scenario.id}`))}>Duplicate</button><Link href={`/simulator/scenarios/${s.id}`}>Edit scenario</Link>{s.publishedRevision > 0 ? <button className={styles.primary} disabled={busy} onClick={() => void run(`scenarios/${s.id}`, {action: "launch", revision: s.publishedRevision}, data => router.push(`/simulator/staff?session=${data.sessionId}`))}>Create session</button> : null}</div></article>)}</div> : <section className={styles.empty}><h2>No scenarios yet</h2><p>Create a scenario, place your traffic and schedule its first pilot requests.</p></section> : assignments.length ? <div className={styles.rows}>{assignments.map(a => {
      const active = a.attempts.find(t => t.status === "active"), latest = a.attempts.at(-1);
      return <article key={a.id}><div><h2>{a.title}</h2><p>{environmentLabel(a)}</p><p>{mentee ? `Assigned by ${a.ownerName || a.ownerId}` : `Mentee ${a.learnerId} · Assigned by ${a.ownerName || a.ownerId}`} · Revision {a.revision} · {a.attempts.length}/{a.maxAttempts} attempts</p>{a.dueAt ? <small>Due {new Date(a.dueAt).toISOString().slice(0, 10)} UTC</small> : null}<details><summary>Briefing & attempt history</summary><p className={styles.briefing}>{a.briefing || "Your mentor will brief you before Start."}</p>{a.attempts.map(t => <p key={t.id}>{new Date(t.startedAt).toISOString().slice(0, 16).replace("T", " ")} UTC · {t.status} · {timeLabel(t.elapsed)}{t.feedback ? <span className={styles.feedback}>{t.feedback}</span> : null}{!mentee && t.status !== "active" ? <> · <Link href={`/simulator/replays/${t.id}`}>Review attempt</Link></> : null}</p>)}</details><small className={!mentee ? libraryStyles.status : undefined}>{active ? "Exercise ready to join" : latest?.status === "finished" ? "Reviewed / finished" : latest ? "Previous attempt ended" : "Not started"}</small></div><div className={styles.actions}>{active ? <Link className={styles.primary} href={sessionPath(mentee ? "mentee" : "staff", active.sessionId)}>Resume exercise</Link> : mentee ? <span className={styles.muted}>Waiting for your mentor</span> : <button className={styles.primary} disabled={busy || a.attempts.length >= a.maxAttempts} onClick={() => void run(`assignments/${a.id}`, {}, data => router.push(`/simulator/staff?session=${data.sessionId}`))}>Start attempt</button>}</div></article>;
    })}</div> : <section className={styles.empty}><h2>No assignments yet</h2><p>{mentee ? "Your assigned exercises will appear here." : published.length ? "Choose New assignment to give a published scenario to a mentee." : "Publish a scenario before creating an assignment."}</p></section>}
    <footer className={styles.libraryFooter}>{!mentee ? <TrainerNotice/> : null}<p>One mentor and one mentee per exercise. Scenario revisions and previous attempts stay saved.</p></footer></div>
  </main>;
}
