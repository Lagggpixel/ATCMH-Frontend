"use client";
import {useEffect, useMemo, useRef, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {Plus} from "@phosphor-icons/react/dist/csr/Plus";
import {MagnifyingGlass} from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import {ArrowRight} from "@phosphor-icons/react/dist/csr/ArrowRight";
import {ShareNetwork} from "@phosphor-icons/react/dist/csr/ShareNetwork";
import {CaretRight} from "@phosphor-icons/react/dist/csr/CaretRight";
import {Play} from "@phosphor-icons/react/dist/csr/Play";
import LearningFrame from "../learning/LearningFrame";
import {usePortalAuth} from "../platform/auth/PortalAuthProvider";
import {canAccessStaffSimulator} from "./feature";
import SessionAccess, {SessionNotice} from "./SessionAccess";
import SessionDialogs, {type SessionDialogState} from "./SessionDialogs";
import {previewSession} from "./SessionEntry";
import {LearnCard} from "./StaffTutorial";
import TrainerNotice from "./TrainerNotice";
import {sessionLibrary} from "./session-library";
import {sessionJson} from "./shared-transport";
import {greeting, initials, isActive, lastActive, matchesFilter, menteeName, menteeState, mentorName, modeLabel, sessionFilters, sessionStatus, viewerName, type SessionFilter} from "./session-status";
import {sessionCode, sessionPath, type SessionSummary} from "./sessions";
import type {ScenarioRecord} from "./scenarios";
import type {ReplaySummary} from "./replays";
import ui from "./Sweatbox.module.css";

const tone = {live: ui.live, wait: ui.wait, idle: ui.idle};
const replayDate = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", timeZone: "UTC"});

/** /sweatbox: a Mentor's home. Anyone without Sweatbox access goes to Your sweatbox. */
export default function MentorHome() {
  const auth = usePortalAuth(), router = useRouter();
  const mentee = !auth.loading && !!auth.session && !auth.error && !canAccessStaffSimulator(auth.adminUser);
  useEffect(() => {if (mentee) router.replace("/sweatbox/mentee");}, [mentee, router]);
  return <LearningFrame product="Sweatbox">{mentee ? <SessionNotice embedded title="Opening Your sweatbox…"/> :
    <SessionAccess embedded role="staff" returnTo="/sweatbox">{(csrf, accountId, access) => <Home key={accountId} csrf={csrf} accountId={accountId} canAssign={access.canAssign} name={viewerName(auth)}/>}</SessionAccess>}
  </LearningFrame>;
}

function Home({csrf, accountId, canAssign, name}: {csrf: string; accountId: string; canAssign: boolean; name: string}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]), [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [replays, setReplays] = useState<ReplaySummary[] | null>(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<SessionFilter>("all"), [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<SessionDialogState>(null), [now, setNow] = useState(() => Date.now());
  const library = useRef<ReturnType<typeof sessionLibrary> | null>(null);
  useEffect(() => {
    const sync = sessionLibrary((data, definitions) => {setSessions(data); setScenarios(definitions); setLoading(false); setNow(Date.now());}, message => {setLoadError(message); setLoading(false);});
    library.current = sync; void sync.refresh();
    return () => {sync.stop(); library.current = null;};
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/simulator/replays?scope=mine", {cache: "no-store", signal: controller.signal}).then(sessionJson)
      .then(data => setReplays((data.replays as ReplaySummary[]).slice(0, 3))).catch(() => {if (!controller.signal.aborted) setReplays([]);});
    return () => controller.abort();
  }, []);
  const live = sessions.filter(isActive);
  const query = search.trim().toLowerCase();
  const counts = useMemo(() => Object.fromEntries(sessionFilters.map(([key]) => [key, sessions.filter(s => matchesFilter(s, key, accountId)).length])), [sessions, accountId]);
  const listed = sessions.filter(s => matchesFilter(s, filter, accountId) && `${s.title} ${s.airport ?? "EGPH"} ${sessionCode(s.id, s.airport)} ${menteeName(s)}`.toLowerCase().includes(query));
  const quick = [...scenarios].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, 3);
  const share = async (session: SessionSummary) => {
    try {await navigator.clipboard.writeText(sessionCode(session.id, session.airport)); setNotice(`Session code ${sessionCode(session.id, session.airport)} copied.`);}
    catch {setNotice(`Copy this session code: ${sessionCode(session.id, session.airport)}`);}
  };
  return <div className={ui.page}>
    <main className={ui.content}>
      <div className={ui.heading}>
        <h1>{greeting(new Date().getHours())}{name ? `, ${name}` : ""}</h1>
        <div className={ui.headingActions}>
          <JoinWithCode/>
          <button type="button" data-simulator-tour="new-session" className={`${ui.btn} ${ui.primary}`} disabled={loading} onClick={() => setDialog({kind: "new"})}><Plus size={18} weight="bold" aria-hidden="true"/>Start a session</button>
        </div>
      </div>
      <LearnCard accountId={accountId}/>
      {loadError ? <p role="alert" className={ui.error}>Could not refresh sessions: {loadError}<button type="button" className={ui.btn} onClick={() => void library.current?.refresh()}>Try again</button></p> : null}
      <div className={ui.cols}>
        <div className={ui.stack}>
          <section aria-labelledby="live-heading">
            <h2 id="live-heading" className={ui.sectionTitle}>Happening now</h2>
            {loading ? <p role="status" className={ui.status}>Loading sessions…</p> : live.length ? <div className={ui.liveGrid}>{live.map(s => {
              const status = sessionStatus(s), mentee = menteeName(s);
              return <article key={s.id} className={ui.liveCard}>
                <div className={ui.liveTop}><div><h3>{s.title}</h3><p>{s.airport ?? "EGPH"} · {modeLabel(s)} · <span className={ui.mono}>{sessionCode(s.id, s.airport)}</span></p></div><span className={`${ui.pill} ${tone[status.tone]}`}><span className={ui.dot}/>{status.label}</span></div>
                <div className={ui.seats}>
                  <Person label="Mentor" name={s.staffOccupied ? `${mentorName(s)}${s.staffId === accountId ? " (you)" : ""}` : "Not here yet"} empty={!s.staffOccupied} initialsFor={s.staffOccupied ? mentorName(s) : ""}/>
                  <ArrowRight size={18} aria-hidden="true"/>
                  <Person label="Mentee" name={mentee || "Not assigned"} empty={!mentee} initialsFor={mentee}/>
                </div>
                <div className={ui.liveFoot}>
                  <span>{s.menteeOccupied && !s.staffOccupied ? `${mentee || "The Mentee"} is waiting` : `Last active ${lastActive(s.updatedAt, now).toLowerCase()}`}</span>
                  <button type="button" data-simulator-tour="mentee-sharing" className={`${ui.btn} ${ui.icon}`} aria-label={`Copy session code for ${s.title}`} title="Copy session code" onClick={() => void share(s)}><ShareNetwork size={20} aria-hidden="true"/></button>
                  <Link data-simulator-tour="staff-radar-link" className={`${ui.btn} ${ui.primary}`} href={sessionPath("staff", s.id)}>Enter<span className={ui.srOnly}> {s.title}</span></Link>
                </div>
              </article>;
            })}</div> : <div className={ui.emptyCard}><h3>Nobody is in a session right now</h3><p>Sessions appear here as soon as a Mentor or Mentee joins one.</p></div>}
          </section>
          <section aria-labelledby="all-heading" className={ui.panel} data-simulator-tour="session-library">
            <div className={ui.panelHead}>
              <h2 id="all-heading">All sessions</h2>
              <div className={ui.tabs} role="group" aria-label="Filter sessions" style={{flex: 1}}>{sessionFilters.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <span>{counts[key]}</span></button>)}</div>
              <label className={ui.field} style={{width: 240, maxWidth: "100%"}}><span className={ui.srOnly}>Search sessions</span><MagnifyingGlass size={18} aria-hidden="true"/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, airport or code"/></label>
            </div>
            {loading ? <p role="status" className={ui.status}>Loading sessions…</p> : listed.length ? listed.map(s => {
              const status = sessionStatus(s), mentee = menteeName(s);
              return <div key={s.id} className={ui.row}>
                <div className={ui.rowTitle}><Link href={`/sweatbox/staff?session=${s.id}`}>{s.title}</Link><small className={ui.mono}>{sessionCode(s.id, s.airport)}</small></div>
                <div className={`${ui.rowCell} ${ui.rowWide}`}><strong>{s.airport ?? "EGPH"}</strong><small>{modeLabel(s)}</small></div>
                <div className={`${ui.rowWide}`}><Person name={mentee || "Unassigned"} detail={menteeState(s)} empty={!mentee} initialsFor={mentee}/></div>
                <div className={`${ui.rowCell} ${ui.rowWide}`}><span className={`${ui.pill} ${tone[status.tone]}`}><span className={ui.dot}/>{status.label}</span><small>{lastActive(s.updatedAt, now)}</small></div>
                <div className={ui.rowActions}><Link className={ui.btn} href={sessionPath("staff", s.id)}>Enter<span className={ui.srOnly}> {s.title}</span></Link><Link className={`${ui.btn} ${ui.icon} ${ui.quiet}`} href={`/sweatbox/staff?session=${s.id}`} aria-label={`Manage ${s.title}`} title="Manage in Sessions"><CaretRight size={20} aria-hidden="true"/></Link></div>
              </div>;
            }) : <div className={ui.empty}><h3>{sessions.length ? "No matching sessions" : "No sessions yet"}</h3><p>{sessions.length ? "Try another filter or search." : "Start a session from one of your published scenarios."}</p>{sessions.length ? <button type="button" className={ui.btn} onClick={() => {setFilter("all"); setSearch("");}}>Clear filters</button> : null}</div>}
          </section>
        </div>
        <aside className={`${ui.aside} ${ui.asideAligned}`} aria-label="Shortcuts">
          <section aria-labelledby="quick-heading" className={ui.box}>
            <h2 id="quick-heading">Quick start</h2>
            <p>Your latest published scenarios.</p>
            {loading ? <p role="status">Loading…</p> : quick.length ? quick.map(c => <div key={c.id} className={ui.sideItem}><span><strong>{c.draft.title}</strong><small>{(c.published ?? c.draft).airport ?? "EGPH"} · {modeLabel(c.published ?? c.draft)} · Revision {c.publishedRevision}</small></span><button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => setDialog({kind: "new", scenarioId: c.id})}><Play size={14} weight="fill" aria-hidden="true"/>Start<span className={ui.srOnly}> {c.draft.title}</span></button></div>)
              : <p className={ui.sideItem}>Publish a scenario to start sessions from it.</p>}
            <div className={ui.sideLinks}><Link href="/sweatbox/scenarios">All scenarios →</Link><Link href="/sweatbox/scenarios/new">Write a scenario</Link></div>
          </section>
          <section aria-labelledby="replays-heading" className={ui.box}>
            <h2 id="replays-heading">Recent replays</h2>
            {replays === null ? <p role="status">Loading…</p> : replays.length ? replays.map(r => {
              const who = r.participants.filter(p => p.role === "mentee").map(p => p.name || p.accountId).join(", ");
              return <Link key={r.id} href={`/sweatbox/replays/${r.id}`} className={ui.sideItem}><span><strong>{r.title}</strong><small>{[who, replayDate.format(r.endedAt), `${Math.max(1, Math.round(r.duration / 60))} min`].filter(Boolean).join(" · ")}</small></span><CaretRight size={18} aria-hidden="true"/></Link>;
            }) : <p className={ui.sideItem}>Sessions you run appear here after they are archived.</p>}
            <div className={ui.sideLinks}><Link href="/sweatbox/replays">All replays →</Link></div>
          </section>
        </aside>
      </div>
    </main>
    <footer className={ui.footer}><TrainerNotice/></footer>
    {notice ? <div className={ui.notification}><p role="status">{notice}</p><button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div> : null}
    <SessionDialogs state={dialog} csrf={csrf} canAssign={canAssign} scenarios={scenarios} onClose={() => setDialog(null)} onBusy={busy => {if (busy) library.current?.invalidate();}}
      onDone={result => {setDialog(null); setNotice(result.notice); void library.current?.refresh();}}/>
  </div>;
}

