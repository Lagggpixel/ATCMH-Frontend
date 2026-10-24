"use client";
import {useEffect, useRef, useState, useSyncExternalStore} from "react";
import Link from "next/link";
import {ArrowRight} from "@phosphor-icons/react/dist/csr/ArrowRight";
import {DeviceMobile} from "@phosphor-icons/react/dist/csr/DeviceMobile";
import LearningFrame from "../learning/LearningFrame";
import SessionAccess from "./SessionAccess";
import {SessionEntryForm} from "./SessionEntry";
import {sessionJson} from "./shared-transport";
import {sessionPath, type AssignedSession} from "./sessions";
import LibraryFooter from "./LibraryFooter";
import styles from "./MenteeHome.module.css";

const modeLabel = (station?: string) => /:approach$/.test(station ?? "") ? "Approach" : /:center$/.test(station ?? "") ? "Center" : "Ground & Tower";
const ago = (time: number, now: number) => {
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short"}).format(time);
};
function status(session: AssignedSession) {
  if (session.youConnected) return {label: "Open on another page", tone: styles.statusMuted};
  if (session.paused) return {label: "Paused by your mentor", tone: styles.statusMuted};
  if (session.trainerConnected) return {label: `${session.trainerName ?? "Your mentor"} is in the session`, tone: styles.statusLive};
  return {label: "Waiting for your mentor", tone: styles.statusMuted};
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
  return <div className={styles.page}>
    <main className={styles.content}>
      <div className={styles.heading}><h1>Your sweatbox</h1><p>Sessions your mentor has assigned to you.</p></div>
      {error ? <p role="alert" className={styles.error}>Could not refresh your sessions: {error}</p> : null}
      <section aria-label="Assigned sessions" className={styles.assigned} aria-busy={sessions === null}>
        {sessions === null ? <p role="status" className={styles.muted}>Loading your sessions…</p> : !sessions.length ? <div className={styles.empty}><h2>No sessions assigned yet</h2><p>When your mentor assigns you a session it appears here automatically. You can also join with a code or link below.</p></div> :
          sessions.map((session, index) => {
            const state = status(session);
            return <article key={session.id} className={`${styles.card} ${index === 0 && session.trainerConnected ? styles.cardActive : ""}`}>
              <div className={styles.cardText}>
                <div className={styles.cardTitle}><h2>{session.title}</h2><span className={`${styles.status} ${state.tone}`}>{state.label}</span></div>
                <p>{session.airport} · {modeLabel(session.trainingStation)}{session.trainerName ? ` · Mentor ${session.trainerName}` : ""} · Assigned {ago(session.assignedAt, now)}</p>
              </div>
              <Link className={session.trainerConnected ? styles.primary : styles.secondary} href={sessionPath("mentee", session.id)}>Enter session<ArrowRight size={18} aria-hidden="true"/><span className={styles.srOnly}> {session.title}</span></Link>
            </article>;
          })}
      </section>
      <div className={styles.lower}>
        <section aria-labelledby="join-heading" className={styles.panel}>
          <h2 id="join-heading">Have a code or link?</h2>
          <p>Paste the link your mentor sent, or type the session code.</p>
          <SessionEntryForm/>
        </section>
        {tip ? <section aria-labelledby="tip-heading" className={styles.tip}>
          <h2 id="tip-heading"><DeviceMobile size={20} aria-hidden="true"/>On iPhone or iPad?</h2>
          <p>For a proper full screen, tap <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>. Open Sweatbox from that icon from now on. You will sign in once more inside it.</p>
        </section> : null}
      </div>
      <LibraryFooter/>
    </main>
  </div>;
}
