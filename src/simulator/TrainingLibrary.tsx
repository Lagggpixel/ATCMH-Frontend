"use client";
import {environmentLabel, trainingMode} from "./airports";
import TrainerNotice from "./TrainerNotice";
import {modeLabel} from "./session-status";
import {useEffect, useId, useRef, useState, type ReactNode} from "react";
import {MagnifyingGlass} from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import {Plus} from "@phosphor-icons/react/dist/csr/Plus";
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
    ["sessions", "/sweatbox/staff", "Sessions"], ["scenarios", "/sweatbox/scenarios", "Scenarios"],
    ["replays", "/sweatbox/replays", "Replays"],
  ] as const).map(([key, href, label]) => <Link data-simulator-tour={`${key}-tab`} key={key} href={href} aria-current={key === active ? "page" : undefined}>{label}</Link>)}</nav>;
}
export default function TrainingLibrary() {
  return <LearningFrame product="Sweatbox"><SessionAccess embedded role="staff" returnTo="/sweatbox/scenarios">{(csrf, accountId) => <Library csrf={csrf} accountId={accountId}/>}</SessionAccess></LearningFrame>;
}
const positions = [["", "All positions"], ["local", "Ground & Tower"], ["approach", "Approach"], ["center", "Center"]] as const;
const updated = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"});
function Library({csrf, accountId}: {csrf: string; accountId: string}) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [tab, setTab] = useState<"all" | "published" | "drafts">("all"), [mine, setMine] = useState(false), [search, setSearch] = useState("");
  const [airport, setAirport] = useState(""), [position, setPosition] = useState("");
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
  const airports = [...new Set(scenarios.map(s => s.draft.airport || "EGPH"))].sort();
  const scoped = scenarios.filter(s => (!mine || s.ownerId === accountId) && (!airport || (s.draft.airport || "EGPH") === airport) && (!position || trainingMode(s.draft) === position)
    && `${s.draft.title} ${s.ownerName || s.ownerId} ${environmentLabel(s.draft)}`.toLowerCase().includes(query));
  const counts = {all: scoped.length, published: scoped.filter(s => s.publishedRevision > 0).length, drafts: scoped.filter(s => !s.publishedRevision).length};
  const filtered = scoped.filter(s => tab === "all" || (tab === "published" ? s.publishedRevision > 0 : !s.publishedRevision));
  const clear = () => {setSearch(""); setTab("all"); setMine(false); setAirport(""); setPosition("");};
  return <div className={ui.page}>
    <main className={ui.content}>
      <div className={ui.heading}><div><h1>Scenarios</h1><p className={ui.hint}>Writing and editing scenarios needs a computer, or a tablet in landscape.</p></div><Link className={`${ui.btn} ${ui.primary}`} href="/sweatbox/scenarios/new"><Plus size={18} weight="bold" aria-hidden="true"/>Write a scenario</Link></div>
      <div className={ui.toolbar}>
        <div className={ui.seg} role="group" aria-label="Scenario status">{([["all", "All"], ["published", "Published"], ["drafts", "Drafts"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{label} <span>{loading ? "" : counts[value]}</span></button>)}</div>
        <div className={ui.seg} role="group" aria-label="Author"><button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>Everyone</button><button type="button" aria-pressed={mine} onClick={() => setMine(true)}>Mine</button></div>
        <label className={`${ui.field} ${ui.grow}`}><span className={ui.srOnly}>Search scenarios</span><MagnifyingGlass size={18} aria-hidden="true"/><input type="search" placeholder="Name, airport or Mentor" value={search} onChange={event => setSearch(event.target.value)}/></label>
        <label className={ui.field}><span className={ui.srOnly}>Airport</span><select value={airport} onChange={event => setAirport(event.target.value)}><option value="">All airports</option>{airports.map(code => <option key={code}>{code}</option>)}</select></label>
        <label className={ui.field}><span className={ui.srOnly}>Position</span><select value={position} onChange={event => setPosition(event.target.value)}>{positions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {error ? <div role="alert" className={ui.error}>{error}<button type="button" className={ui.btn} disabled={busy} onClick={() => {setLoading(true); setError(""); setRetry(value => value + 1);}}>Try again</button></div> : null}
      {loading ? <p role="status" className={ui.status}>Loading scenario library…</p> : filtered.length ? <section aria-label="Scenarios" className={cards.grid}>{filtered.map(s => {
        const published = s.publishedRevision > 0, editable = s.canEdit !== false;
        return <article key={s.id} className={ui.card}>
          <div className={cards.cardTop}><span className={`${ui.mono} ${cards.badge}`}>{s.draft.airport || "EGPH"}</span><span className={cards.position}>{modeLabel(s.draft)}</span><span className={`${ui.pill} ${published ? ui.live : ui.wait}`}>{published ? `Published · r${s.publishedRevision}` : "Draft"}</span></div>
          <div className={cards.cardBody}><h2><Link href={`/sweatbox/scenarios/${s.id}`}>{s.draft.title}</Link></h2><p>{s.draft.aircraft.length} aircraft · {s.draft.events.length} {s.draft.events.length === 1 ? "event" : "events"}</p></div>
          <p className={cards.byline}>By {s.ownerId === accountId ? "you" : s.ownerName || s.ownerId || "Unknown"}{s.updatedAt ? <> · <time dateTime={new Date(s.updatedAt).toISOString()}>Updated {updated.format(s.updatedAt)}</time></> : null}</p>
          <div className={cards.cardActions}>
            {published ? <button type="button" className={`${ui.btn} ${ui.primary}`} disabled={busy} onClick={() => void run(`scenarios/${s.id}`, {action: "launch", revision: s.publishedRevision}, data => router.push(`/sweatbox/staff?session=${data.sessionId}`))}>Start session<span className={ui.srOnly}> from {s.draft.title}</span></button>
              : <Link className={ui.btn} href={`/sweatbox/scenarios/${s.id}`}>{editable ? "Edit to publish" : "View draft"}<span className={ui.srOnly}> {s.draft.title}</span></Link>}
            {published ? <Link className={ui.btn} href={`/sweatbox/scenarios/${s.id}`}>{editable ? "Edit" : "View"}<span className={ui.srOnly}> {s.draft.title}</span></Link> : null}
            <RowActions title={s.draft.title}><Link href={`/sweatbox/scenarios/${s.id}`}>{editable ? "Edit scenario" : "View scenario"}</Link><button disabled={busy} onClick={() => void run("scenarios", {draft: {...s.draft, title: `${s.draft.title.slice(0, 70)} (copy)`}}, data => router.push(`/sweatbox/scenarios/${data.scenario.id}`))}>Duplicate</button></RowActions>
          </div>
        </article>;
      })}</section> : !error ? <section className={ui.emptyCard} style={{textAlign: "center"}}><h2>{scenarios.length ? "No matching scenarios" : "No scenarios yet"}</h2><p>{scenarios.length ? "Try a different name, airport, position or author." : "Write a scenario to prepare your next session."}</p>{scenarios.length ? <button type="button" className={ui.btn} onClick={clear}>Clear filters</button> : <Link className={`${ui.btn} ${ui.primary}`} href="/sweatbox/scenarios/new">Write a scenario</Link>}</section> : null}
    </main>
    <footer className={ui.footer}><TrainerNotice/></footer>
  </div>;
}

/** The ⋯ menu on a scenario card. */
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
  return <div ref={root} className={cards.menu}><button ref={trigger} type="button" className={`${ui.btn} ${ui.icon}`} aria-label={`More for ${title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><DotsThree size={24} aria-hidden="true"/></button>{open ? <div id={id} className={cards.popover} onClick={event => {if (event.target instanceof Element && event.target.closest("a,button")) {setOpen(false); trigger.current?.focus();}}}>{children}</div> : null}</div>;
}
