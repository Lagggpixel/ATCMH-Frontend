"use client";
import type {ReactNode} from "react";
import {CaretDown} from "@phosphor-icons/react/dist/csr/CaretDown";
import type {SessionTone} from "./session-status";
import styles from "./SessionRow.module.css";

/** Whether the person is here now, expected (the session is running without them), or simply not in. */
export type Presence = "on" | "wait" | "off";
export const Dot = ({state}: {state: Presence}) => <span className={styles.dot} data-state={state} aria-hidden="true"/>;

/**
 * One session on the Sessions page: airport, title, mode and who runs it, a status pill, Enter, and the seats as chips.
 * Each host passes its own Enter link, seats and expanded details so its wording and actions stay its own.
 */
export function SessionRow({id, airport, title, mode, trainerLabel, trainer, trainerPresence, status, tone, enter, seats, open, onToggle, details, tour}: {
  id: string; airport: string; title: string; mode: string; trainerLabel: string; trainer: string; trainerPresence: Presence;
  status: string; tone: SessionTone; enter: ReactNode; seats: ReactNode; open: boolean; onToggle: () => void; details?: ReactNode; tour?: string;
}) {
  return <div id={`session-${id}`} className={styles.row} data-open={open || undefined}>
    <div className={styles.top}>
      <span className={styles.badge} aria-hidden="true">{airport}</span>
      <div className={styles.main}>
        <strong className={styles.title}>{title}</strong>
        <small className={styles.mode}><span className={styles.phoneAirport}>{airport} · </span><span className={styles.srOnly}>{airport} · </span>{mode}</small>
        <span className={styles.trainer}>{trainerLabel}<Dot state={trainerPresence}/><strong>{trainer || "Nobody yet"}</strong><span className={styles.srOnly}>{trainerPresence === "on" ? " (connected)" : " (not connected)"}</span></span>
      </div>
      <span className={styles.pill} data-tone={tone}><span aria-hidden="true"/>{status}</span>
      <span className={styles.enter}>{enter}</span>
      <button type="button" className={styles.caret} aria-expanded={open} aria-controls={`session-details-${id}`} aria-label={`${open ? "Hide" : "Show"} details for ${title}`} onClick={onToggle}><CaretDown size={18} aria-hidden="true"/></button>
      <div className={styles.seats}>{seats}</div>
    </div>
    {open ? <div id={`session-details-${id}`} className={styles.panel} data-simulator-tour={tour}>{details}</div> : null}
  </div>;
}

/** The single trainee seat of a session without split positions, drawn like a position chip. */
export function SeatChip({label, person, presence, assign}: {label: string; person?: string; presence: Presence; assign?: ReactNode}) {
  return <ul className={styles.chips} aria-label={`${label} seat`}><li data-empty={!person || undefined}>
    <strong>{label}</strong>
    {person ? <span className={styles.person}><Dot state={presence}/>{person}<span className={styles.srOnly}>{presence === "on" ? " (connected)" : " (not joined yet)"}</span></span> : assign ?? <span className={styles.muted}>Open</span>}
  </li></ul>;
}

/** "Show 4 sessions idle for over a week" at the foot of the Not running list. */
export function OlderFold({count, onShow}: {count: number; onShow: () => void}) {
  return <button type="button" className={styles.fold} onClick={onShow}><CaretDown size={16} aria-hidden="true"/>Show {count} {count === 1 ? "session" : "sessions"} idle for over a week</button>;
}
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const rowStyles = styles;
