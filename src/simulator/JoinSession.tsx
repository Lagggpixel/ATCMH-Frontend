"use client";
import {useEffect, useState} from "react";
import Link from "next/link";
import LearningFrame from "../learning/LearningFrame";
import SessionAccess from "./SessionAccess";
import {previewSession, SessionEntryForm} from "./SessionEntry";
import {joinPath, sessionPath, type SessionPreview} from "./sessions";
import styles from "./MenteeHome.module.css";

export default function JoinSession({code = ""}: {code?: string}) {
  return <LearningFrame product="Sweatbox"><SessionAccess embedded allowMentee role="mentee" returnTo={code ? joinPath(code) : "/sweatbox/join"}>{() => <Join code={code}/>}</SessionAccess></LearningFrame>;
}
function Join({code}: {code: string}) {
  const [preview, setPreview] = useState<SessionPreview | null>(null), [error, setError] = useState(""), [checking, setChecking] = useState(Boolean(code));
  useEffect(() => {
    if (!code) return;
    const controller = new AbortController();
    previewSession(code, controller.signal).then(setPreview).catch(reason => {if (!controller.signal.aborted) setError((reason as Error).message);})
      .finally(() => {if (!controller.signal.aborted) setChecking(false);});
    return () => controller.abort();
  }, [code]);
  return <div className={styles.page}><main className={`${styles.content} ${styles.narrow}`}>
    <div className={styles.heading}><h1>Join a session</h1><p>Use the code or link your mentor shared.</p></div>
    {checking ? <p role="status" className={styles.muted}>Checking the session…</p> : preview ? <section className={`${styles.card} ${styles.cardActive}`} aria-label="Session found">
      <div className={styles.cardText}><div className={styles.cardTitle}><h2>{preview.title}</h2>{preview.assignedToYou ? <span className={`${styles.status} ${styles.statusLive}`}>Assigned to you</span> : null}</div>
        <p>{preview.airport}{preview.trainerName ? ` · Mentor ${preview.trainerName}` : ""}</p></div>
      <div className={styles.entryActions}><button type="button" className={styles.secondary} onClick={() => setPreview(null)}>Different code</button><Link className={styles.primary} href={sessionPath("mentee", preview.id)}>Join session</Link></div>
    </section> : <section className={styles.panel}>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <SessionEntryForm initial={code} onResolved={value => {setError(""); setPreview(value);}}/>
    </section>}
    <p className={styles.muted}><Link href="/sweatbox/mentee">Go to Your sweatbox</Link></p>
  </main></div>;
}
