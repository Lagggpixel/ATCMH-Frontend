"use client";
import {useEffect, useRef, useState, useSyncExternalStore} from "react";
import Link from "next/link";
import {ArrowRight} from "@phosphor-icons/react/dist/csr/ArrowRight";
import {DeviceMobile} from "@phosphor-icons/react/dist/csr/DeviceMobile";
import {ClockCounterClockwise} from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import {UserCircle} from "@phosphor-icons/react/dist/csr/UserCircle";
import {Path} from "@phosphor-icons/react/dist/csr/Path";
import {Pause} from "@phosphor-icons/react/dist/csr/Pause";
import LearningFrame from "../learning/LearningFrame";
import {usePortalAuth} from "../platform/auth/PortalAuthProvider";
import SessionAccess from "./SessionAccess";
import {SessionEntryForm} from "./SessionEntry";
import TrainerNotice from "./TrainerNotice";
import {sessionJson} from "./shared-transport";
import {initials, viewerName} from "./session-status";
import {sessionPath, type AssignedSession} from "./sessions";
import ui from "./Sweatbox.module.css";
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
  if (session.youConnected) return {label: "Open on another page", tone: ui.idle};
  if (session.paused) return {label: "Paused by your Mentor", tone: ui.idle};
  if (session.trainerConnected) return {label: `${session.trainerName ?? "Your Mentor"} is in the session`, tone: ui.live};
  return {label: "Waiting for your Mentor", tone: ui.idle};
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
  const name = viewerName(usePortalAuth());
  return <LearningFrame product="Sweatbox"><SessionAccess embedded allowMentee role="mentee" returnTo="/sweatbox/mentee">{() => <Assigned name={name}/>}</SessionAccess></LearningFrame>;
}
function Assigned({name}: {name: string}) {
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
  // The session your Mentor is already in comes first; otherwise the newest assignment.
  const next = sessions?.find(s => s.trainerConnected && !s.youConnected) ?? sessions?.[0];
  const others = sessions?.filter(s => s !== next) ?? [];
  const lead = sessions === null ? "Checking for sessions…" : !next ? "Nothing is assigned to you right now." : next.trainerConnected ? "Your Mentor is in the session and ready when you are." : "Your next session is ready to open.";
  return <div className={ui.page}>
    <main className={`${ui.content} ${ui.narrow}`}>
      <div className={ui.heading}><div><h1>{name ? `Hi ${name}` : "Your sweatbox"}</h1><p>{lead}</p></div></div>
      {error ? <p role="alert" className={ui.error}>Could not refresh your sessions: {error}</p> : null}
      <div className={ui.cols}>
        <div className={ui.stack} aria-busy={sessions === null}>
          {sessions === null ? <p role="status" className={ui.status}>Loading your sessions…</p> : next ? <section aria-labelledby="next-heading" className={`${ui.card} ${styles.next}`}>
            <p><span className={`${ui.pill} ${status(next).tone}`}><span className={ui.dot}/>{status(next).label}</span></p>
            <div><h2 id="next-heading">{next.title}</h2><p className={ui.meta}>{next.airport} · {modeLabel(next.trainingStation)} · Assigned {ago(next.assignedAt, now)}</p></div>
            <div className={styles.nextFoot}>
              <div className={ui.person}><span className={ui.av} aria-hidden="true">{initials(next.trainerName ?? "Mentor")}</span><span><small>Your Mentor</small><strong>{next.trainerName ?? "Your Mentor"}</strong></span></div>
              <Link className={`${ui.btn} ${ui.primary} ${ui.large}`} href={sessionPath("mentee", next.id)}>Enter session<ArrowRight size={20} aria-hidden="true"/><span className={ui.srOnly}> {next.title}</span></Link>
            </div>
          </section> : <div className={ui.emptyCard}><h2>No sessions assigned yet</h2><p>When your Mentor assigns you a session it appears here automatically. You can also join with a code or link.</p></div>}
          <section aria-labelledby="briefing-heading" className={styles.briefing}>
            <h2 id="briefing-heading">Three things before your first session</h2>
            <ul>
              <li><UserCircle size={24} aria-hidden="true"/><span><strong>You are the controller</strong><small>Your Mentor flies every aircraft and plays the pilots. You give the instructions.</small></span></li>
              <li><Path size={24} aria-hidden="true"/><span><strong>Drag to give a taxi route</strong><small>Click an aircraft, then drag along the taxiways on the scope and send the instruction.</small></span></li>
              <li><Pause size={24} aria-hidden="true"/><span><strong>Paused means talk</strong><small>When your Mentor pauses, everything freezes so you can go over what happened. Nothing is lost.</small></span></li>
            </ul>
            <p className={ui.meta}>A short tour starts the first time you enter a session. You can replay it from Help.</p>
          </section>
          {others.length ? <section aria-labelledby="more-heading">
            <h2 id="more-heading" className={ui.sectionTitle}>Also assigned to you</h2>
            <div className={ui.panel}>{others.map(session => <div key={session.id} className={styles.other}>
              <div><strong>{session.title}</strong><small>{session.airport} · {modeLabel(session.trainingStation)}{session.trainerName ? ` · Mentor ${session.trainerName}` : ""} · Assigned {ago(session.assignedAt, now)}</small></div>
              <span className={`${ui.pill} ${status(session).tone}`}><span className={ui.dot}/>{status(session).label}</span>
              <Link className={ui.btn} href={sessionPath("mentee", session.id)}>Open<span className={ui.srOnly}> {session.title}</span></Link>
            </div>)}</div>
          </section> : null}
        </div>
        <aside className={ui.aside} aria-label="More">
          <section aria-labelledby="join-heading" className={ui.box}>
            <h2 id="join-heading">Got a code or link?</h2>
            <p>Paste what your Mentor sent you, or type the session code.</p>
            <SessionEntryForm/>
          </section>
          <Link href="/sweatbox/mentee/replays" className={`${ui.box} ${styles.replaysLink}`}>
            <ClockCounterClockwise size={24} aria-hidden="true"/>
            <span><strong>Your replays</strong><small>Watch past sessions and read your Mentor’s feedback.</small></span>
            <ArrowRight size={18} aria-hidden="true"/>
          </Link>
          {tip ? <section aria-labelledby="tip-heading" className={ui.inset}>
            <h2 id="tip-heading"><DeviceMobile size={20} aria-hidden="true"/>On iPhone or iPad?</h2>
            <p>For a proper full screen, tap <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>. Open Sweatbox from that icon from now on. You will sign in once more inside it.</p>
          </section> : null}
        </aside>
      </div>
    </main>
    <footer className={ui.footer}><TrainerNotice/></footer>
  </div>;
}
