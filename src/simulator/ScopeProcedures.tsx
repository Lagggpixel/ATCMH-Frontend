"use client";
import {useEffect, useRef, useState} from "react";
import type {NavigationCatalog, NavigationRoute} from "./navigation-data";
import styles from "./Simulator.module.css";

export default function ScopeProcedures({catalog, selected, onAdd, onRemove, onClose}: {
  catalog?: NavigationCatalog; selected: readonly NavigationRoute[];
  onAdd: (route: NavigationRoute) => void; onRemove: (id: string) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState(""), [busy, setBusy] = useState(""), [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const toggle = async (id: string) => {
    if (!catalog || pending.current) return;
    if (selected.some(route => route.routeId === id)) {onRemove(id); return;}
    const controller = new AbortController(); pending.current = controller; setBusy(id); setError("");
    try {
      const response = await fetch(`/api/simulator/navigation?${new URLSearchParams({airport: catalog.airport, overlay: id, revision: catalog.revision})}`, {credentials: "same-origin", signal: controller.signal});
      const value = await response.json();
      if (!response.ok) throw new Error(value.error?.message ?? value.error ?? "Procedure unavailable.");
      if (!controller.signal.aborted) onAdd(value as NavigationRoute);
    } catch (reason) {if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Procedure unavailable.");}
    finally {if (!controller.signal.aborted) {setBusy(""); pending.current = null;}}
  };
  const matches = catalog?.procedures.flatMap(procedure => procedure.routes.map(route => ({...route, label: `${procedure.type} · ${procedure.name} · ${route.name}`})))
    .filter(route => route.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  return <div className={`${styles.optionsMenu} ${styles.proceduresMenu}`} role="dialog" aria-label="Procedures">
    <div className={styles.scopePanelHeader}><strong>Procedures</strong><button type="button" onClick={onClose} aria-label="Close procedures">×</button></div>
    <label>Find procedure<input aria-label="Find procedure" value={search} onChange={event => setSearch(event.target.value)}/></label>
    {!catalog ? <p>Navigation data unavailable.</p> : !matches.length ? <p>No matching procedures.</p> : matches.slice(0, 100).map(route => <label key={route.id} className={styles.scopeProcedureChoice}>
      <input type="checkbox" checked={selected.some(item => item.routeId === route.id)} disabled={!!busy} onChange={() => void toggle(route.id)}/>
      {route.label}{busy === route.id ? " · Loading…" : ""}
    </label>)}
    {matches.length > 100 ? <p>Search to narrow the {matches.length} routes.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
