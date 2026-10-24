"use client";
import {useState, useSyncExternalStore} from "react";
import {ClipboardText} from "@phosphor-icons/react/dist/csr/ClipboardText";
import {parseSessionEntry, sessionPath, type SessionPreview} from "./sessions";
import {sessionJson} from "./shared-transport";
import styles from "./MenteeHome.module.css";

export async function previewSession(input: string, signal?: AbortSignal): Promise<SessionPreview> {
  const entry = parseSessionEntry(input);
  if (!entry) throw new Error("Enter a session code like EGPH-0123456789AB, or paste the link from your mentor.");
  const query = "id" in entry ? `session=${entry.id}` : `code=${encodeURIComponent(entry.code)}`;
  return (await fetch(`/api/simulator/sessions?${query}`, {cache: "no-store", signal}).then(sessionJson)).session as SessionPreview;
}

/** One field for a typed code or a pasted link. Links from Discord open in Safari, not the Home Screen app, so Paste matters. */
export function SessionEntryForm({initial = "", onResolved}: {initial?: string; onResolved?: (preview: SessionPreview) => void}) {
  const [value, setValue] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const canPaste = useSyncExternalStore(() => () => {}, () => typeof navigator.clipboard?.readText === "function", () => false);
  const join = async (input = value) => {
    setBusy(true); setError("");
    try {
      const preview = await previewSession(input);
      if (onResolved) {onResolved(preview); setBusy(false);}
      else window.location.assign(sessionPath("mentee", preview.id));
    } catch (reason) {setError((reason as Error).message); setBusy(false);}
  };
  const paste = async () => {
    try {const text = (await navigator.clipboard.readText()).trim(); if (text) {setValue(text); void join(text);}}
    catch {setError("Paste was blocked. Long-press the field and choose Paste instead.");}
  };
  return <form className={styles.entryForm} onSubmit={e => {e.preventDefault(); void join();}}>
    <label>Session code or link
      <input value={value} onChange={e => setValue(e.target.value)} placeholder="EGPH-0123456789AB" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} required disabled={busy} enterKeyHint="go"/>
    </label>
    <div className={styles.entryActions}>
      {canPaste ? <button type="button" onClick={() => void paste()} disabled={busy}><ClipboardText size={18} aria-hidden="true"/>Paste</button> : null}
      <button className={styles.primary} disabled={busy}>{busy ? "Checking…" : "Join"}</button>
    </div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </form>;
}
