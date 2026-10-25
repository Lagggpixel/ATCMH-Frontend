"use client";
import {environmentLabel} from "./airports";
import TrainerNotice from "./TrainerNotice";
import {modeLabel} from "./session-status";
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
import ui from "./Sweatbox.module.css";
import cards from "./ScenarioCards.module.css";

export const trainingRequest = (csrf: string, resource: string, value: object) => fetch(`/api/simulator/training/${resource}`, {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrf}, body: JSON.stringify(value)}).then(sessionJson);
export function TrainingNav({active}: {active?: "sessions" | "scenarios" | "replays"}) {
  return <nav className={styles.nav} aria-label="Sweatbox library">{([
    ["sessions", "/sweatbox", "Sessions"], ["scenarios", "/sweatbox/scenarios", "Scenarios"],
    ["replays", "/sweatbox/replays", "Replays"],
  ] as const).map(([key, href, label]) => <Link data-simulator-tour={`${key}-tab`} key={key} href={href} aria-current={key === active ? "page" : undefined}>{label}</Link>)}</nav>;
}
export default function TrainingLibrary() {
  return <LearningFrame product="Sweatbox"><SessionAccess embedded role="staff" returnTo="/sweatbox/scenarios">{(csrf, accountId) => <Library csrf={csrf} accountId={accountId}/>}</SessionAccess></LearningFrame>;
}
function Library({csrf, accountId}: {csrf: string; accountId: string}) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [mine, setMine] = useState(false), [search, setSearch] = useState("");
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
  const author = (s: ScenarioRecord) => s.ownerId === accountId ? "you" : s.ownerName || s.ownerId || "Unknown";
  // Published scenarios first, newest first within each.
  const filtered = scenarios.filter(s => (!mine || s.ownerId === accountId)
    && `${s.draft.title} ${s.draft.airport || "EGPH"} ${modeLabel(s.draft)} ${s.ownerName || s.ownerId} ${environmentLabel(s.draft)}`.toLowerCase().includes(query))
    .sort((a, b) => Number(b.publishedRevision > 0) - Number(a.publishedRevision > 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return <div className={ui.page}>
    <main className={ui.content}>
      <div className={ui.heading}><h1>Scenarios</h1><Link className={`${ui.btn} ${ui.primary}`} href="/sweatbox/scenarios/new">Write a scenario</Link></div>
      <div className={ui.toolbar}>
        <div className={ui.seg} role="group" aria-label="Author"><button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>Everyone</button><button type="button" aria-pressed={mine} onClick={() => setMine(true)}>Mine</button></div>
        <label className={`${ui.field} ${ui.grow}`}><span className={ui.srOnly}>Search scenarios</span><MagnifyingGlass size={18} aria-hidden="true"/><input type="search" placeholder="Search by name, airport or Mentor" value={search} onChange={event => setSearch(event.target.value)}/></label>
      </div>
      {error ? <div role="alert" className={ui.error}>{error}<button type="button" className={ui.btn} disabled={busy} onClick={() => {setLoading(true); setError(""); setRetry(value => value + 1);}}>Try again</button></div> : null}
      {loading ? <p role="status" className={ui.status}>Loading scenarios…</p> : filtered.length ? <section aria-label="Scenarios" className={ui.list}>{filtered.map(s => {
        const published = s.publishedRevision > 0, editable = s.canEdit !== false;
        return <div key={s.id} className={ui.item}>
          <div className={ui.itemRow}>
            <div className={ui.itemMain}>
              <Link href={`/sweatbox/scenarios/${s.id}`}>{s.draft.title}{published ? null : <span className={ui.draft}>Draft</span>}</Link>
              <small>{s.draft.airport || "EGPH"} · {modeLabel(s.draft)} · {s.draft.aircraft.length} aircraft · by {author(s)}</small>
            </div>
            <Link className={`${ui.btn} ${ui.quiet}`} href={`/sweatbox/scenarios/${s.id}`}>{editable ? "Edit" : "View"}<span className={ui.srOnly}> {s.draft.title}</span></Link>
            {published ? <button type="button" className={ui.btn} disabled={busy} onClick={() => void run(`scenarios/${s.id}`, {action: "launch", revision: s.publishedRevision}, data => router.push(`/sweatbox?session=${data.sessionId}`))}>Start session<span className={ui.srOnly}> from {s.draft.title}</span></button>
              : <button type="button" className={ui.btn} disabled title="Publish this scenario in the editor to start sessions from it">Publish to start</button>}
            <RowActions title={s.draft.title}><button disabled={busy} onClick={() => void run("scenarios", {draft: {...s.draft, title: `${s.draft.title.slice(0, 70)} (copy)`}}, data => router.push(`/sweatbox/scenarios/${data.scenario.id}`))}>Duplicate</button></RowActions>
          </div>
        </div>;
      })}</section> : !error ? <section className={ui.emptyCard}><h2>{scenarios.length ? "No matching scenarios" : "No scenarios yet"}</h2><p>{scenarios.length ? "Try another search, or show everyone’s scenarios." : "Write a scenario to prepare your next session."}</p>{scenarios.length ? <button type="button" className={ui.btn} onClick={() => {setSearch(""); setMine(false);}}>Clear filters</button> : <Link className={`${ui.btn} ${ui.primary}`} href="/sweatbox/scenarios/new">Write a scenario</Link>}</section> : null}
      <p className={ui.meta}>Writing and editing scenarios needs a computer, or a tablet in landscape.</p>
    </main>
    <footer className={ui.footer}><TrainerNotice/></footer>
  </div>;
}

/** The ⋯ menu on a scenario row. */
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
  return <div ref={root} className={cards.menu}><button ref={trigger} type="button" className={`${ui.btn} ${ui.icon} ${ui.quiet}`} aria-label={`More for ${title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><DotsThree size={24} aria-hidden="true"/></button>{open ? <div id={id} className={cards.popover} onClick={event => {if (event.target instanceof Element && event.target.closest("a,button")) {setOpen(false); trigger.current?.focus();}}}>{children}</div> : null}</div>;
}
