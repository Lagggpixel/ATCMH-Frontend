"use client";
import {useEffect, useRef} from "react";
import type {AirportProcedure, AirportProcedures} from "./airport-display";
import {procedureColor, procedureKey, procedureRunwaySummary} from "./airport-display";
import styles from "./AirportDisplay.module.css";

export default function ScopeProcedures({airport, data, error, selected, opacity, onToggle, onClear, onOpacity, onRetry, onClose}: {
  airport: string; data?: AirportProcedures; error?: string; selected: readonly AirportProcedure[]; opacity: number;
  onToggle: (procedure: AirportProcedure) => void; onClear: () => void; onOpacity: (value: number) => void; onRetry: () => void; onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {root.current?.querySelector<HTMLButtonElement>("button")?.focus();}, []);
  const keys = new Set(selected.map(procedureKey));
  return <section ref={root} className={styles.procedures} data-airport-panel="procedures" role="dialog" aria-label={`${airport} Select Procedures`}>
    <header><span>Select Procedures</span><button type="button" onClick={onClose} aria-label="Close procedures"><span aria-hidden="true">&#xe82e;</span></button></header>
    <div className={styles.procedureList}>{error ? <p role="status">{error} <button type="button" onClick={onRetry}>Retry procedures</button></p> : !data ? <p role="status">Loading procedures…</p> : !data.procedures.length ? <p>No published procedures available.</p> : data.procedures.map(procedure => <label key={procedure.id} className={styles.procedureChoice}>
      <span className={styles.procedureName} style={{color: procedureColor(procedure)}}>{procedure.type} - {procedure.name}</span><span className={styles.runwaySummary}>{procedureRunwaySummary(procedure)}{procedure.routes.some(route => route.simplified) ? " · Simplified route" : ""}</span>
      <input type="checkbox" aria-label={`${procedure.type} - ${procedure.name}${procedure.routes.some(route => route.simplified) ? " · simplified route" : ""}`} checked={keys.has(procedureKey(procedure))} onChange={() => onToggle(procedure)}/>
      <span className={styles.procedureCheck} aria-hidden="true">{keys.has(procedureKey(procedure)) ? "\ue834" : "\ue833"}</span>
    </label>)}</div>
    <footer><label>OPACITY<input aria-label="Procedure opacity" aria-valuetext={`${Math.round(opacity * 100)}%`} type="range" min="0.1" max="1" step="0.1" value={opacity} onChange={event => onOpacity(Number(event.target.value))}/></label>
      <button type="button" onClick={onClear}>CLEAR</button></footer>
  </section>;
}
