"use client";
import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {MagnifyingGlass} from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import LearningFrame from "../learning/LearningFrame";
import {usePortalAuth} from "../platform/auth/PortalAuthProvider";
import {canAccessStaffSimulator} from "./feature";
import SessionAccess, {SessionNotice} from "./SessionAccess";
import SessionDialogs, {type SessionDialogState} from "./SessionDialogs";
import {previewSession} from "./SessionEntry";
import StaffTutorial from "./StaffTutorial";
import TrainerNotice from "./TrainerNotice";
import {sessionLibrary} from "./session-library";
import {isActive, isMine, lastActive, menteeName, modeLabel, sessionStatus} from "./session-status";
import {isSplit, PositionChips, positionProgress, PositionTable} from "./PositionSummary";
import {OlderFold, rowStyles as row, SeatChip, SessionRow, WEEK_MS} from "./SessionRow";
import {joinPath, sessionCode, sessionPath, type SessionSummary} from "./sessions";
import type {ScenarioRecord} from "./scenarios";
import ui from "./Sweatbox.module.css";

/** /sweatbox and /sweatbox/staff: the Sessions page, which is a Mentor's home. Anyone without Sweatbox access goes to Your sweatbox. */
export default function MentorHome({returnTo = "/sweatbox"}: {returnTo?: string}) {
  const auth = usePortalAuth(), router = useRouter();
  const mentee = !auth.loading && !!auth.session && !auth.error && !canAccessStaffSimulator(auth.adminUser);
  useEffect(() => {if (mentee) router.replace("/sweatbox/mentee");}, [mentee, router]);
  return <LearningFrame product="Sweatbox">{mentee ? <SessionNotice embedded title="Opening Your sweatbox…"/> :
    <SessionAccess embedded role="staff" returnTo={returnTo}>{(csrf, accountId, access) => <Sessions key={accountId} csrf={csrf} accountId={accountId} canAssign={access.canAssign} superAdmin={access.superAdmin}/>}</SessionAccess>}
  </LearningFrame>;
}

