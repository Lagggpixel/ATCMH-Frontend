"use client";
import {useState, useSyncExternalStore} from "react";
import {CaretDown} from "@phosphor-icons/react/dist/csr/CaretDown";
import {CaretUp} from "@phosphor-icons/react/dist/csr/CaretUp";
import {Check} from "@phosphor-icons/react/dist/csr/Check";
import {Prohibit} from "@phosphor-icons/react/dist/csr/Prohibit";
import {X} from "@phosphor-icons/react/dist/csr/X";
import {CONFLICT_TITLES, conflictCards, trackFinished} from "./conflict-overlay";
import type {ConflictKind, TrainingConflict} from "./training-conflicts";
import type {Aircraft} from "./model";
import styles from "./ConflictOverlay.module.css";

const collapsedKey = (accountId: string) => `sweatbox.conflicts.collapsed.${accountId}`;
const readCollapsed = (accountId: string) => {try {return window.localStorage.getItem(collapsedKey(accountId)) === "true";} catch {return false;}};

/** Staff-only training conflict status, stacked over the top left of the scope. */
export default function ConflictOverlay({accountId, conflicts, aircraft, elapsed, pairing, enabled, onCancel, onCancelPairing}: {
  accountId: string; conflicts?: readonly TrainingConflict[]; aircraft: readonly Aircraft[]; elapsed: number;
  pairing: {kind: ConflictKind; callsign?: string} | null; enabled: boolean; onCancel: (conflictId: string) => void; onCancelPairing: () => void;
}) {
  const [finishedAt, setFinishedAt] = useState(() => {
    const initial = new Map<string, number>();
    trackFinished(conflicts, elapsed, initial, true);
    return initial;
  });
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const savedCollapsed = useSyncExternalStore(() => () => {}, () => readCollapsed(accountId), () => false);
  const [collapsedOverride, setCollapsed] = useState<boolean | null>(null);
  const collapsed = collapsedOverride ?? savedCollapsed;
  let timestamps = finishedAt;
  if (conflicts?.some(c => (c.phase === "complete" || c.phase === "cancelled") && !finishedAt.has(c.id))) {
    timestamps = new Map(finishedAt);
    trackFinished(conflicts, elapsed, timestamps, false);
    setFinishedAt(timestamps);
  }
  const cards = conflictCards(conflicts, aircraft, elapsed, timestamps, dismissed);
  const live = cards.filter(c => !c.finished);
  if (!cards.length && !pairing) return null;
  const toggle = () => {const next = !collapsed; setCollapsed(next); try {window.localStorage.setItem(collapsedKey(accountId), String(next));} catch { /* Collapsing still works for this page. */ }};
  const badge = (kind: ConflictKind) => <span className={styles.badge} data-kind={kind}>{CONFLICT_TITLES[kind].badge}</span>;
  if (collapsed && !pairing) return <div className={styles.overlay} data-conflict-overlay onContextMenu={event => event.stopPropagation()}>
    <button className={styles.chip} onClick={toggle} aria-expanded="false" aria-label={`Show training conflicts, ${live.length} active`}>
      <span className={styles.heading}>Conflicts</span>{[...new Set(live.map(c => c.kind))].map(kind => <span key={kind}>{badge(kind)}</span>)}{live.length ? null : <span className={styles.count}>0 active</span>}<CaretDown aria-hidden="true"/>
    </button>
  </div>;
  return <section className={styles.overlay} data-conflict-overlay aria-label="Training conflicts" onContextMenu={event => event.stopPropagation()}>
    <header className={styles.header}>
      <span className={styles.heading}>Conflicts</span><span className={styles.count}>{live.length} active</span>
      <button className={styles.icon} onClick={toggle} aria-expanded="true" aria-label="Hide training conflicts"><CaretUp aria-hidden="true"/></button>
    </header>
    {pairing ? <article className={`${styles.card} ${styles.pairing}`} role="status">
      <div className={styles.title}>{badge(pairing.kind)}<strong>Pick the {pairing.kind === "cancel-takeoff" ? "ground aircraft" : pairing.kind === "ga" ? "following arrival" : "second aircraft"}</strong></div>
      <p>Click {pairing.kind === "cancel-takeoff" ? "a ground aircraft" : "another aircraft"} on the scope to pair with <span className={styles.callsign}>{pairing.callsign ?? "the first aircraft"}</span>.</p>
      <div className={styles.pairingFooter}><span>Esc to cancel</span><button onClick={onCancelPairing}>Cancel</button></div>
    </article> : null}
    {cards.map(card => card.finished ? <div key={card.id} className={styles.finished} role="status">
      {card.cancelled ? <Prohibit className={styles.cancelled} aria-label="Cancelled"/> : <Check className={styles.complete} aria-label="Complete"/>}
      <strong>{CONFLICT_TITLES[card.kind].badge}</strong><span title={card.outcome}>{card.outcome}</span>
      <button className={styles.icon} onClick={() => setDismissed(new Set([...dismissed, card.id]))} aria-label={`Dismiss ${CONFLICT_TITLES[card.kind].badge} outcome`}><X aria-hidden="true"/></button>
    </div> : <article key={card.id} className={styles.card}>
      <div className={styles.title}>{badge(card.kind)}<strong>{CONFLICT_TITLES[card.kind].title}</strong><span className={styles.age}>{card.age}</span>
        <button className={styles.icon} disabled={!enabled} onClick={() => onCancel(card.id)} aria-label={`Cancel ${CONFLICT_TITLES[card.kind].badge} conflict for ${card.first} and ${card.second}`} title="Cancel conflict"><X aria-hidden="true"/></button>
      </div>
      <div className={styles.pair}><span>{card.first}</span><span className={styles.join}>{CONFLICT_TITLES[card.kind].join}</span><span>{card.second}</span><span className={styles.runway}>{card.runway}</span></div>
      <ol className={styles.steps} data-kind={card.kind} style={{gridTemplateColumns: `repeat(${card.steps.length}, minmax(0, 1fr))`}} aria-label="Progress">
        {card.steps.map(step => <li key={step.label} data-reached={step.reached} aria-current={step.current ? "step" : undefined}>{step.label}</li>)}
      </ol>
    </article>)}
  </section>;
}
