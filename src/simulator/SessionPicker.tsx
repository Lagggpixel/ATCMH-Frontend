"use client";
import {useEffect, useMemo, useRef, useState} from "react";
import Link from "next/link";
import {Plus} from "@phosphor-icons/react/dist/csr/Plus";
import {MagnifyingGlass} from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import {CaretRight} from "@phosphor-icons/react/dist/csr/CaretRight";
import {LinkSimple} from "@phosphor-icons/react/dist/csr/LinkSimple";
import {UserPlus} from "@phosphor-icons/react/dist/csr/UserPlus";
import LearningFrame from "../learning/LearningFrame";
import SessionAccess from "./SessionAccess";
import SessionDialogs, {type SessionDialogState} from "./SessionDialogs";
import StaffTutorial from "./StaffTutorial";
import TrainerNotice from "./TrainerNotice";
import {Person} from "./MentorHome";
import {sessionLibrary} from "./session-library";
import {lastActive, matchesFilter, menteeName, menteeState, mentorName, modeLabel, sessionFilters, sessionStatus, type SessionFilter} from "./session-status";
import {joinPath, sessionCode, sessionPath, type SessionSummary} from "./sessions";
import type {ScenarioRecord} from "./scenarios";
import ui from "./Sweatbox.module.css";

const tone = {live: ui.live, wait: ui.wait, idle: ui.idle};

export default function SessionPicker() {
  return <LearningFrame product="Sweatbox"><SessionAccess embedded role="staff" returnTo="/sweatbox/staff">{(csrf, accountId, access) => <Library key={accountId} csrf={csrf} accountId={accountId} canAssign={access.canAssign}/>}</SessionAccess></LearningFrame>;
}

