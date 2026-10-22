"use client";
import {useState, useSyncExternalStore, type RefObject} from "react";
import {ArrowsOut} from "@phosphor-icons/react/dist/csr/ArrowsOut";
import {ArrowsIn} from "@phosphor-icons/react/dist/csr/ArrowsIn";
import styles from "./Simulator.module.css";

function subscribe(listener: () => void) {
  document.addEventListener("fullscreenchange", listener);
  return () => document.removeEventListener("fullscreenchange", listener);
}

export default function FullscreenButton({target}: {target: RefObject<HTMLElement | null>}) {
  const state = useSyncExternalStore(subscribe, () => target.current && document.fullscreenElement === target.current ? 2
    : document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function" ? 1 : 0, () => 0);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!state) return null;
  const active = state === 2, label = active ? "Exit fullscreen" : "Enter fullscreen";
  return <span className={styles.fullscreenControl}>
    <button type="button" aria-label={label} title={label} aria-pressed={active} disabled={busy} onClick={async () => {
      if (!target.current || busy) return;
      setBusy(true); setError("");
      try {
        if (active) await document.exitFullscreen();
        else await target.current.requestFullscreen();
      } catch {setError("Fullscreen could not open or close. Please try again.");}
      finally {setBusy(false);}
    }}>{active ? <ArrowsIn size={20} aria-hidden="true"/> : <ArrowsOut size={20} aria-hidden="true"/>}<span>{active ? "Exit fullscreen" : "Fullscreen"}</span></button>
    {error ? <span role="status">{error}</span> : null}
  </span>;
}
