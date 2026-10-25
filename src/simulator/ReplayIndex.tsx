"use client";
import {Fragment, useEffect, useState} from "react";
import Link from "next/link";
import {MagnifyingGlass} from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import {AIRPORT_IDS} from "./airports";
import TrainerNotice from "./TrainerNotice";
import {sessionJson} from "./shared-transport";
import {timeLabel} from "./scenarios";
import {Person} from "./MentorHome";
import {modeLabel} from "./session-status";
import {canPlayReplay, recordingLabel, type ReplaySummary} from "./replays";
import ui from "./Sweatbox.module.css";
import styles from "./ReplayIndex.module.css";

const day = new Intl.DateTimeFormat("en-GB", {weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC"});
const clock = new Intl.DateTimeFormat("en-GB", {hour: "2-digit", minute: "2-digit", timeZone: "UTC"});
const names = (replay: ReplaySummary, role: "staff" | "mentee") => replay.participants.filter(p => p.role === role).map(p => p.name || p.accountId).join(", ");

/** Mentor replay list: their own sessions by default, everyone's on request. */
export default function ReplayIndex({accountId}: {accountId: string}) {
  const [filters, setFilters] = useState({q: "", airport: "", date: "", mine: true});
  const [query, setQuery] = useState(""), [offset, setOffset] = useState(0);
  const [replays, setReplays] = useState<ReplaySummary[]>([]), [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const change = (patch: Partial<typeof filters>) => {setLoading(true); setError(""); setOffset(0); setFilters(current => ({...current, ...patch}));};
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({offset: String(offset), q: filters.q, airport: filters.airport, date: filters.date, scope: filters.mine ? "mine" : "all"});
    fetch(`/api/simulator/replays?${params}`, {signal: controller.signal, cache: "no-store"}).then(sessionJson)
      .then(data => {if (!controller.signal.aborted) {setReplays(current => offset ? [...current, ...data.replays] : data.replays); setNext(data.next);}})
      .catch(reason => {if (!controller.signal.aborted) setError(reason.message || "Replays could not be loaded.");})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [filters, offset, retry]);
  // Search waits a moment after typing stops.
  useEffect(() => {
    const value = query.trim();
    if (value === filters.q) return;
    const timer = window.setTimeout(() => {setLoading(true); setError(""); setOffset(0); setFilters(current => ({...current, q: value}));}, 350);
    return () => window.clearTimeout(timer);
  }, [query, filters.q]);
  const filtered = !!(filters.q || filters.airport || filters.date);
  return <div className={ui.page}>
    <main className={ui.content}>
      <div className={ui.heading}>
        <h1>Replays</h1>
        <div className={ui.seg} role="group" aria-label="Whose replays"><button type="button" aria-pressed={filters.mine} onClick={() => change({mine: true})}>My sessions</button><button type="button" aria-pressed={!filters.mine} onClick={() => change({mine: false})}>Everyone</button></div>
      </div>
      <section aria-labelledby="replays-heading" className={ui.panel}>
        <h2 id="replays-heading" className={ui.srOnly}>{filters.mine ? "Your replays" : "All replays"}</h2>
        <div className={ui.panelHead}>
          <form role="search" className={`${ui.field} ${ui.grow}`} onSubmit={event => {event.preventDefault(); change({q: query.trim()});}}>
            <MagnifyingGlass size={18} aria-hidden="true"/><input aria-label="Search replays" type="search" maxLength={100} placeholder="Search session, airport, Mentor or Mentee" value={query} onChange={event => setQuery(event.target.value)}/>
          </form>
          <label className={ui.field}><span className={ui.srOnly}>Airport</span><select value={filters.airport} onChange={event => change({airport: event.target.value})}><option value="">All airports</option>{AIRPORT_IDS.map(airport => <option key={airport}>{airport}</option>)}</select></label>
          <label className={ui.field}><span className={ui.srOnly}>Recorded date (UTC)</span><input type="date" value={filters.date} onChange={event => change({date: event.target.value})} style={{width: 150}}/></label>
          {filtered ? <button type="button" className={ui.linkButton} onClick={() => {setQuery(""); change({q: "", airport: "", date: ""});}}>Clear filters</button> : null}
        </div>
        <div className={ui.panelNote}><span>Newest first · All times UTC</span></div>
        <div aria-busy={loading}>
          {error ? <p role="alert" className={ui.error} style={{margin: "0 20px 20px"}}>{error}<button type="button" className={ui.btn} onClick={() => {setLoading(true); setError(""); setRetry(value => value + 1);}}>Try again</button></p>
            : loading && !replays.length ? <p role="status" className={ui.status}>Loading replays…</p>
            : replays.length ? replays.map((replay, index) => {
              const mentee = names(replay, "mentee"), mentor = names(replay, "staff"), playable = canPlayReplay(replay);
              const newDay = index === 0 || day.format(replay.endedAt) !== day.format(replays[index - 1].endedAt);
              return <Fragment key={replay.id}>
                {newDay ? <div className={ui.dayLabel}>{day.format(replay.endedAt)}</div> : null}
                <div className={`${ui.row} ${styles.row}`}>
                  <div className={ui.rowTitle}><Link href={`/sweatbox/replays/${replay.id}`}>{replay.title}</Link><small>{replay.airport ?? "EGPH"} · {modeLabel(replay)}</small>
                    <div className={styles.tags}>{replay.feedback ? <span className={`${ui.tag} ${ui.tagFeedback}`}>Feedback</span> : null}<span className={`${ui.tag} ${replay.partial && replay.kind === "recording" ? ui.tagIncident : playable ? ui.tagBookmark : ""}`}>{recordingLabel(replay)}</span>{replay.status !== "ended" ? <span className={ui.tag}>{replay.status[0].toUpperCase() + replay.status.slice(1)}</span> : null}</div></div>
                  <div className={ui.rowWide}><Person name={mentee || "No Mentee recorded"} detail={mentor ? `with ${mentor}${replay.participants.some(p => p.role === "staff" && p.accountId === accountId) ? " (you)" : ""}` : undefined} empty={!mentee} initialsFor={mentee}/></div>
                  <div className={`${ui.rowCell} ${ui.rowWide}`}><strong className={ui.mono} style={{fontWeight: 400}}>{timeLabel(replay.duration)}</strong><small>Ended {clock.format(replay.endedAt)}</small></div>
                  <Link className={`${ui.btn} ${playable ? ui.primary : ""}`} href={`/sweatbox/replays/${replay.id}`}>{playable ? "Watch" : "View summary"}<span className={ui.srOnly}> {replay.title}, {day.format(replay.endedAt)} {clock.format(replay.endedAt)} UTC</span></Link>
                </div>
              </Fragment>;
            }) : <div className={ui.empty}><h3>{filtered ? "No matching replays" : filters.mine ? "No replays of your sessions yet" : "No completed sessions yet"}</h3><p>{filtered ? "Try another search or clear your filters." : "Archived sessions appear here, ready to review."}</p>{filters.mine && !filtered ? <button type="button" className={ui.btn} onClick={() => change({mine: false})}>Show everyone’s</button> : null}</div>}
        </div>
        {replays.length && !error ? <div className={ui.panelFoot}><span aria-live="polite">Showing {replays.length}{next !== null ? "+" : ""} {replays.length === 1 ? "replay" : "replays"}</span>{next !== null ? <button type="button" className={ui.btn} disabled={loading} onClick={() => {setLoading(true); setOffset(next);}}>{loading ? "Loading…" : "Load more"}</button> : null}</div> : null}
      </section>
    </main>
    <footer className={ui.footer}><TrainerNotice/></footer>
  </div>;
}
