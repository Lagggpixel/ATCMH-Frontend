"use client";
import {environmentLabel} from "./airports";
import LibraryFooter from "./LibraryFooter";
import {useEffect, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import SessionAccess from "./SessionAccess";
import LearningFrame from "../learning/LearningFrame";
import {sessionJson} from "./shared-transport";
import type {ScenarioRecord} from "./scenarios";
import styles from "./LibraryPages.module.css";

export const trainingRequest = (csrf: string, resource: string, value: object) => fetch(`/api/simulator/training/${resource}`, {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrf}, body: JSON.stringify(value)}).then(sessionJson);
export function TrainingNav({active}: {active?: "sessions" | "scenarios" | "replays"}) {
  return <nav className={styles.nav} aria-label="Sweatbox library">{([
    ["sessions", "/sweatbox/staff", "Sessions"], ["scenarios", "/sweatbox/scenarios", "Scenarios"],
    ["replays", "/sweatbox/replays", "Replays"],
  ] as const).map(([key, href, label]) => <Link data-simulator-tour={`${key}-tab`} key={key} href={href} aria-current={key === active ? "page" : undefined}>{label}</Link>)}</nav>;
}
export default function TrainingLibrary() {
  return <LearningFrame product="Sweatbox"><SessionAccess embedded role="staff" returnTo="/sweatbox/scenarios">{csrf => <Library csrf={csrf}/>}</SessionAccess></LearningFrame>;
}
function Library({csrf}: {csrf: string}) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/simulator/training/scenarios", {signal: controller.signal, cache: "no-store"}).then(sessionJson)
      .then(value => setScenarios(value.scenarios))
      .catch(reason => {if (!controller.signal.aborted) setError(reason.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, []);
  const run = async (resource: string, value: object, follow?: (data: Awaited<ReturnType<typeof sessionJson>>) => void) => {
    setBusy(true); setError("");
    try {const data = await trainingRequest(csrf, resource, value); follow?.(data);}
    catch (reason) {setError((reason as Error).message);} finally {setBusy(false);}
  };
  return <main className={styles.library}>
    <TrainingNav active="scenarios"/>
    <div className={styles.libraryContent}><div className={styles.heading}><div><h1>Scenarios</h1></div><Link className={styles.primary} href="/sweatbox/scenarios/new">New scenario</Link></div>
    <p className={styles.editorHint}>Creating and editing scenarios requires a computer or a tablet in landscape.</p>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {loading ? <p role="status">Loading training…</p> : scenarios.length ? <div className={styles.rows}>{scenarios.map(s => <article key={s.id}><div><Link href={`/sweatbox/scenarios/${s.id}`}><h2>{s.draft.title}</h2></Link><p>Created by {s.ownerName || s.ownerId}</p><p>{environmentLabel(s.draft)} · {s.draft.aircraft.length} aircraft · {s.draft.events.length} {s.draft.events.length === 1 ? "event" : "events"}</p><small className={styles.status}>{s.publishedRevision ? `Published revision ${s.publishedRevision} · Editable draft` : "Draft · Not published"}</small></div><div className={styles.actions}><button disabled={busy} onClick={() => void run("scenarios", {draft: {...s.draft, title: `${s.draft.title.slice(0, 70)} (copy)`}}, data => router.push(`/sweatbox/scenarios/${data.scenario.id}`))}>Duplicate</button><Link href={`/sweatbox/scenarios/${s.id}`}>Edit scenario</Link>{s.publishedRevision > 0 ? <button className={styles.primary} disabled={busy} onClick={() => void run(`scenarios/${s.id}`, {action: "launch", revision: s.publishedRevision}, data => router.push(`/sweatbox/staff?session=${data.sessionId}`))}>Create session</button> : null}</div></article>)}</div> : <section className={styles.empty}><h2>No scenarios yet</h2></section>}
    <LibraryFooter/></div>
  </main>;
}