function Sessions({csrf, accountId, canAssign, superAdmin}: {csrf: string; accountId: string; canAssign: boolean; superAdmin: boolean}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]), [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [notice, setNotice] = useState("");
  const [mine, setMine] = useState(false), [search, setSearch] = useState(""), [joining, setJoining] = useState(false), [older, setOlder] = useState(false);
  // Scenarios link here with ?session= to open that session's details; this only renders in the browser.
  const [openId, setOpenId] = useState(() => new URLSearchParams(window.location.search).get("session") ?? ""), [manualLink, setManualLink] = useState("");
  const [dialog, setDialog] = useState<SessionDialogState>(null), [now, setNow] = useState(() => Date.now());
  const library = useRef<ReturnType<typeof sessionLibrary> | null>(null);
  useEffect(() => {
    const sync = sessionLibrary((data, definitions) => {setSessions(data); setScenarios(definitions); setLoading(false); setNow(Date.now());}, message => {setLoadError(message); setLoading(false);});
    library.current = sync; void sync.refresh();
    return () => {sync.stop(); library.current = null;};
  }, []);
  useEffect(() => {
    if (openId && !loading) document.getElementById(`session-${openId}`)?.scrollIntoView({block: "nearest"});
  }, [openId, loading]);
  const query = search.trim().toLowerCase();
  const listed = sessions.filter(s => (!mine || isMine(s, accountId)) && `${s.title} ${s.airport ?? "EGPH"} ${sessionCode(s.id, s.airport)} ${menteeName(s)} ${s.staffName ?? ""} ${s.ownerName ?? ""}`.toLowerCase().includes(query));
  const groups = [["Happening now", listed.filter(isActive)], ["Not running", listed.filter(s => !isActive(s))]] as const;
  const tourId = (groups[0][1][0] ?? groups[1][1][0])?.id;
  const menteeLink = (session: SessionSummary) => new URL(joinPath(sessionCode(session.id, session.airport)), window.location.origin).href;
  const copy = async (session: SessionSummary, kind: "link" | "code") => {
    setManualLink("");
    try {await navigator.clipboard.writeText(kind === "link" ? menteeLink(session) : sessionCode(session.id, session.airport)); setNotice(kind === "link" ? "Mentee link copied." : "Session code copied.");}
    catch {setManualLink(menteeLink(session)); setNotice("Could not copy automatically. Copy the Mentee link shown under the session.");}
  };
  const toggle = (id: string) => {setOpenId(current => current === id ? "" : id); setManualLink("");};
  return <div className={ui.page}>
    <main className={ui.content}>
      <div className={ui.heading}>
        <h1>Sessions</h1>
        <div className={ui.headingActions}>
          <StaffTutorial accountId={accountId} className={ui.linkButton}/>
          <button type="button" className={ui.linkButton} aria-expanded={joining} onClick={() => setJoining(open => !open)}>Join with a code</button>
          <button type="button" data-simulator-tour="new-session" className={`${ui.btn} ${ui.primary}`} disabled={loading} onClick={() => setDialog({kind: "new"})}>Start a session</button>
        </div>
      </div>
      {joining ? <JoinWithCode/> : null}
      <div className={ui.toolbar}>
        <div className={ui.seg} role="group" aria-label="Whose sessions"><button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>Everyone</button><button type="button" aria-pressed={mine} onClick={() => setMine(true)}>Mine</button></div>
        <label className={`${ui.field} ${ui.grow}`}><span className={ui.srOnly}>Search sessions</span><MagnifyingGlass size={18} aria-hidden="true"/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name, airport, code or Mentee"/></label>
      </div>
      {loadError ? <p role="alert" className={ui.error}>Could not refresh sessions: {loadError}<button type="button" className={ui.btn} onClick={() => void library.current?.refresh()}>Try again</button></p> : null}
      {loading ? <p role="status" className={ui.status}>Loading sessions…</p> : listed.length ? <div className={ui.groups} data-simulator-tour="session-library">{groups.map(([title, all]) => {
        // Sessions idle for over a week fold away unless searching.
        const stale = title === "Not running" && !query && !older ? all.filter(s => now - s.updatedAt > WEEK_MS) : [];
        const rows = all.filter(s => !stale.includes(s));
        return all.length ? <section key={title} className={ui.group} aria-label={title}>
        <h2 className={ui.groupTitle}>{title} <span className={row.count}>{all.length}</span></h2>
        <div className={ui.list}>{rows.map(s => {
          const status = sessionStatus(s), mentee = menteeName(s), open = openId === s.id, code = sessionCode(s.id, s.airport);
          const split = isSplit(s.positions) ? s.positions! : null;
          const state = split ? positionProgress(split) : isActive(s) ? status.label : s.assignedMenteeId ? "Not joined yet" : `Active ${lastActive(s.updatedAt, now).toLowerCase()}`;
          const enter = <Link data-simulator-tour={s.id === tourId ? "staff-radar-link" : undefined} className={`${ui.btn} ${status.label === "Mentee waiting" ? ui.primary : ""}`} href={sessionPath("staff", s.id)}>Enter<span className={ui.srOnly}> {s.title}</span></Link>;
          const assign = canAssign ? <button type="button" className={ui.linkButton} style={{minHeight: 0, fontSize: 13}} onClick={() => setDialog({kind: "assign", session: s})}>Assign a Mentee<span className={ui.srOnly}> to {s.title}</span></button> : undefined;
          const seats = split ? <PositionChips positions={split}/> : <SeatChip label="Mentee" person={mentee || undefined} presence={s.menteeOccupied ? "on" : isActive(s) ? "wait" : "off"} assign={assign}/>;
          return <SessionRow key={s.id} id={s.id} airport={s.airport ?? "EGPH"} title={s.title} mode={modeLabel(s)} trainerLabel="Mentor" trainer={s.staffName?.trim() || s.ownerName?.trim() || ""} trainerPresence={s.staffOccupied ? "on" : isActive(s) ? "wait" : "off"}
            status={state} tone={status.tone} enter={enter} seats={seats} open={open} onToggle={() => toggle(s.id)} tour="mentee-sharing" details={<>
              {split ? <PositionTable positions={split} onCopy={() => void copy(s, "link")}/> : null}
              <div className={row.actions}>
                <span className={row.code}>Code <strong>{code}</strong></span>
                <button type="button" className={ui.linkButton} onClick={() => void copy(s, "code")}>Copy code</button>
                <button type="button" className={ui.linkButton} onClick={() => void copy(s, "link")}>Copy Mentee link</button>
                {canAssign && !split ? <button type="button" className={ui.linkButton} onClick={() => setDialog({kind: "assign", session: s})}>{s.assignedMenteeId ? "Change Mentee" : "Assign a Mentee"}</button> : null}
                {superAdmin ? <Link className={ui.linkButton} href={sessionPath("spectator", s.id)} style={{display: "inline-flex", alignItems: "center"}}>Spectate<span className={ui.srOnly}> {s.title}</span></Link> : null}
                <button type="button" className={`${ui.linkButton} ${ui.dangerLink} ${row.push}`} onClick={() => setDialog({kind: "end", session: s})}>Archive…<span className={ui.srOnly}> {s.title}</span></button>
              </div>
              {manualLink ? <label className={ui.manualLink}>Mentee link<input readOnly value={manualLink} onFocus={event => event.currentTarget.select()}/></label> : null}
            </>}/>;
        })}{stale.length ? <OlderFold count={stale.length} onShow={() => setOlder(true)}/> : null}</div>
      </section> : null;
      })}</div> : <div className={ui.emptyCard}><h2>{sessions.length ? "No matching sessions" : "No sessions yet"}</h2><p>{sessions.length ? "Try another search, or show everyone’s sessions." : "Start a session from one of your published scenarios."}</p>{sessions.length ? <button type="button" className={ui.btn} onClick={() => {setMine(false); setSearch("");}}>Clear filters</button> : <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => setDialog({kind: "new"})}>Start a session</button>}</div>}
    </main>
    <footer className={ui.footer}><TrainerNotice/></footer>
    {notice ? <div className={ui.notification}><p role="status">{notice}</p><button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div> : null}
    <SessionDialogs state={dialog} csrf={csrf} canAssign={canAssign} scenarios={scenarios} onClose={() => setDialog(null)} onBusy={busy => {if (busy) library.current?.invalidate();}}
      onDone={result => {
        setDialog(null); setNotice(result.notice);
        if (result.created) setOpenId(result.created);
        if (result.updated) setSessions(current => current.map(s => s.id === result.updated!.id ? result.updated! : s));
        if (result.ended) setSessions(current => current.filter(s => s.id !== result.ended));
        void library.current?.refresh();
      }}/>
  </div>;
}

/** A Mentor joining by code takes the Mentor seat; the code only finds the session. */
function JoinWithCode() {
  const [value, setValue] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className={ui.joinForm} onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError("");
    try {window.location.assign(sessionPath("staff", (await previewSession(value)).id));}
    catch (reason) {setError((reason as Error).message); setBusy(false);}
  }}>
    <div>
      <label className={ui.field}><span className={ui.srOnly}>Session code or link</span><input className={ui.mono} value={value} onChange={event => setValue(event.target.value)} placeholder="Session code or link" autoCapitalize="characters" autoComplete="off" spellCheck={false} required disabled={busy} autoFocus aria-invalid={!!error || undefined}/></label>
      {error ? <small role="alert" style={{color: "var(--dashboard-danger-text,#b42318)", fontSize: 13}}>{error}</small> : null}
    </div>
    <button className={ui.btn} disabled={busy}>{busy ? "Checking…" : "Join"}</button>
  </form>;
}
