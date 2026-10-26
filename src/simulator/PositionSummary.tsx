"use client";
import type {CSSProperties} from "react";
import {positionColor, type PositionPresence} from "./positions";
import {sessionJson} from "./shared-transport";
import styles from "./Positions.module.css";

export const positionSwatch = (index: number) => ({"--position": positionColor(index)}) as CSSProperties;
export const positionCount = (count: number) => `${count} ${count === 1 ? "position" : "positions"}`;
export const isSplit = (positions?: readonly unknown[]): positions is readonly unknown[] => (positions?.length ?? 0) > 1;
/** "1 of 2 connected" once anyone has joined, otherwise how many positions have a trainee. */
export function positionProgress(positions: readonly PositionPresence[]) {
  const connected = positions.filter(p => p.occupied).length, assigned = positions.filter(p => p.occupied || p.assignedId).length;
  return connected ? `${connected} of ${positions.length} connected` : `${assigned} of ${positions.length} assigned`;
}
export const positionState = (p: PositionPresence) => p.occupied ? "Connected" : p.assignedId ? "Not joined yet" : "Open";
export const assignPosition = (csrf: string, sessionId: string, positionId: string, accountId: string | null) =>
  fetch(`/api/simulator/sessions/${sessionId}/position-assignment`, {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrf}, body: JSON.stringify({positionId, trainee: accountId ? {accountId} : null})}).then(sessionJson);

/** Coloured segments, one per position. Decoration only: always pair it with a written count. */
export function PositionBar({count}: {count: number}) {
  return <span className={styles.bar} data-single={count < 2 || undefined} aria-hidden="true">{Array.from({length: Math.max(1, count)}, (_, i) => <span key={i} style={count > 1 ? positionSwatch(i) : undefined}/>)}</span>;
}

/** Positions grouped by who covers them: a bandbox is one group of several positions, in layout order. */
export function bandboxGroups(positions: readonly PositionPresence[]) {
  return positions.filter(p => !p.bandboxId || p.bandboxId === p.id).map(p => p.bandboxId ? positions.filter(q => q.bandboxId === p.bandboxId) : [p]);
}
const stripes = (group: readonly PositionPresence[], positions: readonly PositionPresence[]) =>
  <span className={styles.stripes} aria-hidden="true">{group.map(g => <span key={g.id} style={positionSwatch(positions.indexOf(g))}/>)}</span>;

/** One chip per position for a session row, or one per bandbox: names, the frequency it is worked on, and who holds it. */
export function PositionChips({positions, onAssign}: {positions: readonly PositionPresence[]; onAssign?: (position: PositionPresence) => void}) {
  return <ul className={styles.chips} aria-label="Controller positions">{bandboxGroups(positions).map(group => {
    const p = group[0], person = p.traineeName ?? p.assignedName, bandbox = group.length > 1;
    return <li key={p.id} data-empty={!person || undefined}>
      {stripes(group, positions)}<strong>{group.map(g => g.name).join(" + ")}</strong><span className={styles.mhz}>{p.mhz}</span>
      {person ? <span className={styles.person}><span className={styles.dot} data-on={p.occupied || undefined} aria-hidden="true"/>{person}<span className={styles.srOnly}> · {positionState(p)}</span></span>
        : onAssign ? <button type="button" className={styles.chipLink} onClick={() => onAssign(p)}>Assign a mentee<span className={styles.srOnly}> to {p.name}</span></button>
        : <span className={styles.muted}>Open</span>}
      {bandbox ? <span className={styles.bandboxTag}>Bandbox</span> : null}
    </li>;
  })}</ul>;
}

/** Status of one position, saying when it is worked as part of a bandbox. */
function tableState(p: PositionPresence, positions: readonly PositionPresence[]) {
  if (!p.bandboxId) return positionState(p);
  const primary = positions.find(q => q.id === p.bandboxId);
  return `${positionState(p)} · ${p.id === p.bandboxId ? "bandbox, primary" : `bandboxed on ${primary?.mhz ?? ""}`}`;
}
/** The expanded session row: every position with its own link and trainee. A bandboxed position can be split off to someone else. */
export function PositionTable({positions, onCopy, onChange}: {positions: readonly PositionPresence[]; onCopy: (position: PositionPresence) => void; onChange?: (position: PositionPresence) => void}) {
  const action = (p: PositionPresence) => p.bandboxId && p.bandboxId !== p.id ? "Split off" : p.assignedId ? "Change" : "Assign";
  const state = (p: PositionPresence) => p.occupied ? "on" : p.assignedId ? "wait" : undefined;
  return <>
    <div className={`${styles.tableBox} ${styles.wide}`}><table className={styles.table}>
      <thead><tr><th scope="col">Position</th><th scope="col">Frequency</th><th scope="col">Mentee</th><th scope="col">Status</th><th scope="col"><span className={styles.srOnly}>Actions</span></th></tr></thead>
      <tbody>{positions.map((p, i) => <tr key={p.id} style={positionSwatch(i)}>
        <th scope="row"><span className={styles.swatch} aria-hidden="true"/>{p.name}</th>
        <td className={styles.mhz}>{p.mhz}</td>
        <td>{p.traineeName ?? p.assignedName ?? <span className={styles.muted}>No mentee</span>}</td>
        <td data-state={state(p)}>{tableState(p, positions)}</td>
        <td className={styles.actions}><button type="button" className={styles.chipLink} onClick={() => onCopy(p)}>Copy link<span className={styles.srOnly}> for {p.name}</span></button>{onChange ? <button type="button" className={styles.chipLink} onClick={() => onChange(p)}>{action(p)}<span className={styles.srOnly}> {p.name}</span></button> : null}</td>
      </tr>)}</tbody>
    </table></div>
    <ul className={styles.phoneList} aria-label="Positions">{positions.map((p, i) => <li key={p.id} style={positionSwatch(i)}>
      <span><span className={styles.swatch} aria-hidden="true"/><strong>{p.name}</strong><span className={styles.mhz}>{p.mhz}</span><span className={styles.phoneState} data-state={state(p)}>{tableState(p, positions)}</span></span>
      <span><span className={p.traineeName ?? p.assignedName ? undefined : styles.muted}>{p.traineeName ?? p.assignedName ?? "No mentee"}</span><button type="button" className={styles.chipLink} onClick={() => onCopy(p)}>Copy link<span className={styles.srOnly}> for {p.name}</span></button>{onChange ? <button type="button" className={styles.chipLink} onClick={() => onChange(p)}>{action(p)}<span className={styles.srOnly}> {p.name}</span></button> : null}</span>
    </li>)}</ul>
  </>;
}
