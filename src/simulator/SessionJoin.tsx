"use client";
import {useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import SessionAccess, {SessionNotice} from "./SessionAccess";
import {sessionPath} from "./sessions";
import {sessionJson} from "./shared-transport";
import styles from "./Sessions.module.css";

export default function SessionJoin() {
  const [value, setValue] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false); const router = useRouter();
  return <SessionAccess role="mentee" returnTo="/simulator/mentee">{() => <SessionNotice title="Join your training session"><Link href="/simulator/mentee/assignments">My simulator assignments →</Link><p>Open the mentee link from your staff member, or enter the session code below.</p><form onSubmit={async e => {
    e.preventDefault(); let id = value.trim();
    try {if (id.startsWith("http")) {const url = new URL(id); if (url.origin !== window.location.origin) throw new Error(); id = url.pathname.split("/").at(-1) ?? "";}} catch {setError("Enter a mentee link from this website."); return;}
    if (/^EGPH-[0-9a-f]{8}$/i.test(id)) {
      setBusy(true); setError("");
      try {const data = await fetch(`/api/simulator/sessions?code=${encodeURIComponent(id)}`, {cache: "no-store"}).then(sessionJson); router.push(sessionPath("mentee", data.sessionId));}
      catch (reason) {setError((reason as Error).message);} finally {setBusy(false);}
      return;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {setError("Enter the session code or the mentee link your staff member shared."); return;}
    router.push(sessionPath("mentee", id.toLowerCase()));
  }}><label>Session code or mentee link<input required autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder="EGPH-1234ABCD or mentee link" maxLength={300}/></label>{error ? <p role="alert" className={styles.error}>{error}</p> : null}<button className={styles.primary} disabled={busy}>{busy ? "Joining…" : "Join session"}</button></form></SessionNotice>}</SessionAccess>;
}