function Library({csrf, accountId, canAssign}: {csrf: string; accountId: string; canAssign: boolean}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]), [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<SessionFilter>("all"), [search, setSearch] = useState(""), [airport, setAirport] = useState("");
  // Scenarios and Home link here with ?session= to open that session's panel; this only renders in the browser.
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get("session") ?? ""), [manualLink, setManualLink] = useState(false);
  const [dialog, setDialog] = useState<SessionDialogState>(null), [now, setNow] = useState(() => Date.now());
  const library = useRef<ReturnType<typeof sessionLibrary> | null>(null), panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const sync = sessionLibrary((data, definitions) => {setSessions(data); setScenarios(definitions); setLoading(false); setNow(Date.now());}, message => {setLoadError(message); setLoading(false);});
    library.current = sync; void sync.refresh();
    return () => {sync.stop(); library.current = null;};
  }, []);
  const query = search.trim().toLowerCase();
  const airports = useMemo(() => [...new Set(sessions.map(s => s.airport ?? "EGPH"))].sort(), [sessions]);
  const counts = useMemo(() => Object.fromEntries(sessionFilters.map(([key]) => [key, sessions.filter(s => matchesFilter(s, key, accountId)).length])), [sessions, accountId]);
  const listed = sessions.filter(s => matchesFilter(s, filter, accountId) && (!airport || (s.airport ?? "EGPH") === airport) && `${s.title} ${s.airport ?? "EGPH"} ${sessionCode(s.id, s.airport)} ${menteeName(s)}`.toLowerCase().includes(query));
  const selected = sessions.find(s => s.id === selectedId) ?? listed[0] ?? null;
  const select = (id: string) => {
    setSelectedId(id); setManualLink(false);
    if (window.matchMedia("(max-width: 1060px)").matches) requestAnimationFrame(() => panel.current?.scrollIntoView({behavior: "smooth", block: "start"}));
  };
  const menteeLink = (session: SessionSummary) => new URL(joinPath(sessionCode(session.id, session.airport)), window.location.origin).href;
  const copy = async (session: SessionSummary, kind: "link" | "code") => {
    setManualLink(false);
    try {await navigator.clipboard.writeText(kind === "link" ? menteeLink(session) : sessionCode(session.id, session.airport)); setNotice(kind === "link" ? "Mentee link copied." : "Session code copied.");}
    catch {setManualLink(true); setNotice("Could not copy automatically. Copy the Mentee link shown in the panel.");}
  };
  return <div className={ui.page}>
    <main className={ui.content}>
      <div className={ui.heading}><h1>Sessions</h1><div className={ui.headingActions}><StaffTutorial accountId={accountId} className={ui.btn}/><button type="button" data-simulator-tour="new-session" className={`${ui.btn} ${ui.primary}`} disabled={loading} onClick={() => setDialog({kind: "new"})}><Plus size={18} weight="bold" aria-hidden="true"/>Start a session</button></div></div>
      {loadError ? <p role="alert" className={ui.error}>Could not refresh sessions: {loadError}<button type="button" className={ui.btn} onClick={() => void library.current?.refresh()}>Try again</button></p> : null}
      <div className={`${ui.cols} ${ui.colsWide}`}>
        <section aria-labelledby="list-heading" className={ui.panel} data-simulator-tour="session-library">
          <h2 id="list-heading" className={ui.srOnly}>All sessions</h2>
          <div className={ui.panelHead}>
            <div className={ui.tabs} role="group" aria-label="Filter sessions" style={{flex: "1 1 auto"}}>{sessionFilters.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <span>{counts[key]}</span></button>)}</div>
            <label className={ui.field} style={{flex: "0 1 240px"}}><span className={ui.srOnly}>Search sessions</span><MagnifyingGlass size={18} aria-hidden="true"/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, airport or code"/></label>
            <label className={ui.field}><span className={ui.srOnly}>Airport</span><select value={airport} onChange={event => setAirport(event.target.value)}><option value="">All airports</option>{airports.map(code => <option key={code}>{code}</option>)}</select></label>
          </div>
          {loading ? <p role="status" className={ui.status}>Loading saved sessions…</p> : listed.length ? <>
            <div className={`${ui.row} ${ui.rowSelect} ${ui.rowHead}`} aria-hidden="true"><span>Session</span><span className={ui.rowWide}>Airport</span><span className={ui.rowWide}>Mentee</span><span className={ui.rowWide}>Status</span><span/></div>
            {listed.map(s => {
              const status = sessionStatus(s), mentee = menteeName(s);
              return <button key={s.id} type="button" className={`${ui.row} ${ui.rowSelect}`} aria-pressed={selected?.id === s.id} onClick={() => select(s.id)}>
                <span className={ui.rowTitle}><strong>{s.title}</strong><small className={ui.mono}>{sessionCode(s.id, s.airport)}</small></span>
                <span className={`${ui.rowCell} ${ui.rowWide}`}><strong>{s.airport ?? "EGPH"}</strong><small>{modeLabel(s)}</small></span>
                <span className={ui.rowWide}><Person name={mentee || "Unassigned"} detail={menteeState(s)} empty={!mentee} initialsFor={mentee}/></span>
                <span className={ui.rowCell}><span className={`${ui.pill} ${tone[status.tone]}`}><span className={ui.dot}/>{status.label}</span><small className={ui.rowWide}>{lastActive(s.updatedAt, now)}</small></span>
                <CaretRight className={ui.rowChevron} size={18} aria-hidden="true"/>
              </button>;
            })}
          </> : <div className={ui.empty}><h3>{sessions.length ? "No matching sessions" : "No sessions yet"}</h3><p>{sessions.length ? "Try another filter or search." : "Start a session from one of your published scenarios."}</p>{sessions.length ? <button type="button" className={ui.btn} onClick={() => {setFilter("all"); setSearch(""); setAirport("");}}>Clear filters</button> : <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => setDialog({kind: "new"})}>Start a session</button>}</div>}
        </section>
        {selected ? <SessionPanel ref={panel} session={selected} accountId={accountId} canAssign={canAssign} now={now} manualLink={manualLink ? menteeLink(selected) : ""}
          onCopy={kind => void copy(selected, kind)} onAssign={() => setDialog({kind: "assign", session: selected})} onArchive={() => setDialog({kind: "end", session: selected})}/> : null}
      </div>
    </main>
    <footer className={ui.footer}><TrainerNotice/></footer>
    {notice ? <div className={ui.notification}><p role="status">{notice}</p><button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div> : null}
    <SessionDialogs state={dialog} csrf={csrf} canAssign={canAssign} scenarios={scenarios} onClose={() => setDialog(null)} onBusy={busy => {if (busy) library.current?.invalidate();}}
      onDone={result => {
        setDialog(null); setNotice(result.notice);
        if (result.created) setSelectedId(result.created);
        if (result.updated) setSessions(current => current.map(s => s.id === result.updated!.id ? result.updated! : s));
        if (result.ended) setSessions(current => current.filter(s => s.id !== result.ended));
        void library.current?.refresh();
      }}/>
  </div>;
}

