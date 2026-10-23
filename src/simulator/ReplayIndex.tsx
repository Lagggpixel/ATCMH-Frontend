"use client";
import {Fragment, useEffect, useState} from "react";
import Link from "next/link";
import {MagnifyingGlassIcon} from "@phosphor-icons/react/MagnifyingGlass";
import {UserIcon} from "@phosphor-icons/react/User";
import {AIRPORT_IDS, environmentLabel} from "./airports";
import LibraryFooter from "./LibraryFooter";
import {sessionJson} from "./shared-transport";
import {timeLabel} from "./scenarios";
import {canPlayReplay, recordingLabel, type ReplaySummary} from "./replays";
import library from "./LibraryPages.module.css";
import styles from "./ReplayIndex.module.css";

const day = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "long", year: "numeric", timeZone: "UTC"});
const recorded = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC"});

export default function ReplayIndex({canViewOthers = false}: {canViewOthers?: boolean}) {
  const [filters, setFilters] = useState({q: "", airport: "", date: "", mine: false, offset: 0});
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{replays: ReplaySummary[]; next: number | null}>({replays: [], next: null});
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const change = (patch: Partial<typeof filters>) => {
    setLoading(true); setError(""); setFilters(current => ({...current, offset: 0, ...patch}));
  };
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({offset: String(filters.offset), q: filters.q, airport: filters.airport, date: filters.date, scope: filters.mine ? "mine" : "all"});
    fetch(`/api/simulator/replays?${params}`, {signal: controller.signal, cache: "no-store"}).then(sessionJson)
      .then(data => {if (!controller.signal.aborted) setResult(data);})
      .catch(reason => {if (!controller.signal.aborted) setError(reason.message || "Replays could not be loaded.");})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [filters, retry]);
  const filtered = !!(filters.q || filters.airport || filters.date || filters.mine);
  return <main className={`${library.library} ${library.workspaceLibrary} ${styles.library}`}>
    <div className={`${library.libraryContent} ${styles.content}`}>
      <header className={styles.heading}><h1>Replays</h1></header>
      <div className={styles.toolbar}>
        <form role="search" className={styles.search} onSubmit={event => {event.preventDefault(); change({q: query.trim()});}}>
          <MagnifyingGlassIcon size={20} aria-hidden="true"/>
          <input aria-label="Search replays" type="search" maxLength={100} placeholder="Search airport, session or participant…" value={query} onChange={event => setQuery(event.target.value)}/>
          <button type="submit">Search</button>
        </form>
        <select aria-label="Filter by airport" value={filters.airport} onChange={event => change({airport: event.target.value})}><option value="">All airports</option>{AIRPORT_IDS.map(airport => <option key={airport}>{airport}</option>)}</select>
        <label className={styles.dateFilter}>Recorded date (UTC)<input type="date" value={filters.date} onChange={event => change({date: event.target.value})}/></label>
        {canViewOthers ? <button type="button" className={styles.mine} aria-pressed={filters.mine} title="Sessions where you participated as mentor" onClick={() => change({mine: !filters.mine})}><UserIcon size={18} aria-hidden="true"/>My sessions</button> : null}
        {filtered ? <button className={styles.clear} onClick={() => {setQuery(""); change({q: "", airport: "", date: "", mine: false});}}>Clear filters</button> : null}
      </div>
      <div className={styles.context}><span>Newest first · All times UTC</span></div>
      <div aria-busy={loading}>
        {loading ? <p role="status" className={styles.message}>Loading replays…</p> : error ? <div className={styles.message}><p role="alert">{error}</p><button onClick={() => {setLoading(true); setError(""); setRetry(value => value + 1);}}>Try again</button></div> : result.replays.length ? <table className={styles.table}>
          <caption className={styles.srOnly}>Completed Sweatbox sessions, newest first</caption>
          <thead><tr><th scope="col">Session</th><th scope="col">Mentor &amp; mentee</th><th scope="col">Recorded UTC</th><th scope="col">Duration</th><th scope="col">Type</th><th scope="col"><span className={styles.srOnly}>Open replay</span></th></tr></thead>
          <tbody>{result.replays.map((replay, index) => <Fragment key={replay.id}>
            {index === 0 || day.format(replay.endedAt) !== day.format(result.replays[index - 1].endedAt) ? <tr className={styles.dateGroup}><th colSpan={6} scope="rowgroup">{day.format(replay.endedAt)}</th></tr> : null}
            <tr className={styles.row}>
              <td className={styles.session}><Link href={`/sweatbox/replays/${replay.id}`}>{replay.title}</Link><small>{environmentLabel(replay)}</small></td>
              <td className={styles.people}>{(["staff", "mentee"] as const).map(role => <div key={role}><span>{role === "staff" ? "Mentor" : "Mentee"}</span><p>{replay.participants.filter(person => person.role === role).map(person => person.name || person.accountId).join(", ") || "Not recorded"}</p></div>)}</td>
              <td className={styles.recorded}><span className={styles.mobileLabel}>Recorded UTC</span><time dateTime={new Date(replay.endedAt).toISOString()}>{recorded.format(replay.endedAt)}</time></td>
              <td className={styles.duration}><span className={styles.mobileLabel}>Duration</span>{timeLabel(replay.duration)}</td>
              <td className={styles.kind}><span className={`${styles.badge} ${replay.partial && replay.kind === "recording" ? styles.partial : canPlayReplay(replay) ? styles.recording : styles.summary}`}>{recordingLabel(replay)}</span><small>{replay.status}</small></td>
              <td className={styles.action}><Link className={library.primary} href={`/sweatbox/replays/${replay.id}`} aria-label={`${canPlayReplay(replay) ? "Watch replay" : "View saved session"}: ${replay.title}, ${recorded.format(replay.endedAt)} UTC`}>{canPlayReplay(replay) ? "Watch replay" : "View saved session"}</Link></td>
            </tr>
          </Fragment>)}</tbody>
        </table> : <section className={styles.message}><h2>{filtered ? "No matching replays" : "No completed sessions yet"}</h2><p>{filtered ? "Try another search or clear your filters." : "Completed sessions will appear here, ready to review."}</p></section>}
      </div>
      <nav className={styles.pagination} aria-label="Replay pages"><p aria-live="polite">{!loading && !error ? result.replays.length ? `Showing ${filters.offset + 1}–${filters.offset + result.replays.length}${filtered ? " matching replays" : " replays"}` : "0 replays" : ""}</p><div><button disabled={loading || filters.offset === 0} onClick={() => change({offset: Math.max(0, filters.offset - 50)})}>Previous</button><span>Page {Math.floor(filters.offset / 50) + 1}</span><button disabled={loading || !!error || result.next === null} onClick={() => {if (result.next !== null) change({offset: result.next});}}>Next</button></div></nav>
      <LibraryFooter/>
    </div>
  </main>;
}
