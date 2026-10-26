"use client";
import {useEffect, useId, useRef, useState} from "react";
import {MagnifyingGlass} from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import {X} from "@phosphor-icons/react/dist/csr/X";
import {MapPin} from "@phosphor-icons/react/dist/csr/MapPin";
import {AirplaneTakeoff} from "@phosphor-icons/react/dist/csr/AirplaneTakeoff";
import {AirplaneLanding} from "@phosphor-icons/react/dist/csr/AirplaneLanding";
import {Path} from "@phosphor-icons/react/dist/csr/Path";
import {useNavigationCatalog} from "./use-navigation-catalog";
import {appendedFixes, appendFlightPlan, flightPlanPatch, loadNavigationRoute, navigationSearch, parseTypedRoute, tagProcedure, typedRoutePoints, type NavigationFilter} from "./scenario-flight-plan";
import {setFlightPlanPreview} from "./flight-plan-preview";
import type {NavigationRoute} from "./navigation-data";
import type {Aircraft, Airport, RoutePoint} from "./model";
import styles from "./ScenarioFlightPlan.module.css";

const ICONS = {Waypoint: MapPin, SID: AirplaneTakeoff, STAR: AirplaneLanding, Approach: Path} as const;
const TYPE_LABELS = {Waypoint: "Waypoint", SID: "Departure", STAR: "Arrival", Approach: "Approach"} as const;
const filters: {type: NavigationFilter; label: string}[] = [{type: "All", label: "All"}, {type: "Waypoint", label: "Fixes"}, {type: "SID", label: "SID"}, {type: "STAR", label: "STAR"}, {type: "Approach", label: "Approach"}];
const CHIP_CLASSES = {direct: styles.chipDirect, fix: "", procedure: styles.chipProcedure, error: styles.chipError, unchecked: styles.chipUnchecked};
const compact = (value: string) => value.replace(/\s+/g, "").toUpperCase();
type Loaded = {key: string; points?: RoutePoint[]; route?: NavigationRoute; source?: Aircraft["navigationSource"]; star?: string; error?: string};

/**
 * One field searches navigation data or takes a typed route ("TLA DCT GOW"). Whatever would be added is drawn
 * on the scope, so trainers see where a fix or procedure goes before adding it.
 */
