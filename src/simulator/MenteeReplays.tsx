"use client";
import {useEffect, useState} from "react";
import Link from "next/link";
import LearningFrame from "../learning/LearningFrame";
import SessionAccess from "./SessionAccess";
import TrainerNotice from "./TrainerNotice";
import {sessionJson} from "./shared-transport";
import {initials, modeLabel} from "./session-status";
import {canPlayReplay, recordingLabel, type ReplaySummary} from "./replays";
import ui from "./Sweatbox.module.css";
import styles from "./MenteeReplays.module.css";

const date = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"});
const minutes = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min`;
const mentorOf = (replay: ReplaySummary) => replay.participants.filter(p => p.role === "staff").map(p => p.name || p.accountId).join(", ");

/** A Mentee's own recordings and the feedback their Mentor left on each. */
export default function MenteeReplays() {
  return <LearningFrame product="Sweatbox"><SessionAccess embedded allowMentee role="mentee" returnTo="/sweatbox/mentee/replays">{() => <Replays/>}</SessionAccess></LearningFrame>;
}
function Replays() {
  const [replays, setReplays] = useState<ReplaySummary[] | null>(null), [next, setNext] = useState<number | null>(null);
  const [offset, setOffset] = useState(0), [error, setError] = useState(""), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/simulator/replays?scope=self&offset=${offset}`, {cache: "no-store", signal: controller.signal}).then(sessionJson)
      .then(data => {if (!controller.signal.aborted) {setReplays(current => offset && current ? [...current, ...data.replays] : data.replays); setNext(data.next);}})
      .catch(reason => {if (!controller.signal.aborted) setError((reason as Error).message || "Your replays could not be loaded.");})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [offset, retry]);
  const latest = replays?.find(r => r.feedback);
  return <div className={ui.page}>
    <main className={`${ui.content} ${ui.narrow}`}>
      <div className={ui.heading}><div><h1>Your replays</h1><p>Watch your past sessions and read what your Mentor said about them.</p></div></div>
      {error ? <p role="alert" className={ui.error}>{error}<button type="button" className={ui.btn} onClick={() => {setError(""); setLoading(true); setRetry(value => value + 1);}}>Try again</button></p> : null}
      {latest ? <section aria-labelledby="latest-heading" className={styles.hero}>
        <div className={styles.heroMain}>
          <p className={styles.heroMeta}><span className={`${ui.tag} ${ui.tagFeedback}`}>Latest feedback</span><span>{date.format(latest.endedAt)} · {minutes(latest.duration)} · {latest.airport ?? "EGPH"} {modeLabel(latest)}</span></p>
          <h2 id="latest-heading">{latest.title}</h2>
          <figure className={styles.quote}>
            <span className={ui.av} aria-hidden="true">{initials(mentorOf(latest) || "Mentor")}</span>
            <blockquote><p>{latest.feedback}</p><figcaption>{mentorOf(latest) ? `${mentorOf(latest)}, your Mentor` : "Your Mentor"}</figcaption></blockquote>
          </figure>
        </div>
        <div className={styles.heroSide}>
          <span>In this replay</span>
          <div className={styles.tags}><span className={ui.tag}>{recordingLabel(latest)}</span></div>
          <Link className={`${ui.btn} ${ui.primary} ${ui.large}`} href={`/sweatbox/replays/${latest.id}`}>{canPlayReplay(latest) ? "Watch replay" : "View summary"}</Link>
        </div>
      </section> : null}
      <section aria-labelledby="all-heading" className={ui.panel}>
        <div className={ui.panelHead} style={{justifyContent: "space-between"}}><h2 id="all-heading">All your sessions</h2><span className={ui.meta} style={{fontSize: 13}}>Newest first · All times UTC</span></div>
        {replays === null ? <p role="status" className={ui.status}>Loading your replays…</p> : replays.length ? replays.map(replay => {
          const playable = canPlayReplay(replay), mentor = mentorOf(replay);
          return <article key={replay.id} className={styles.item}>
            <div>
              <div className={styles.itemTitle}><h3>{replay.title}</h3>{replay.feedback ? <span className={`${ui.tag} ${ui.tagFeedback}`}>Feedback</span> : <span className={ui.tag}>No feedback</span>}</div>
              <p className={ui.meta}>{[date.format(replay.endedAt), minutes(replay.duration), `${replay.airport ?? "EGPH"} ${modeLabel(replay)}`, mentor && `Mentor ${mentor}`].filter(Boolean).join(" · ")}</p>
              <p className={replay.feedback ? styles.feedback : `${styles.feedback} ${styles.noFeedback}`}>{replay.feedback ?? "Your Mentor didn’t leave feedback for this session."}</p>
            </div>
            <Link className={`${ui.btn} ${playable ? ui.primary : ""}`} href={`/sweatbox/replays/${replay.id}`}>{playable ? "Watch" : "View summary"}<span className={ui.srOnly}> {replay.title}</span></Link>
          </article>;
        }) : <div className={ui.empty}><h3>No replays yet</h3><p>When your Mentor archives a session you took part in, its recording and feedback appear here.</p><Link className={ui.btn} href="/sweatbox/mentee">Back to Your sweatbox</Link></div>}
        {replays?.length && next !== null ? <div className={ui.panelFoot}><span>Showing {replays.length}</span><button type="button" className={ui.btn} disabled={loading} onClick={() => {setLoading(true); setOffset(next);}}>{loading ? "Loading…" : "Load more"}</button></div> : null}
      </section>
    </main>
    <footer className={ui.footer}><TrainerNotice/></footer>
  </div>;
}
