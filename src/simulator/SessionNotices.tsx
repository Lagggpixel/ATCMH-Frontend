"use client";
import type {ReactNode} from "react";
import Link from "next/link";
import TrainerNotice from "./TrainerNotice";
import styles from "./SessionNotices.module.css";

/** The live page's role words, so each host keeps its own wording (Trainer/Trainee or Mentor/Mentee). */
export interface NoticeWords {trainer: string; trainee: string}
type Step = "done" | "now" | "next";

function Frame({tone, icon, title, text, children, code}: {tone: "info" | "wait" | "done"; icon: ReactNode; title: string; text?: ReactNode; children?: ReactNode; code?: string}) {
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.brand}>ATCMH Sweatbox</Link></header>
    <div className={styles.center}>
      <section className={styles.card} aria-labelledby="session-notice-title">
        <span className={styles.icon} data-tone={tone} aria-hidden="true">{icon}</span>
        <div><h1 id="session-notice-title">{title}</h1>{text ? <p className={styles.text}>{text}</p> : null}</div>
        {children}
        {code ? <p className={styles.code}>Session <span>{code}</span></p> : null}
      </section>
    </div>
    <footer className={styles.footer}><TrainerNotice/></footer>
  </main>;
}
const Spinner = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={styles.spin}><path d="M12 3a9 9 0 1 1-9 9"/></svg>;
const Windows = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="3" y="7" width="13" height="11" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3"/></svg>;
const Person = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const Check = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>;
const Alert = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>;

/** Shown until the first frame arrives: the steps a page goes through to take its seat. */
export function JoiningNotice({status, code, seat, exit}: {status: string; code?: string; seat: string; exit: {href: string; label: string}}) {
  const reconnecting = /reconnect/i.test(status);
  const steps: [string, Step][] = [["Signed in", "done"], [reconnecting ? "Reconnecting to the saved session" : `Taking your ${seat} seat`, "now"], ["Loading radar and traffic", "next"]];
  return <Frame tone="info" icon={<Spinner/>} title={reconnecting ? "Reconnecting" : "Joining session"} text="This usually takes a few seconds." code={code}>
    <ol className={styles.steps}>{steps.map(([label, state]) => <li key={label} data-state={state}><span aria-hidden="true">{state === "done" ? "✓" : ""}</span>{label}<span className={styles.srOnly}>{state === "done" ? " (done)" : state === "now" ? " (in progress)" : ""}</span></li>)}</ol>
    <div className={styles.actions}><Link href={exit.href} className={styles.link}>Cancel</Link></div>
  </Frame>;
}

export interface FailureProps {
  code: string | null; message: string; detail?: Record<string, unknown>; sessionCode?: string; staff: boolean; words: NoticeWords;
  exit: {href: string; label: string}; onRetry: () => void; onTakeOver: () => void; replayHref: (id: string) => string;
}
const minutes = (seconds: number) => seconds >= 3600 ? `${Math.floor(seconds / 3600)} h ${Math.round(seconds % 3600 / 60)} min` : `${Math.max(1, Math.round(seconds / 60))} min`;
const when = (time: number) => new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC"}).format(time) + " UTC";

/** A page that cannot hold its seat: open elsewhere, taken by someone else, ended, or unavailable. */
export function SessionFailureNotice({code, message, detail = {}, sessionCode, staff, words, exit, onRetry, onTakeOver, replayHref}: FailureProps) {
  const back = <Link href={exit.href} className={styles.link}>{exit.label}</Link>;
  const seat = detail.role === "staff" ? words.trainer : words.trainee;
  // The transport keeps retrying a busy seat; say so instead of repeating it in the message.
  const retrying = /Retrying automatically/.test(message);
  if (code === "seat-open-elsewhere") return <Frame tone="wait" icon={<Windows/>} title="You already have this session open"
    text={`Your ${seat.toLowerCase()} seat is open in another tab or on another device. Only one page can hold it at a time.`} code={sessionCode}>
    <div className={styles.actions}><button type="button" className={styles.primary} onClick={onTakeOver}>Move the seat here</button><button type="button" className={styles.secondary} onClick={onRetry}>Try again</button>{back}</div>
    {retrying ? <p className={styles.hint}>This page also checks again every few seconds, so closing the other page is enough.</p> : null}
  </Frame>;
  if (code === "seat-occupied") {
    const holder = typeof detail.holder === "string" ? detail.holder : undefined;
    return <Frame tone="wait" icon={<Person/>} title={`The ${seat} seat is taken`}
      text={`${holder ?? "Someone else"} is in this session as ${seat.toLowerCase()}. Only one person can hold a seat at a time.`} code={sessionCode}>
      {holder ? <div className={styles.box}><span className={styles.stripe} data-tone="live" aria-hidden="true"/><div><strong>{holder}</strong><small>{seat} · connected now</small></div></div> : null}
      <div className={styles.actions}><button type="button" className={styles.secondary} onClick={onRetry}>Try again</button>{back}</div>
      {retrying ? <p className={styles.hint}>This page checks again every few seconds and joins as soon as the seat is free.</p> : null}
    </Frame>;
  }
  if (code === "ended") {
    const replayId = typeof detail.replayId === "string" ? detail.replayId : undefined, trainer = typeof detail.trainer === "string" ? detail.trainer : undefined;
    const endedAt = typeof detail.endedAt === "number" ? detail.endedAt : undefined, duration = typeof detail.duration === "number" ? detail.duration : undefined;
    const feedback = typeof detail.feedback === "string" ? detail.feedback : undefined, title = typeof detail.title === "string" ? detail.title : undefined;
    return <Frame tone="done" icon={<Check/>} title="This session has ended" text={`${endedAt ? `It ended ${when(endedAt)}. ` : ""}Everything in it was saved.`} code={sessionCode}>
      {replayId ? <div className={styles.box}><span className={styles.stripe} aria-hidden="true"/><div><strong>Replay ready</strong><small>{[duration !== undefined ? minutes(duration) : "", title].filter(Boolean).join(" · ")}</small></div></div> : null}
      {feedback ? <blockquote className={styles.feedback}><span>Feedback{trainer ? ` from ${trainer}` : ""}</span>{feedback}</blockquote> : null}
      <div className={styles.actions}>{replayId ? <Link href={replayHref(replayId)} className={styles.primary}>{staff ? "Open replay" : "Watch replay"}</Link> : null}{back}</div>
    </Frame>;
  }
  const missing = code === "not-found";
  return <Frame tone="wait" icon={<Alert/>} title={missing ? "Session unavailable" : "Could not join session"} text={message} code={sessionCode}>
    <div className={styles.actions}>{missing ? null : <button type="button" className={styles.secondary} onClick={onRetry}>Try again</button>}{back}</div>
  </Frame>;
}