export default function FlightPlanAddPanel({aircraft: a, airport, live, onEdit, onAdded}: {aircraft: Aircraft; airport: Airport; live: boolean; onEdit: (patch: Partial<Aircraft>) => void; onAdded: (message: string) => void}) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const {catalog, error: catalogError, retry} = useNavigationCatalog(airport.icao);
  const [query, setQuery] = useState(""), [open, setOpen] = useState(false), [filter, setFilter] = useState<NavigationFilter>("All");
  const [selected, setSelected] = useState<string>(), [hovered, setHovered] = useState<string>(), [transitions, setTransitions] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState<Loaded>(), [attempt, setAttempt] = useState(0), [error, setError] = useState("");
  const tokens = query.trim().split(/[\s,]+/).filter(Boolean), typing = tokens.length > 1;

  // A typed route: every word must resolve before it can be added.
  const parsed = typing && catalog ? parseTypedRoute(catalog, query, a.flightPlan.at(-1) ?? a.position) : undefined;
  const typedKey = parsed && !parsed.error ? JSON.stringify([catalog?.revision, parsed.entries.map(entry => "point" in entry ? [entry.point.x, entry.point.y] : entry.route.id), attempt]) : undefined;

  // Search: one word, optionally PROCEDURE.TRANSITION.
  const [term = "", transitionHint] = (tokens[0] ?? "").split(".");
  const results = typing ? [] : navigationSearch(catalog, term, filter);
  // The chosen result stays open; hovering another only previews it on the scope, so the list never jumps under the pointer.
  const chosenId = selected ?? (query.trim() ? results[0]?.id : undefined);
  const current = results.find(item => item.id === (hovered ?? chosenId));
  const procedure = current?.procedure;
  const route = procedure && (procedure.routes.find(item => item.id === transitions[procedure.id])
    ?? procedure.routes.find(item => transitionHint && compact(item.name) === compact(transitionHint)) ?? procedure.routes[0]);
  const searchKey = procedure && route && catalog ? JSON.stringify([catalog.revision, procedure.id, route.id, attempt]) : undefined;

  const key = typing ? typedKey : searchKey, ready = loaded?.key === key ? loaded : undefined;
  useEffect(() => {
    if (!catalog || !key) return;
    let active = true;
    const load = typing ? (async () => {
      const resolved = await typedRoutePoints(catalog, parsed!.entries);
      return {points: resolved.points, source: resolved.source, star: resolved.star};
    })() : loadNavigationRoute(catalog, procedure!.id, route!.id).then(navigation => ({route: navigation, points: tagProcedure(navigation.points, navigation, route!.name)}));
    load.then(value => {if (active) setLoaded({key, ...value});}, reason => {if (active) setLoaded({key, error: reason instanceof Error ? reason.message : "Unable to load this route."});});
    return () => {active = false;};
    // The key captures every input the load depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const incoming = typing ? ready?.points : current?.point ? [{...current.point, name: current.point.name ?? current.name}] : ready?.points;
  const adding = incoming ? appendedFixes(a.flightPlan, incoming) : [];
  const from = a.flightPlan.at(-1) ?? a.position;
  useEffect(() => {setFlightPlanPreview("adding", open && adding.length ? {aircraftId: a.id, from, points: adding} : null);});
  useEffect(() => () => setFlightPlanPreview("adding", null), []);

  const close = () => {setQuery(""); setOpen(false); setSelected(undefined); setHovered(undefined); setError("");};
  const add = () => {
    if (!catalog || !incoming?.length) return;
    try {
      const flightPlan = appendFlightPlan(a.flightPlan, incoming);
      if (typing) {
        onEdit({...flightPlanPatch(a, flightPlan, live), navigationSource: ready!.source, ...(ready!.star ? {arrivalProcedure: ready!.star} : {})});
        onAdded(`Added ${parsed!.entries.map(entry => entry.name).join(", ")}.`);
      } else {
        const navigation = ready?.route;
        onEdit({...flightPlanPatch(a, flightPlan, live), navigationSource: {revision: catalog.revision, ...(navigation ? {procedureId: navigation.procedureId, routeId: navigation.routeId} : {})}, ...(navigation?.type === "STAR" ? {arrivalProcedure: navigation.name} : {})});
        onAdded(`Added ${current!.name}${route ? ` via ${route.name}` : ""}.`);
      }
      close(); input.current?.focus();
    } catch (reason) {setError(reason instanceof Error ? reason.message : "Unable to add this route.");}
  };
  const navigate = (direction: number) => {
    if (!results.length) return;
    const index = results.findIndex(item => item.id === current?.id);
    const nextItem = results[(index + direction + results.length) % results.length];
    setSelected(nextItem.id); setHovered(undefined);
    document.getElementById(`${id}-${nextItem.id}`)?.scrollIntoView({block: "nearest"});
  };
  const loading = !!key && !ready, loadError = ready?.error;
  const canAdd = !!adding.length && !loading && !loadError && (!typing || !!parsed && !parsed.error);
  const last = a.flightPlan.at(-1), addLabel = typing ? "Add route" : current ? `Add ${current.name}` : "Add";

  // Typed words in order: resolved ones, then the first that failed, then the rest unchecked.
  let resolved = 0;
  const chips = typing ? tokens.map(token => {
    if (token.toUpperCase() === "DCT") return {token, state: "direct" as const};
    const index = resolved++, entry = parsed?.entries[index];
    return {token, state: entry ? "point" in entry ? "fix" as const : "procedure" as const : index === parsed?.entries.length && parsed?.error ? "error" as const : "unchecked" as const};
  }) : [];

  return <div className={styles.addPanel} onKeyDown={event => {if (event.key === "Escape" && open) {event.stopPropagation(); close();}}}>
    <div className={styles.search}>
      <MagnifyingGlass size={18} aria-hidden="true"/>
      <input ref={input} value={query} aria-label="Add a fix, procedure or typed route" role="combobox" aria-autocomplete="list" aria-expanded={open && !typing && !!results.length} aria-controls={`${id}-results`} aria-activedescendant={current && open ? `${id}-${current.id}` : undefined}
        placeholder={catalog ? "Add a fix, procedure or route…" : catalogError ? "Navigation data unavailable" : "Loading navigation data…"} disabled={!catalog}
        onFocus={() => setOpen(true)} onChange={event => {setQuery(event.target.value); setOpen(true); setSelected(undefined); setHovered(undefined); setError("");}}
        onKeyDown={event => {
          if (!typing && (event.key === "ArrowDown" || event.key === "ArrowUp")) {event.preventDefault(); navigate(event.key === "ArrowDown" ? 1 : -1);}
          if (event.key === "Enter") {event.preventDefault(); if (canAdd) add();}
        }}/>
      {open ? <button type="button" className={styles.iconButton} aria-label="Close flight plan search" onClick={close}><X size={16} aria-hidden="true"/></button> : null}
    </div>
    {catalogError ? <div className={styles.message} role="alert"><p>{catalogError}</p><button type="button" onClick={retry}>Retry navigation data</button></div> : null}
    {open && catalog ? <div className={styles.addBody}>
      {typing ? <div className={styles.typedRoute}>
        <ol className={styles.chips} aria-label="Typed route">{chips.map((chip, index) => <li key={index} className={CHIP_CLASSES[chip.state]}>{chip.token.toUpperCase()}</li>)}</ol>
        {parsed?.error ? <p role="alert" className={styles.error}>{parsed.error}</p> : <p className={styles.help}>{loading ? "Loading route…" : `Shown on the scope. Press Enter to add ${adding.length} ${adding.length === 1 ? "fix" : "fixes"}.`}</p>}
      </div> : <>
        <div className={styles.filters} aria-label="Navigation filters">{filters.map(item => <button type="button" key={item.type} aria-pressed={filter === item.type} onClick={() => {setFilter(item.type); setSelected(undefined); setHovered(undefined);}}>{item.label}</button>)}</div>
        <div className={styles.results} role="listbox" id={`${id}-results`} aria-label="Navigation results" onPointerLeave={() => setHovered(undefined)}>
          {!results.length ? <p role="status" className={styles.message}>No matches{term ? ` for “${term}”` : ` at ${airport.icao}`}. Try another name or filter.</p> : null}
          {results.map(item => {
            const Icon = ICONS[item.type], active = item.id === chosenId, previewed = active && item.id === current?.id;
            return <div key={item.id} className={`${styles.result} ${active ? styles.activeResult : ""} ${item.id === current?.id ? styles.previewedResult : ""}`}>
              <button type="button" role="option" tabIndex={-1} aria-selected={item.id === current?.id} id={`${id}-${item.id}`} onPointerEnter={() => setHovered(item.id)} onClick={() => {setSelected(item.id); setHovered(undefined); input.current?.focus();}}>
                <Icon size={18} aria-hidden="true"/><span><strong>{item.name}</strong><small>{TYPE_LABELS[item.type]}{item.point ? ` · ${Math.hypot(item.point.x, item.point.y).toFixed(0)} NM from ${airport.icao}` : ` · ${airport.icao}`}</small></span>
              </button>
              {active && item.procedure && item.procedure.routes.length > 1 ? <div className={styles.transitions} role="group" aria-label={`${item.name} transition`}><span>Via</span>{item.procedure.routes.map(option => <button type="button" key={option.id} aria-pressed={option.id === route?.id} onPointerEnter={() => setHovered(item.id)} onClick={() => {setTransitions(map => ({...map, [item.procedure!.id]: option.id})); setSelected(item.id); input.current?.focus();}}>{option.name}</button>)}</div> : null}
              {previewed && adding.length && !loading ? <ol className={styles.chips} aria-label="Fixes that will be added">{adding.map((point, index) => <li key={index} className={styles.numbered}><span>{index + 1}</span>{point.name ?? `Waypoint ${index + 1}`}</li>)}</ol> : null}
              {previewed && loading ? <p role="status" className={styles.message}>Loading route preview…</p> : null}
              {previewed && loadError ? <div role="alert" className={styles.message}><p>{loadError}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry preview</button></div> : null}
            </div>;
          })}
        </div>
      </>}
      <div className={styles.addFooter}>
        <span>{!last ? "Starts the flight plan" : `Adds after ${last.name ?? "the last fix"} (fix ${a.flightPlan.length})`}{current?.type === "Approach" && !typing ? ". Approach clearance stays with the controller." : ""}</span>
        <button type="button" className={styles.primary} disabled={!canAdd} onClick={add}>{addLabel}</button>
      </div>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </div> : null}
  </div>;
}