function SessionPanel({ref, session, accountId, canAssign, now, manualLink, onCopy, onAssign, onArchive}: {
  ref: React.Ref<HTMLElement>; session: SessionSummary; accountId: string; canAssign: boolean; now: number; manualLink: string;
  onCopy: (kind: "link" | "code") => void; onAssign: () => void; onArchive: () => void;
}) {
  const status = sessionStatus(session), mentee = menteeName(session), code = sessionCode(session.id, session.airport);
  const facts = [session.airport ?? "EGPH", modeLabel(session), session.scenario ? `From “${session.scenario.title}”` : "", session.ownerName || session.ownerId ? `Created by ${session.ownerId === accountId ? "you" : session.ownerName || session.ownerId}` : ""].filter(Boolean);
  return <aside ref={ref} aria-labelledby="selected-heading" className={`${ui.box} ${ui.sidePanel}`}>
    <div>
      <span className={`${ui.pill} ${tone[status.tone]}`}><span className={ui.dot}/>{status.label}</span>
      <h2 id="selected-heading">{session.title}</h2>
      <p className={ui.meta}>{facts.join(" · ")}</p>
    </div>
    <Link data-simulator-tour="staff-radar-link" className={`${ui.btn} ${ui.primary} ${ui.large}`} href={sessionPath("staff", session.id)}>Enter session</Link>
    <div>
      <span className={ui.label}>People</span>
      <div className={ui.people}>
        <Person name={session.staffOccupied ? `${mentorName(session)}${session.staffId === accountId ? " (you)" : ""}` : "No Mentor connected"} detail={session.staffOccupied ? "Mentor · connected" : "Mentor seat free"} empty={!session.staffOccupied} initialsFor={session.staffOccupied ? mentorName(session) : ""}/>
        <div className={ui.personRow}>
          <Person name={mentee || "No Mentee assigned"} detail={session.assignedMenteeId ? `Assigned Mentee · ${session.menteeOccupied ? "in session" : "not joined yet"}` : session.menteeOccupied ? "Mentee · in session" : "Assign one so it shows in their Your sweatbox"} empty={!mentee} initialsFor={mentee}/>
          {canAssign ? <button type="button" className={`${ui.btn} ${ui.small}`} onClick={onAssign}>{session.assignedMenteeId ? "Change" : <><UserPlus size={16} aria-hidden="true"/>Assign</>}<span className={ui.srOnly}> Mentee for {session.title}</span></button> : null}
        </div>
      </div>
    </div>
    <div data-simulator-tour="mentee-sharing">
      <span className={ui.label}>Share with a Mentee</span>
      <div className={ui.codeRow}><code className={ui.mono}>{code}</code><button type="button" className={ui.btn} onClick={() => onCopy("code")}>Copy code</button></div>
      <button type="button" className={ui.btn} style={{width: "100%"}} onClick={() => onCopy("link")}><LinkSimple size={18} aria-hidden="true"/>Copy Mentee link</button>
      {manualLink ? <label className={ui.manualLink}>Mentee link<input readOnly value={manualLink} onFocus={event => event.currentTarget.select()}/></label> : null}
    </div>
    <div className={ui.panelEnd}>
      <small>Last active {lastActive(session.updatedAt, now).toLowerCase()}</small>
      <button type="button" className={`${ui.btn} ${ui.quiet} ${ui.danger}`} onClick={onArchive}>Archive session<span className={ui.srOnly}> {session.title}</span></button>
    </div>
  </aside>;
}
