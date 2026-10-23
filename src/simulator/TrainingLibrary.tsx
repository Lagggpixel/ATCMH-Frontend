"use client";
import {environmentLabel} from "./airports";
import LibraryFooter from "./LibraryFooter";
import {useEffect, useId, useRef, useState, type ReactNode} from "react";
import {MagnifyingGlass} from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import {DotsThree} from "@phosphor-icons/react/dist/csr/DotsThree";
import Link from "next/link";
import {useRouter} from "next/navigation";
import SessionAccess from "./SessionAccess";
import LearningFrame from "../learning/LearningFrame";
import {sessionJson} from "./shared-transport";
import type {ScenarioRecord} from "./scenarios";
import styles from "./LibraryPages.module.css";
import table from "./ScenarioLibrary.module.css";

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
  const [tab, setTab] = useState<"all" | "published" | "drafts">("all"), [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/simulator/training/scenarios", {signal: controller.signal, cache: "no-store"}).then(sessionJson)
      .then(value => {if (!controller.signal.aborted) setScenarios(value.scenarios);})
      .catch(reason => {if (!controller.signal.aborted) setError(reason.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [retry]);
  const run = async (resource: string, value: object, follow?: (data: Awaited<ReturnType<typeof sessionJson>>) => void) => {
    setBusy(true); setError("");
    try {const data = await trainingRequest(csrf, resource, value); follow?.(data);}
    catch (reason) {setError((reason as Error).message);} finally {setBusy(false);}
  };
  const query = search.trim().toLowerCase();
  const tabs = [["all", "All scenarios"], ["published", "Published"], ["drafts", "Drafts"]] as const;
  const filtered = scenarios.filter(s => (tab === "all" || (tab === "published" ? s.publishedRevision > 0 : !s.publishedRevision)) && `${s.draft.title} ${s.ownerName || s.ownerId} ${environmentLabel(s.draft)}`.toLowerCase().includes(query));
  return <main className={`${styles.library} ${styles.workspaceLibrary} ${table.workspace}`}>
    <div className={`${styles.libraryContent} ${table.content}`}><div className={`${styles.heading} ${table.heading}`}><h1>Scenarios</h1><Link className={styles.primary} href="/sweatbox/scenarios/new">New scenario</Link></div>
    <p className={table.editorHint}>Creating and editing scenarios requires a computer or a tablet in landscape.</p>
    <div role="tablist" aria-label="Scenario library" className={table.tabs} onKeyDown={event => {
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')], current = buttons.indexOf(event.target as HTMLButtonElement);
      if (current < 0) return;
      const next = event.key === "ArrowRight" ? (current + 1) % tabs.length : event.key === "ArrowLeft" ? (current + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined;
      if (next !== undefined) {event.preventDefault(); setTab(tabs[next][0]); buttons[next].focus();}
    }}>{tabs.map(([value, label]) => <button key={value} type="button" role="tab" id={`scenario-${value}-tab`} aria-controls="scenario-panel" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>{label}</button>)}</div>
    <div role="tabpanel" id="scenario-panel" aria-labelledby={`scenario-${tab}-tab`} tabIndex={0}>
      <div className={table.toolbar}><label className={table.search}><MagnifyingGlass size={22} aria-hidden="true"/><span className={table.srOnly}>Search scenarios</span><input type="search" placeholder="Name, airport or trainer" value={search} onChange={event => setSearch(event.target.value)}/></label>{!loading ? <span role="status" className={table.count}>{filtered.length} {filtered.length === 1 ? "scenario" : "scenarios"}</span> : null}</div>
      {error ? <div role="alert" className={styles.error}><p>{error}</p><button disabled={busy} onClick={() => {setLoading(true); setError(""); setRetry(value => value + 1);}}>Try again</button></div> : null}
      {loading ? <p role="status">Loading scenario library…</p> : filtered.length ? <div className={table.list}>{filtered.map(s => <article key={s.id}>
        <span className={table.airport}>{s.draft.airport || "EGPH"}</span>
        <div className={table.copy}><h2><Link href={`/sweatbox/scenarios/${s.id}`}>{s.draft.title}</Link></h2><p>{environmentLabel(s.draft).split(" · ").slice(1).join(" · ")} · {s.draft.aircraft.length} aircraft · {s.draft.events.length} {s.draft.events.length === 1 ? "event" : "events"}</p></div>
        <div className={table.meta}><span>By {s.ownerName || s.ownerId || "Unknown"}</span><span className={s.publishedRevision ? table.published : undefined}>{s.publishedRevision ? `Published · r${s.publishedRevision}` : "Draft"}</span>{s.updatedAt ? <time dateTime={new Date(s.updatedAt).toISOString()}>Updated {new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"}).format(s.updatedAt)}</time> : null}</div>
        <div className={table.create}>{s.publishedRevision > 0 ? <button disabled={busy} aria-label={`Create session from ${s.draft.title}`} onClick={() => void run(`scenarios/${s.id}`, {action: "launch", revision: s.publishedRevision}, data => router.push(`/sweatbox/staff?session=${data.sessionId}`))}>Create session</button> : <Link href={`/sweatbox/scenarios/${s.id}`}>Edit scenario</Link>}</div>
        <RowActions title={s.draft.title}><Link href={`/sweatbox/scenarios/${s.id}`}>Edit scenario</Link><button disabled={busy} onClick={() => void run("scenarios", {draft: {...s.draft, title: `${s.draft.title.slice(0, 70)} (copy)`}}, data => router.push(`/sweatbox/scenarios/${data.scenario.id}`))}>Duplicate</button></RowActions>
      </article>)}</div> : !error ? <section className={table.empty}><h2>{scenarios.length ? "No matching scenarios" : "No scenarios yet"}</h2><p>{scenarios.length ? "Try a different name, airport or trainer." : "Create a scenario to prepare your next session."}</p>{scenarios.length ? <button onClick={() => {setSearch(""); setTab("all");}}>Clear filters</button> : <Link className={styles.primary} href="/sweatbox/scenarios/new">New scenario</Link>}</section> : null}
    </div>
    <LibraryFooter/></div>
  </main>;
}

function RowActions({title, children}: {title: string; children: ReactNode}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);};
    const escape = (event: KeyboardEvent) => {if (event.key === "Escape") {setOpen(false); trigger.current?.focus();}};
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside); document.addEventListener("keydown", escape);
    return () => {document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); document.removeEventListener("keydown", escape);};
  }, [open]);
  return <div ref={root} className={table.rowActions}><button ref={trigger} type="button" aria-label={`Actions for ${title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><DotsThree size={24} aria-hidden="true"/></button>{open ? <div id={id} className={table.popover} onClick={event => {if (event.target instanceof Element && event.target.closest("a,button")) {setOpen(false); trigger.current?.focus();}}}>{children}</div> : null}</div>;
}
