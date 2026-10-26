"use client";
import {useEffect, useRef, useState, useSyncExternalStore} from "react";
import Link from "next/link";
import LearningFrame from "../learning/LearningFrame";
import SessionAccess from "./SessionAccess";
import {SessionEntryForm} from "./SessionEntry";
import TrainerNotice from "./TrainerNotice";
import {sessionJson} from "./shared-transport";
import {canPlayReplay, type ReplaySummary} from "./replays";
import {sessionPath, type AssignedSession} from "./sessions";
import ui from "./Sweatbox.module.css";

const modeLabel = (station?: string) => /:approach$/.test(station ?? "") ? "Approach" : /:center$/.test(station ?? "") ? "Center" : "Ground & Tower";
const date = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", timeZone: "UTC"});
const ago = (time: number, now: number) => {
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : date.format(time);
};
function status(session: AssignedSession) {
  if (session.youConnected) return {label: "Open on another page", tone: ""};
  if (session.paused) return {label: "Paused by your Mentor", tone: ""};
  if (session.trainerConnected) return {label: "Your Mentor is ready", tone: ui.stateLive};
  return {label: "Waiting for your Mentor", tone: ""};
}

/** True only in iOS/iPadOS Safari tabs, where Add to Home Screen is the reliable full-screen route. */
function useHomeScreenTip() {
  return useSyncExternalStore(() => () => {}, () => {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & {standalone?: boolean}).standalone === true;
    return ios && !standalone;
  }, () => false);
}

export default function MenteeHome() {
  return <LearningFrame product="Sweatbox"><SessionAccess embedded allowMentee role="mentee" returnTo="/sweatbox/mentee">{() => <Assigned/>}</SessionAccess></LearningFrame>;
}
function Assigned() {
  const [sessions, setSessions] = useState<AssignedSession[] | null>(null), [error, setError] = useState(""), [now, setNow] = useState(() => Date.now());
  const [last, setLast] = useState<ReplaySummary | null>(null);
  const tip = useHomeScreenTip(), generation = useRef(0);
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
    const load = async () => {
      const current = ++generation.current; controller = new AbortController();
      try {
        const data = await fetch("/api/simulator/sessions?mine=1", {cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)])}).then(sessionJson);
        if (!stopped && current === generation.current) {setSessions(data.sessions); setError(""); setNow(Date.now());}
      } catch (reason) {if (!stopped && !controller.signal.aborted) setError((reason as Error).message);}
      finally {if (!stopped) timer = setTimeout(() => void load(), 5000);}
    };
    void load();
    return () => {stopped = true; clearTimeout(timer); controller?.abort();};
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/simulator/replays?scope=self", {cache: "no-store", signal: controller.signal}).then(sessionJson)
      .then(data => {if (!controller.signal.aborted) setLast((data.replays as ReplaySummary[])[0] ?? null);}).catch(() => {});
    return () => controller.abort();
  }, []);
  // The session your Mentor is already in comes first; otherwise the newest assignment.
  const next = sessions?.find(s => s.trainerConnected && !s.youConnected) ?? sessions?.[0];
  const others = sessions?.filter(s => s !== next) ?? [];
  return <div className={ui.page}>
    <main className={ui.content}>
      <div className={ui.heading}><h1>Your sweatbox</h1></div>
      {error ? <p role="alert" className={ui.error}>Could not refresh your sessions: {error}</p> : null}
      <div aria-busy={sessions === null}>
        {sessions === null ? <p role="status" className={ui.status}>Loading your sessions…</p> : next ? <section aria-labelledby="next-heading" className={ui.next}>
          <div className={ui.itemMain}>
            <span className={`${ui.state} ${status(next).tone}`}>{status(next).tone ? <span className={ui.dot}/> : null}{status(next).label}</span>
            <h2 id="next-heading">{next.title}</h2>{next.positions && next.positions.length > 1 ? <small>You&apos;ll bandbox {next.positions.map(p => p.name).join(" + ")} on {next.positions[0].mhz}, one frequency.</small> : null}
            <small>{next.airport} · {modeLabel(next.trainingStation)}{next.trainerName ? ` · with ${next.trainerName}` : ""} · Assigned {ago(next.assignedAt, now)}</small>
          </div>
          <Link className={`${ui.btn} ${ui.primary} ${ui.large}`} href={sessionPath("mentee", next.id)}>Enter {next.positions?.map(p => p.name).join(" + ") || "session"}<span className={ui.srOnly}> {next.title}</span></Link>
        </section> : <div className={ui.emptyCard}><h2>No sessions assigned yet</h2><p>When your Mentor assigns you a session it appears here by itself. You can also join with a code.</p></div>}
      </div>
      {others.length ? <section className={ui.group} aria-labelledby="more-heading">
        <h2 id="more-heading" className={ui.groupTitle}>Also assigned to you</h2>
        <div className={ui.list}>{others.map(session => <div key={session.id} className={ui.item}><div className={ui.itemRow}>
          <div className={ui.itemMain}><strong>{session.title}</strong><small>{session.airport} · {modeLabel(session.trainingStation)}{session.trainerName ? ` · with ${session.trainerName}` : ""}</small></div>
          <span className={`${ui.state} ${status(session).tone}`}>{status(session).label}</span>
          <Link className={ui.btn} href={sessionPath("mentee", session.id)}>Open<span className={ui.srOnly}> {session.title}</span></Link>
        </div></div>)}</div>
      </section> : null}
      <section className={ui.group} aria-labelledby="join-heading">
        <h2 id="join-heading" className={ui.groupTitle}>Got a code from your Mentor?</h2>
        <SessionEntryForm/>
      </section>
      {last ? <section className={ui.group} aria-labelledby="last-heading">
        <div className={ui.listFoot}><h2 id="last-heading" className={ui.groupTitle}>Your last session</h2><Link href="/sweatbox/mentee/replays" style={{fontWeight: 600, textDecoration: "none"}}>All replays</Link></div>
        <div className={ui.list}><div className={ui.item}><div className={ui.itemRow}>
          <div className={ui.itemMain}><strong>{last.title}</strong><small>{[last.airport ?? "EGPH", date.format(last.endedAt), `${Math.max(1, Math.round(last.duration / 60))} min`].join(" · ")}</small></div>
          <span className={`${ui.state} ${last.feedback ? ui.stateLive : ""}`}>{last.feedback ? "Feedback ready" : "No feedback"}</span>
          <Link className={ui.btn} href={`/sweatbox/replays/${last.id}`}>{canPlayReplay(last) ? "Watch" : "View summary"}<span className={ui.srOnly}> {last.title}</span></Link>
        </div></div></div>
      </section> : null}
      {tip ? <p className={ui.tip}><strong>On iPhone or iPad?</strong> For a proper full screen, tap Share in Safari, then Add to Home Screen, and open Sweatbox from that icon.</p> : null}
    </main>
    <footer className={ui.footer}><TrainerNotice/></footer>
  </div>;
}
