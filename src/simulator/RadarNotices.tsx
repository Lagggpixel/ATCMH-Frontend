"use client";
import {useEffect, useRef, useState} from "react";
import {X} from "@phosphor-icons/react/dist/csr/X";
import type {Exercise} from "./model";
import {EMPTY_SEAT_MEMORY, mergeSeatNotices, seatNoticeUpdate, traineeSeats, type SeatNotice} from "./seat-presence";
import styles from "./Simulator.module.css";

export const REWIND_TOAST_MS = 6000;
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
/** "30 s", "1 min", "2 min 30 s": how far a rewind went. */
export const rewindLength = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds)), minutes = Math.floor(whole / 60), rest = whole % 60;
  return minutes ? `${minutes} min${rest ? ` ${rest} s` : ""}` : `${rest} s`;
};

type Seats = Parameters<typeof traineeSeats>[0];
/** Staff notices for trainee seats: join, rejoin and disconnect, running or paused. They stay until closed. */
export function useSeatNotices(session: Seats, running: boolean, enabled: boolean) {
  const [notices, setNotices] = useState<SeatNotice[]>([]);
  const memory = useRef<{seen: boolean; value: typeof EMPTY_SEAT_MEMORY}>({seen: false, value: EMPTY_SEAT_MEMORY});
  const seats = traineeSeats(session), signature = JSON.stringify(seats);
  useEffect(() => {
    if (!enabled) return;
    const update = seatNoticeUpdate(memory.current.value, seats, Date.now(), running, !memory.current.seen);
    memory.current = {seen: true, value: update.memory};
    if (update.notices.length) setNotices(current => mergeSeatNotices(current, update.notices));
    // The seats' contents, not the array's identity, decide whether anything changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled]);
  return {notices, close: (id: string) => setNotices(current => current.filter(notice => notice.id !== id))};
}

/** Use the first live snapshot as the baseline. A null rewind means it has not arrived yet. */
export function useRewindToast(rewind: Exercise["rewind"] | null) {
  const [shown, setShown] = useState<NonNullable<Exercise["rewind"]> | null>(null);
  const lastSeenId = useRef<string | undefined | null>(null);
  const id = rewind === null ? null : rewind?.id;
  useEffect(() => {
    if (id === null) return;
    const previousId = lastSeenId.current;
    lastSeenId.current = id;
    if (!rewind || previousId === null || previousId === id) return;
    const show = requestAnimationFrame(() => setShown(rewind));
    const hide = setTimeout(() => setShown(current => current?.id === id ? null : current), REWIND_TOAST_MS);
    return () => {cancelAnimationFrame(show); clearTimeout(hide);};
    // Only a new rewind restarts the toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return {rewind: shown?.id === id ? shown : null, close: () => setShown(null)};
}

/** Top right of the radar: seat notices and the rewind toast, newest on top. */
export function RadarNotices({notices, onClose, rewind, onCloseRewind, rewindBy}: {notices: readonly SeatNotice[]; onClose: (id: string) => void; rewind?: NonNullable<Exercise["rewind"]> | null; onCloseRewind?: () => void; /** Replays say who rewound. */ rewindBy?: string}) {
  if (!notices.length && !rewind) return null;
  return <div className={styles.radarNotices}>
    {rewind ? <div key={rewind.id} className={styles.rewindToast} role="status" aria-live="polite">
      <div><strong>{rewindBy ? `${rewindBy} rewound` : "Rewound"} {rewindLength(rewind.from - rewind.to)}</strong><span>{clock(rewind.from)} → {clock(rewind.to)} · session paused</span></div>
      <button type="button" aria-label="Close" onClick={onCloseRewind}><X aria-hidden="true" weight="bold"/></button>
      <span className={styles.rewindToastBar} style={{animationDuration: `${REWIND_TOAST_MS}ms`}} aria-hidden="true"/>
    </div> : null}
    {notices.map(notice => <div key={notice.id} className={styles.seatNotice} data-kind={notice.kind} role="status" aria-live="polite">
      <span className={styles.seatNoticeDot} aria-hidden="true"/><p>{notice.text}</p>
      <button type="button" aria-label="Close notice" onClick={() => onClose(notice.id)}><X aria-hidden="true" weight="bold"/></button>
    </div>)}
  </div>;
}