export function Person({label, name, detail, empty, initialsFor}: {label?: string; name: string; detail?: string; empty?: boolean; initialsFor: string}) {
  return <div className={ui.person}><span className={`${ui.av} ${empty ? ui.avEmpty : ""}`} aria-hidden="true">{empty ? label ? "?" : "+" : initials(initialsFor)}</span><span>{label ? <small>{label}</small> : null}<strong>{name}</strong>{detail ? <small>{detail}</small> : null}</span></div>;
}

/** A Mentor joining by code takes the Mentor seat; the code only finds the session. */
function JoinWithCode() {
  const [value, setValue] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className={ui.toolbar} style={{flexWrap: "nowrap", alignItems: "flex-start"}} onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError("");
    try {window.location.assign(sessionPath("staff", (await previewSession(value)).id));}
    catch (reason) {setError((reason as Error).message); setBusy(false);}
  }}>
    <div style={{display: "grid", gap: 6}}>
      <label className={ui.field} style={{width: 280, maxWidth: "100%"}}><span className={ui.srOnly}>Session code or link</span><MagnifyingGlass size={18} aria-hidden="true"/><input className={ui.mono} value={value} onChange={event => setValue(event.target.value)} placeholder="Join with a code" autoCapitalize="characters" autoComplete="off" spellCheck={false} required disabled={busy} aria-invalid={!!error || undefined}/></label>
      {error ? <small role="alert" style={{color: "var(--dashboard-danger-text,#b42318)", fontSize: 13, maxWidth: 280}}>{error}</small> : null}
    </div>
    <button className={ui.btn} disabled={busy}>{busy ? "Checking…" : "Join"}</button>
  </form>;
}
