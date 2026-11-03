"use client";
import {useState, useSyncExternalStore} from "react";
import {CaretDown} from "@phosphor-icons/react/dist/csr/CaretDown";
import {CaretUp} from "@phosphor-icons/react/dist/csr/CaretUp";
import type {SeparationAlert} from "./radar-safety";
import {feet, incidentClock, incidentSignature, nm, orderedIncidents, tagLineText, trackIncidents, type IncidentLog, type IncidentNow, type IncidentRecord} from "./separation-incidents";
import styles from "./SeparationAlerts.module.css";

/** Alert lines drawn above a callsign tag. They are positioned outside the tag, so its own lines never move. */
export function SeparationTagLines({conflicts, agl, callsign, side, filled}: {
  conflicts: readonly SeparationAlert[]; agl?: number; callsign: (id: string) => string; side: "left" | "right"; filled: (otherId: string) => boolean;
}) {
  if (!conflicts.length && agl === undefined) return null;
  return <span className={styles.tagLines} data-side={side}>
    {agl !== undefined ? <span className={styles.line} data-kind="terr"><span className={styles.lineBadge}>TERR</span>{`${Math.floor(agl)}FT AGL`}</span> : null}
    {conflicts.map(alert => <span key={alert.otherId} className={styles.line} data-kind="los" data-filled={filled(alert.otherId)}>
      <span className={styles.lineBadge}>LOS</span>{tagLineText(callsign(alert.otherId), alert)}
    </span>)}
  </span>;
}

const collapsedKey = (accountId: string) => `sweatbox.separation.collapsed.${accountId}`;
const readCollapsed = (accountId: string) => {try {return window.localStorage.getItem(collapsedKey(accountId)) === "true";} catch {return false;}};

function values(record: IncidentRecord) {
  return record.kind === "terr" ? `${feet(record.agl ?? 0)} ft AGL` : `${nm(record.lateral ?? 0)} NM · ${feet(record.vertical ?? 0)} ft`;
}

/** Staff-only list of current separation and terrain incidents, over the top left of the scope. */
export default function SeparationPanel({accountId = "guest", incidents, elapsed, selected, onSelect, onHover}: {
  accountId?: string; incidents: readonly IncidentNow[]; elapsed: number; selected: string | null;
  onSelect: (aircraftId: string) => void; onHover: (aircraftIds: readonly string[] | null) => void;
}) {
  const [log, setLog] = useState<IncidentLog>(() => trackIncidents(undefined, incidents, elapsed));
  let current = log;
  if ((incidents.length || log.records.size) && (log.at !== elapsed || log.signature !== incidentSignature(incidents))) {
    current = trackIncidents(log, incidents, elapsed);
    setLog(current);
  }
  const savedCollapsed = useSyncExternalStore(() => () => {}, () => readCollapsed(accountId), () => false);
  const [collapsedOverride, setCollapsed] = useState<boolean | null>(null);
  const collapsed = collapsedOverride ?? savedCollapsed;
  const records = orderedIncidents(current);
  if (!records.length) return null;
  const live = records.filter(r => r.end === undefined).length;
  const toggle = () => {const next = !collapsed; setCollapsed(next); try {window.localStorage.setItem(collapsedKey(accountId), String(next));} catch { /* Collapsing still works for this page. */ }};
  if (collapsed) return <button className={styles.chip} data-separation-panel data-live={live > 0} onClick={toggle} aria-expanded="false" aria-label={`Show separation incidents, ${live} active`} onContextMenu={event => event.stopPropagation()}>
    <span className={styles.dot} aria-hidden="true"/>Separation · {live}<CaretDown aria-hidden="true"/>
  </button>;
  const choose = (record: IncidentRecord) => onSelect(record.ids.length > 1 && selected === record.ids[0] ? record.ids[1] : record.ids[0]);
  return <section className={styles.panel} data-separation-panel aria-label="Separation incidents" onContextMenu={event => event.stopPropagation()} onPointerLeave={() => onHover(null)}>
    <header className={styles.header}>
      <span className={styles.dot} data-live={live > 0} aria-hidden="true"/>
      <h2 className={styles.heading}>Separation</h2>
      <span className={styles.count} role="status">{live} active</span>
      <button className={styles.icon} onClick={toggle} aria-expanded="true" aria-label="Hide separation incidents"><CaretUp aria-hidden="true"/></button>
    </header>
    {records.map(record => {
      const cleared = record.end !== undefined;
      return <button key={record.key} className={styles.row} data-kind={record.kind} data-cleared={cleared} data-active={record.ids.includes(selected ?? "")}
        onClick={() => choose(record)} onPointerEnter={() => onHover(record.ids)} onFocus={() => onHover(record.ids)} onBlur={() => onHover(null)}
        aria-label={`${record.kind === "terr" ? "Terrain" : "Loss of separation"}: ${record.callsigns.join(" and ")}${cleared ? ", cleared" : ""}`}>
        <span className={styles.badge}>{record.kind === "terr" ? "TERR" : "LOS"}</span>
        <span className={styles.names}>
          <strong>{record.callsigns.join(" · ")}</strong>
          <span className={styles.values}>{cleared ? `Cleared after ${incidentClock(record.end! - record.start)}` : values(record)}</span>
        </span>
        {cleared ? <span className={styles.closest}>{record.kind === "terr"
          ? <span>lowest {feet(record.minAgl ?? 0)} ft AGL</span>
          : <><span>closest {nm(record.minLateral ?? 0)} NM</span><span>closest {feet(record.minVertical ?? 0)} ft</span></>}</span>
          : <span className={styles.time}>{incidentClock(elapsed - record.start)}</span>}
      </button>;
    })}
  </section>;
}
