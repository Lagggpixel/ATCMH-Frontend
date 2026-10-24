"use client";
import {useEffect, useId, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {MagnifyingGlass} from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import {X} from "@phosphor-icons/react/dist/csr/X";
import {MapPin} from "@phosphor-icons/react/dist/csr/MapPin";
import {AirplaneTakeoff} from "@phosphor-icons/react/dist/csr/AirplaneTakeoff";
import {AirplaneLanding} from "@phosphor-icons/react/dist/csr/AirplaneLanding";
import {Path} from "@phosphor-icons/react/dist/csr/Path";
import {useNavigationCatalog} from "./use-navigation-catalog";
import {appendFlightPlan, flightPlanPatch, navigationSearch, type NavigationFilter} from "./scenario-flight-plan";
import type {NavigationRoute} from "./navigation-data";
import type {Aircraft, Airport} from "./model";
import theme from "./LiveTheme.module.css";
import styles from "./ScenarioFlightPlan.module.css";

const groups = [{type: "Waypoint", label: "Waypoints", Icon: MapPin}, {type: "SID", label: "Departures", Icon: AirplaneTakeoff}, {type: "STAR", label: "Arrivals", Icon: AirplaneLanding}, {type: "Approach", label: "Approaches", Icon: Path}] as const;
const filters: {type: NavigationFilter; label: string}[] = [{type: "All", label: "All"}, {type: "Waypoint", label: "Waypoints"}, {type: "SID", label: "SID"}, {type: "STAR", label: "STAR"}, {type: "Approach", label: "Approaches"}];

export default function FlightPlanAddDialog({aircraft: a, airport, live = false, onEdit, onClose, onAdded}: {
  aircraft: Aircraft; airport: Airport; live?: boolean; onEdit: (patch: Partial<Aircraft>) => void; onClose: () => void; onAdded: (message: string) => void;
}) {
  const id = useId(), dialog = useRef<HTMLDialogElement>(null), search = useRef<HTMLInputElement>(null);
  const transition = useRef<HTMLSelectElement>(null), add = useRef<HTMLButtonElement>(null);
  const {catalog, error: catalogError, retry} = useNavigationCatalog(airport.icao);
  const [query, setQuery] = useState(""), [filter, setFilter] = useState<NavigationFilter>("All"), [selected, setSelected] = useState("");
  const [chosenRoute, setChosenRoute] = useState<{procedureId: string; routeId: string}>(), [attempt, setAttempt] = useState(0), [error, setError] = useState("");
  const [preview, setPreview] = useState<{key: string; route?: NavigationRoute; error?: string}>();
  const results = navigationSearch(catalog, query, filter), current = results.find(item => item.id === selected) ?? results[0];
  const procedure = current?.procedure, procedureId = procedure?.id, revision = catalog?.revision;
  const route = procedure?.routes.find(item => chosenRoute?.procedureId === procedure.id && item.id === chosenRoute.routeId)
    ?? procedure?.routes.find(item => query.trim() && item.name.toUpperCase().includes(query.trim().toUpperCase())) ?? procedure?.routes[0];
  const routeId = route?.id, key = JSON.stringify([airport.icao, revision, procedureId, routeId, attempt]);
  const detail = preview?.key === key ? preview : undefined;
  const loading = !!routeId && !detail, points = current?.point ? [current.point] : detail?.route?.points;
  const choice = (value: string) => {setSelected(value); setChosenRoute(undefined); setError("");};
  useEffect(() => {
    const node = dialog.current, previous = document.activeElement;
    node?.showModal(); search.current?.focus();
    return () => {node?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus();};
  }, []);
  useEffect(() => {
    if (!routeId || !procedureId || !revision) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/simulator/navigation?${new URLSearchParams({airport: airport.icao, route: routeId, revision})}`, {credentials: "same-origin", signal: controller.signal});
        const value = await response.json();
        if (!response.ok) throw new Error(value.error?.message ?? value.error ?? "Unable to preview this route.");
        const imported = value as NavigationRoute;
        if (imported.airport !== airport.icao || imported.revision !== revision || imported.procedureId !== procedureId || imported.routeId !== routeId || !imported.points?.length) throw new Error("Navigation data changed. Refresh the catalogue and select the procedure again.");
        if (!controller.signal.aborted) setPreview({key, route: imported});
      } catch (reason) {if (!controller.signal.aborted) setPreview({key, error: reason instanceof Error ? reason.message : "Unable to preview this route."});}
    })();
    return () => controller.abort();
  }, [airport.icao, revision, procedureId, routeId, key]);
  const append = () => {
    if (!current || !points || !catalog) return;
    try {
      const imported = detail?.route;
      onEdit({...flightPlanPatch(a, appendFlightPlan(a.flightPlan, points), live), navigationSource: {revision: catalog.revision, ...(imported ? {procedureId: imported.procedureId, routeId: imported.routeId} : {})}, ...(imported?.type === "STAR" ? {arrivalProcedure: imported.name} : {})});
      onAdded(`Added ${current.name}${route ? ` · ${route.name}` : ""}.`); onClose();
    } catch (reason) {setError(reason instanceof Error ? reason.message : "Unable to add this route.");}
  };
  const navigate = (direction: number) => {
    if (!results.length) return;
    const index = results.findIndex(item => item.id === current?.id);
    const next = results[(index + direction + results.length) % results.length]; choice(next.id);
    document.getElementById(`${id}-${next.id}`)?.scrollIntoView({block: "nearest"});
  };
  return createPortal(<dialog ref={dialog} className={`${theme.theme} ${styles.dialog}`} aria-labelledby={`${id}-title`} onCancel={event => {event.preventDefault(); onClose();}} onKeyDown={event => {
    event.stopPropagation();
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, input, select, [tabindex]")).filter(control => control.tabIndex >= 0 && !control.matches(":disabled") && control.getClientRects().length);
    const target = event.shiftKey ? controls.at(-1) : controls[0];
    if (document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) {event.preventDefault(); target?.focus();}
  }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <header className={styles.dialogHeader}><div><h2 id={`${id}-title`}>Add to flight plan</h2><p>{a.callsign} <span aria-hidden="true">·</span> {airport.icao}</p></div><button type="button" className={styles.iconButton} aria-label="Close flight plan search" onClick={onClose}><X size={20}/></button></header>
    <div className={styles.search}><MagnifyingGlass size={21} aria-hidden="true"/><input ref={search} aria-label="Search waypoints and procedures" role="combobox" aria-autocomplete="list" aria-expanded={!!catalog} aria-controls={`${id}-results`} aria-activedescendant={current ? `${id}-${current.id}` : undefined} placeholder="Search a waypoint, procedure or transition…" value={query} onChange={event => {setQuery(event.target.value); choice("");}} onKeyDown={event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {event.preventDefault(); navigate(event.key === "ArrowDown" ? 1 : -1);}
      if (event.key === "Enter") {event.preventDefault(); if (procedure && transition.current) transition.current.focus(); else add.current?.focus();}
    }}/>{query ? <button type="button" className={styles.iconButton} aria-label="Clear navigation search" onClick={() => {setQuery(""); choice(""); search.current?.focus();}}><X size={17}/></button> : null}</div>
    <div className={styles.filters} aria-label="Navigation filters">{filters.map(item => <button type="button" key={item.type} aria-pressed={filter === item.type} onClick={() => {setFilter(item.type); choice("");}}>{item.label}</button>)}</div>
    <div className={styles.dialogBody}>
      <div className={styles.searchResults} role="listbox" id={`${id}-results`} aria-label="Navigation results">
        {!catalog && !catalogError ? <p role="status" className={styles.message}>Loading navigation data…</p> : null}
        {catalogError ? <div className={styles.message} role="alert"><p>{catalogError}</p><button type="button" onClick={retry}>Retry navigation data</button></div> : null}
        {catalog && !results.length ? <p role="status" className={styles.message}>No matches{query.trim() ? ` for “${query}”` : ` at ${airport.icao}`}. Try another name or filter.</p> : null}
        {groups.map(group => {
          const items = results.filter(item => item.type === group.type); if (!items.length) return null;
          return <div role="group" aria-label={group.label} className={styles.resultGroup} key={group.type}><h3>{group.label} <span>({items.length})</span></h3>{items.map(item => {const matchingTransition = item.type === "Approach" && query.trim() ? item.procedure?.routes.find(route => route.name.toUpperCase().includes(query.trim().toUpperCase()))?.name : undefined; return <button type="button" role="option" tabIndex={-1} aria-selected={current?.id === item.id} id={`${id}-${item.id}`} key={item.id} className={styles.result} onClick={() => choice(item.id)}><group.Icon size={22} aria-hidden="true"/><span><strong>{item.name}{matchingTransition ? ` via ${matchingTransition}` : ""}</strong><small>{item.type === "Waypoint" ? "Waypoint" : `${item.type === "Approach" ? "Approach" : item.type} · ${airport.icao}`}</small></span>{item.point ? <small className={styles.distance}>{Math.hypot(item.point.x, item.point.y).toFixed(0)} NM<small>from {airport.icao}</small></small> : null}</button>;})}</div>;
        })}
        {groups.some(group => results.filter(item => item.type === group.type).length >= (filter === "All" ? 10 : 40)) ? <p className={styles.help}>Showing up to {filter === "All" ? "10 matches per group" : "40 matches"}. Keep typing to narrow the results.</p> : null}
      </div>
      <section className={styles.preview} aria-label="Selected navigation item">
        {current ? <><h3>{current.name}</h3><p className={styles.previewMeta}>{current.type === "Waypoint" ? "Waypoint" : current.type === "Approach" ? "Approach" : current.type} <span aria-hidden="true">·</span> {airport.icao}</p>
          {procedure ? <label>Transition<select ref={transition} aria-label="Procedure transition" value={routeId ?? ""} onChange={event => {setChosenRoute({procedureId: procedure.id, routeId: event.target.value}); setError("");}}>{procedure.routes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
          {loading ? <p role="status" className={styles.message}>Loading route preview…</p> : null}
          {detail?.error ? <div role="alert" className={styles.message}><p>{detail.error}</p><div className={styles.actions}><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry preview</button><button type="button" onClick={retry}>Refresh catalogue</button></div></div> : null}
          {points ? <><h4>Resulting route <span>({points.length} {points.length === 1 ? "fix" : "fixes"})</span></h4><ol className={styles.routePreview}>{points.map((point, index) => <li key={index}><span>{index + 1}</span><div><strong>{point.name ?? `Waypoint ${index + 1}`}</strong>{point.altitude !== undefined ? <small>{point.altitude.toLocaleString("en-GB")} ft MSL</small> : null}</div></li>)}</ol><p className={styles.help}>{current.type === "Approach" ? "Adds route only. Approach clearance stays with the controller." : "Adds to the end of your flight plan. Existing altitude targets are kept."}</p></> : null}
        </> : <p className={styles.help}>Search and select a waypoint or procedure to preview its fixes.</p>}
      </section>
    </div>
    <footer className={styles.dialogFooter}><p className={styles.shortcuts}><kbd>↑</kbd><kbd>↓</kbd> Navigate <kbd>Enter</kbd> Select <kbd>Esc</kbd> Close</p><div className={styles.footerActions}><button type="button" onClick={onClose}>Cancel</button><button ref={add} type="button" className={styles.primary} disabled={!points?.length || loading || !!detail?.error} onClick={append}>{current?.type === "Waypoint" ? "Add waypoint" : current?.type === "Approach" ? "Add approach" : "Add procedure"}</button></div>{error ? <p role="alert" className={styles.error}>{error}</p> : null}</footer>
  </dialog>, document.body);
}
