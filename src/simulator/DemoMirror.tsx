"use client";
import {useEffect, useRef, useState, type RefObject} from "react";
import type {MapCamera} from "./scope-camera";
import type {DemoFrame} from "./shared-transport";
import {DEMO_PLAYBACK_DELAY_MS, DEMO_SENT_VISIBLE_MS, demoControl, demoPointerAt, demoPosition, type DemoAnchor, type DemoEvent, type DemoPointer} from "./demonstration";
import styles from "./Simulator.module.css";

const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export type DemoSent = Extract<DemoEvent, {kind: "sent"}>;

/** The trainer's bar across the top of the radar while demonstrating. */
export function DemoTrainerBar({watcher, seconds, connected, onHandBack}: {watcher?: string; seconds: number; connected: boolean; onHandBack: () => void}) {
  return <div className={`${styles.demoBar} ${styles.demoBarTrainer}`} role="status">
    <strong><span className={styles.demoDot} aria-hidden="true"/>Demonstrating</strong>
    <span className={styles.demoBarText}>{watcher ? `${watcher} is watching your pointer and commands.` : "Your mentee is watching your pointer and commands."}</span>
    <time>{clock(seconds)}</time>
    <button type="button" disabled={!connected} onClick={onHandBack}>Hand back controls</button>
  </div>;
}

/** The trainee's bar across the top of the radar, and the card for the trainer's latest command. */
export function DemoTraineeBar({follow, onFollow, sent}: {follow: boolean; onFollow: (follow: boolean) => void; sent: DemoSent | null}) {
  return <>
    <div className={`${styles.demoBar} ${styles.demoBarTrainee}`} role="status">
      <strong>Your mentor is controlling</strong>
      <span className={styles.demoBarText}>Your controls are paused until they hand back.</span>
      <label><input type="checkbox" checked={follow} onChange={event => onFollow(event.target.checked)}/>Follow mentor&apos;s view</label>
    </div>
    {sent ? <DemoSentCard key={sent.id} sent={sent}/> : null}
  </>;
}

/** The trainer's latest command, live on the trainee's radar or in a replay. */
export function DemoSentCard({sent}: {sent: {callsign: string; text: string; path: string[]}}) {
  return <div className={styles.demoSent} role="status" aria-live="polite">
    <span><strong>Mentor sent to {sent.callsign}</strong>{sent.path.length ? <span>{sent.path.join(" › ")}</span> : null}</span>
    <q>{sent.text}</q>
  </div>;
}

interface Ripple {id: number; at: DemoAnchor; until: number}
/** Draws the trainer's pointer, clicks and the control under the pointer on the trainee's screen. */
export function DemoGhost({subscribe, root, camera}: {subscribe: (listener: (frame: DemoFrame) => void) => () => void; root: RefObject<HTMLElement | null>; camera: () => MapCamera | undefined}) {
  const cursor = useRef<HTMLDivElement>(null), ring = useRef<HTMLDivElement>(null);
  const samples = useRef<DemoPointer[]>([]), offset = useRef<number | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const pending = useRef<Ripple[]>([]);
  useEffect(() => {
    let serial = 0;
    return subscribe(frame => {
      const now = performance.now();
      for (const batch of frame.batches) {
        // The trainer's clock maps onto ours through the fastest delivery seen so far.
        const gap = now - batch.sentAt;
        offset.current = offset.current === null || gap < offset.current ? gap : offset.current;
        samples.current.push(...batch.pointer);
        for (const event of batch.events) if (event.kind === "click") pending.current.push({id: ++serial, at: event.at, until: event.t});
      }
      samples.current.sort((a, b) => a.t - b.t);
      if (samples.current.length > 400) samples.current.splice(0, samples.current.length - 400);
    });
  }, [subscribe]);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const element = root.current;
      if (!element || offset.current === null) return;
      const time = performance.now() - offset.current - DEMO_PLAYBACK_DELAY_MS;
      const due = pending.current.filter(ripple => ripple.until <= time);
      if (due.length) {
        pending.current = pending.current.filter(ripple => ripple.until > time);
        setRipples(current => [...current.filter(ripple => ripple.until + 700 > time), ...due.map(ripple => ({...ripple, until: time}))].slice(-6));
      }
      while (samples.current.length > 2 && samples.current[1].t < time - 1000) samples.current.shift();
      const sample = demoPointerAt(samples.current, time);
      const scopeElement = element.querySelector<HTMLElement>("[data-simulator-tour=radar]"), scopeCamera = camera();
      const scope = scopeElement && scopeCamera ? {element: scopeElement, camera: scopeCamera} : undefined;
      const position = sample ? demoPosition(element, sample.at, scope) : null;
      // The ghost layer is fixed to the viewport, so client coordinates place it directly.
      const bounds = {left: 0, top: 0};
      if (cursor.current) {
        cursor.current.hidden = !position;
        if (position) cursor.current.style.transform = `translate(${position.x - bounds.left}px, ${position.y - bounds.top}px)`;
        cursor.current.dataset.down = sample?.down ? "true" : "false";
      }
      const control = sample ? demoControl(element, sample.at) : null;
      if (ring.current) {
        const box = control?.getBoundingClientRect();
        ring.current.hidden = !box?.width;
        if (box?.width) Object.assign(ring.current.style, {left: `${box.left - bounds.left - 3}px`, top: `${box.top - bounds.top - 3}px`, width: `${box.width + 6}px`, height: `${box.height + 6}px`});
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [root, camera]);
  const place = (at: DemoAnchor) => {
    const element = root.current, scopeElement = element?.querySelector<HTMLElement>("[data-simulator-tour=radar]"), scopeCamera = camera();
    const position = element ? demoPosition(element, at, scopeElement && scopeCamera ? {element: scopeElement, camera: scopeCamera} : undefined) : null;
    return position ? {left: position.x, top: position.y} : null;
  };
  return <div className={styles.demoGhostLayer} aria-hidden="true">
    <div ref={ring} className={styles.demoHighlight} hidden/>
    {ripples.map(ripple => {const at = place(ripple.at); return at ? <span key={ripple.id} className={styles.demoRipple} style={at}/> : null;})}
    <div ref={cursor} className={styles.demoCursor} hidden>
      <svg width="22" height="28" viewBox="0 0 22 28"><path d="M2 2 L2 22 L7.5 17 L11 25 L14.5 23.5 L11 15.8 L18.5 15.5 Z"/></svg>
      <span>Mentor</span>
    </div>
  </div>;
}

/** Keeps only sent commands the trainee can still read. */
export function useLatestSent() {
  const [sent, setSent] = useState<DemoSent | null>(null);
  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(current => current === sent ? null : current), DEMO_SENT_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [sent]);
  return [sent, setSent] as const;
}
