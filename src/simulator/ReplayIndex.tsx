"use client";
import {useEffect, useState} from "react";
import Link from "next/link";
import {MagnifyingGlass} from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import TrainerNotice from "./TrainerNotice";
import {sessionJson} from "./shared-transport";
import {canPlayReplay, recordingLabel, type ReplaySummary} from "./replays";
import ui from "./Sweatbox.module.css";

const day = new Intl.DateTimeFormat("en-GB", {weekday: "long", day: "numeric", month: "long", timeZone: "UTC"});
const clock = new Intl.DateTimeFormat("en-GB", {hour: "2-digit", minute: "2-digit", timeZone: "UTC"});
const names = (replay: ReplaySummary, role: "staff" | "mentee") => replay.participants.filter(p => p.role === role).map(p => p.name || p.accountId).join(", ");
const minutes = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min`;

/** Mentor replay list: their own sessions by default, everyone's on request, grouped by the UTC day they ended. */
export default function ReplayIndex({accountId}: {accountId: string}) {
  const [filters, setFilters] = useState({q: "", mine: true});
  const [query, setQuery] = useState(""), [offset, setOffset] = useState(0);
  const [replays, setReplays] = useState<ReplaySummary[]>([]), [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const change = (patch: Partial<typeof filters>) => {setLoading(true); setError(""); setOffset(0); setFilters(current => ({...current, ...patch}));};
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({offset: String(offset), q: filters.q, scope: filters.mine ? "mine" : "all"});
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
  const days: [string, ReplaySummary[]][] = [];
  for (const replay of replays) {
    const label = day.format(replay.endedAt), last = days.at(-1);
    if (last?.[0] === label) last[1].push(replay); else days.push([label, [replay]]);
  }
  return <div className={ui.page}>
    <main className={ui.content}>
      <div className={ui.heading}><h1>Replays</h1></div>
      <div className={ui.toolbar}>
        <div className={ui.seg} role="group" aria-label="Whose replays"><button type="button" aria-pressed={filters.mine} onClick={() => change({mine: true})}>Mine</button><button type="button" aria-pressed={!filters.mine} onClick={() => change({mine: false})}>Everyone</button></div>
        <form role="search" className={`${ui.field} ${ui.grow}`} onSubmit={event => {event.preventDefault(); change({q: query.trim()});}}>
          <MagnifyingGlass size={18} aria-hidden="true"/><input aria-label="Search replays" type="search" maxLength={100} placeholder="Search by name, airport or person" value={query} onChange={event => setQuery(event.target.value)}/>
        </form>
      </div>
      <div aria-busy={loading}>
        {error ? <p role="alert" className={ui.error}>{error}<button type="button" className={ui.btn} onClick={() => {setLoading(true); setError(""); setRetry(value => value + 1);}}>Try again</button></p>
          : loading && !replays.length ? <p role="status" className={ui.status}>Loading replays…</p>
          : replays.length ? <div className={ui.groups}>{days.map(([label, rows]) => <section key={label} className={ui.group} aria-label={label}>
            <h2 className={ui.groupTitle}>{label}</h2>
            <div className={ui.list}>{rows.map(replay => {
              const mentee = names(replay, "mentee"), mentor = names(replay, "staff"), playable = canPlayReplay(replay);
              const you = replay.participants.some(p => p.role === "staff" && p.accountId === accountId);
              const people = mentee ? `${mentee}${mentor ? ` with ${you ? "you" : mentor}` : ""}` : "No Mentee recorded";
              const extra = [playable ? "" : recordingLabel(replay), replay.status !== "ended" ? replay.status[0].toUpperCase() + replay.status.slice(1) : ""].filter(Boolean);
              return <div key={replay.id} className={ui.item}>
                <div className={ui.itemRow}>
                  <div className={ui.itemMain}>
                    <Link href={`/sweatbox/replays/${replay.id}`}>{replay.title}</Link>
                    <small>{[replay.airport ?? "EGPH", people, minutes(replay.duration), `ended ${clock.format(replay.endedAt)} UTC`, ...extra].join(" · ")}</small>
                  </div>
                  <span className={`${ui.state} ${replay.feedback ? ui.stateLive : ""}`}>{replay.feedback ? "Feedback written" : "No feedback"}</span>
                  <Link className={ui.btn} href={`/sweatbox/replays/${replay.id}`}>{playable ? "Watch" : "View summary"}<span className={ui.srOnly}> {replay.title}, {label} {clock.format(replay.endedAt)} UTC</span></Link>
                </div>
              </div>;
            })}</div>
          </section>)}</div>
          : <div className={ui.emptyCard}><h2>{filters.q ? "No matching replays" : filters.mine ? "No replays of your sessions yet" : "No completed sessions yet"}</h2><p>{filters.q ? "Try another search." : "Archived sessions appear here, ready to review."}</p>{filters.q ? <button type="button" className={ui.btn} onClick={() => {setQuery(""); change({q: ""});}}>Clear search</button> : filters.mine ? <button type="button" className={ui.btn} onClick={() => change({mine: false})}>Show everyone’s</button> : null}</div>}
      </div>
      {replays.length && !error ? <div className={ui.listFoot}><span aria-live="polite">Showing {replays.length}{next !== null ? "+" : ""} {replays.length === 1 ? "replay" : "replays"} · All times UTC</span>{next !== null ? <button type="button" className={ui.btn} disabled={loading} onClick={() => {setLoading(true); setOffset(next);}}>{loading ? "Loading…" : "Load more"}</button> : null}</div> : null}
    </main>
    <footer className={ui.footer}><TrainerNotice/></footer>
  </div>;
}
