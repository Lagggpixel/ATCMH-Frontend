"use client";
import {useEffect, useRef, useState} from "react";
import type {Aircraft, Airport} from "./model";
import type {NavigationRoute} from "./navigation-data";
import {useNavigationCatalog} from "./use-navigation-catalog";
import styles from "./Simulator.module.css";

export default function NavigationPicker({aircraft, airport, onEdit}: {aircraft: Aircraft; airport: Airport; onEdit: (patch: Partial<Aircraft>) => void}) {
  return <Picker key={`${airport.icao}:${aircraft.id}`} aircraft={aircraft} airport={airport} onEdit={onEdit}/>;
}
function Picker({aircraft, airport, onEdit}: {aircraft: Aircraft; airport: Airport; onEdit: (patch: Partial<Aircraft>) => void}) {
  const {catalog, error: catalogError, retry} = useNavigationCatalog(airport.icao);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [route, setRoute] = useState("");
  const controller = useRef<AbortController | null>(null), inFlight = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  async function request<T>(query: URLSearchParams): Promise<T> {
    controller.current?.abort(); controller.current = new AbortController();
    const response = await fetch(`/api/simulator/navigation?${query}`, {credentials: "same-origin", signal: controller.current.signal});
    const value = await response.json(); if (!response.ok) throw new Error(value.error?.message ?? value.error ?? "Navigation data is unavailable.");
    return value as T;
  }
  const work = async (run: () => Promise<void>) => {if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(""); try {await run();} catch (reason) {if (!(reason instanceof Error && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Navigation data is unavailable.");} finally {inFlight.current = false; setBusy(false);}};
  const matches = catalog?.fixes.filter(f => f.name.toLowerCase().includes(filter.toLowerCase())) ?? [];
  return <section className={styles.navigationPicker} aria-label="Navigation database"><h3>Waypoints and procedures</h3>
    <button type="button" disabled={busy || (!catalog && !catalogError)} onClick={() => {retry(); setRoute("");}}>{!catalog && !catalogError ? "Loading navigation data…" : catalog ? "Refresh catalogue" : "Retry navigation"}</button>
    {catalog ? <><label>Find waypoint<input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Waypoint identifier"/></label>
      <label>Append waypoint<select aria-label="Append waypoint" value="" disabled={busy || aircraft.flightPlan.length >= 200} onChange={event => {const fix = catalog.fixes.find(f => f.id === event.target.value); if (fix) onEdit({flightPlan: [...aircraft.flightPlan, {...fix.point}], navigationSource: {revision: catalog.revision}});}}><option value="">Choose waypoint · {matches.length} shown</option>{matches.map(f => <option key={f.id} value={f.id}>{f.name} · {f.point.x.toFixed(1)} E, {f.point.y.toFixed(1)} N</option>)}</select></label>
      <label>Procedure / approach route<select aria-label="Procedure / approach route" value={route} disabled={busy} onChange={event => setRoute(event.target.value)}><option value="">Choose procedure and transition</option>{catalog.procedures.map(p => <optgroup key={p.id} label={`${p.type} · ${p.name}`}>{p.routes.map(r => <option key={r.id} value={r.id} disabled={r.pointCount > 200}>{r.name} · {r.pointCount} fixes{r.pointCount > 200 ? " (over exercise limit)" : ""}</option>)}</optgroup>)}</select></label>
      <button type="button" disabled={busy || !route} onClick={() => void work(async () => {
        const selected = await request<NavigationRoute>(new URLSearchParams({airport: airport.icao, route, revision: catalog.revision}));
        onEdit({flightPlan: selected.points, ...(selected.type === "STAR" ? {arrivalProcedure: selected.name} : {}),
          navigationSource: {revision: selected.revision, procedureId: selected.procedureId, routeId: selected.routeId},
          ...(aircraft.radar ? {radar: {...aircraft.radar, routeIndex: 0}} : {})});
      })}>Replace flight plan with selected route</button><small>Complete route geometry is saved in this exercise. Use Initial guidance to follow it. Altitude and speed restrictions are only applied when configured below.</small>
      {aircraft.navigationSource ? <small>Saved navigation revision: {aircraft.navigationSource.revision.slice(0, 12)}</small> : null}
    </> : null}{error ? <p role="alert">{error}</p> : null}
    {catalogError ? <p role="alert">{catalogError}</p> : null}
  </section>;
}
