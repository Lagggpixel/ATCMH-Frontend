import type {Aircraft, Point, RouteProcedure, RoutePoint} from "./model";
import type {NavigationCatalog, NavigationRoute} from "./navigation-data";
import type {ScopeMapData} from "./scope-map-data";

type AirportFix = ScopeMapData["airports"][number];
export type NavigationFilter = "All" | "Waypoint" | "Airport" | "SID" | "STAR" | "Approach";
export function navigationSearch(catalog: NavigationCatalog | undefined, query: string, filter: NavigationFilter, airports: readonly AirportFix[] = []) {
  const search = query.trim().toUpperCase();
  const fixes = filter === "All" || filter === "Waypoint" ? (catalog?.fixes ?? []).filter(fix => fix.name.toUpperCase().includes(search)) : [];
  const airportMatches = filter === "All" || filter === "Waypoint" || filter === "Airport" ? airports.filter(item => item.identifier.toUpperCase().includes(search) || item.name?.toUpperCase().includes(search)) : [];
  const procedures = (catalog?.procedures ?? []).filter(procedure => (filter === "All" || filter === procedure.type)
    && (procedure.name.toUpperCase().includes(search) || procedure.routes.some(route => route.name.toUpperCase().includes(search))));
  const items: {id: string; name: string; type: Exclude<NavigationFilter, "All">; point?: RoutePoint; procedure?: NavigationCatalog["procedures"][number]}[] = [];
  for (const airport of airportMatches.slice(0, filter === "All" ? 10 : 40)) items.push({id: `airport-${airport.id}`, name: airport.identifier, type: "Airport", point: {...airport.point, name: airport.identifier}});
  for (const fix of fixes.slice(0, filter === "All" ? 10 : 40)) items.push({id: `fix-${fix.id}`, name: fix.name, type: "Waypoint", point: fix.point});
  for (const type of ["SID", "STAR", "Approach"] as const) for (const procedure of procedures.filter(item => item.type === type)) items.push({id: `procedure-${procedure.id}`, name: procedure.name, type, procedure});
  return items;
}

/** Only the shared boundary is merged; repeated fixes inside either route are intentional. */
export function appendFlightPlan(existing: RoutePoint[], incoming: RoutePoint[]): RoutePoint[] {
  const points = structuredClone(existing), added = structuredClone(incoming);
  const last = points.at(-1), first = added[0];
  if (last && first && last.name === first.name && Math.hypot(last.x - first.x, last.y - first.y) < .000001) {
    points[points.length - 1] = {...first, ...last}; added.shift();
  }
  if (points.length + added.length > 200) throw new Error("This flight plan would exceed 200 waypoints. Remove some legs before adding the complete procedure.");
  return [...points, ...added];
}

/** Seeds restart at the first fix. A live aircraft keeps flying to the fix it was heading for. */
export function flightPlanPatch(aircraft: Aircraft, flightPlan: RoutePoint[], live = false): Partial<Aircraft> {
  const r = aircraft.radar;
  if (!r) return {flightPlan, ...(!flightPlan.length ? {followRouteAltitudes: undefined} : {})};
  const target = live ? aircraft.flightPlan[r.routeIndex] : undefined;
  const matches = target ? flightPlan.flatMap((p, i) => p.name === target.name && Math.hypot(p.x - target.x, p.y - target.y) < 1e-6 ? [i] : []) : [];
  const kept = matches.sort((a, b) => Math.abs(a - r.routeIndex) - Math.abs(b - r.routeIndex))[0];
  const preparingDeparture = live && !!r.departure && (aircraft.flightPlan.length === 0 || r.navigation === "route" && r.routeIndex === 0);
  const routeIndex = !live || preparingDeparture ? 0 : kept ?? Math.min(r.routeIndex, flightPlan.length);
  const navigation = !flightPlan.length ? r.navigation === "route" || !live ? "heading" : r.navigation : preparingDeparture && !aircraft.flightPlan.length ? "route" : live || aircraft.flightPlan.length ? r.navigation : "route";
  return {flightPlan, radar: {...r, routeIndex, navigation}, ...(!flightPlan.length ? {followRouteAltitudes: undefined} : r.departure && (!live || !aircraft.flightPlan.length) ? {followRouteAltitudes: true} : {})};
}

/** One row of the editor: a lone fix, or consecutive fixes added from one procedure. */
export type FlightPlanItem = {start: number; end: number; procedure?: RouteProcedure};
export function flightPlanItems(points: RoutePoint[]): FlightPlanItem[] {
  const items: FlightPlanItem[] = [];
  points.forEach((point, index) => {
    const last = items.at(-1);
    if (point.procedure && last?.procedure?.key === point.procedure.key) last.end = index;
    else items.push({start: index, end: index, ...(point.procedure ? {procedure: point.procedure} : {})});
  });
  return items;
}

/** Tags a procedure's fixes so the editor shows and moves them together; a new key keeps repeated copies apart. */
export function tagProcedure(points: RoutePoint[], route: Pick<NavigationRoute, "type" | "name" | "simplified">, transition?: string, key = Math.random().toString(36).slice(2, 12)): RoutePoint[] {
  const procedure: RouteProcedure = {key, type: route.type, name: route.name, ...(route.simplified ? {simplified: true} : {}), ...(transition && transition.toUpperCase() !== route.name.toUpperCase() ? {transition} : {})};
  return points.map(point => ({...point, procedure}));
}

/** Moves fixes start..end so they begin at `slot`, an index of the unchanged plan. Slots inside the range are no-ops. */
export function moveFlightPlanRange(points: RoutePoint[], start: number, end: number, slot: number): RoutePoint[] {
  if (start < 0 || start > end || end >= points.length || slot < 0 || slot > points.length || slot >= start && slot <= end + 1) return points;
  const block = points.slice(start, end + 1), rest = [...points.slice(0, start), ...points.slice(end + 1)];
  const at = slot > end ? slot - block.length : slot;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/** Moves the item starting at `start` past one whole neighbouring item, so procedures are never split. */
export function moveFlightPlanItem(points: RoutePoint[], start: number, direction: -1 | 1): RoutePoint[] {
  const items = flightPlanItems(points), index = items.findIndex(item => item.start === start);
  const item = items[index], neighbour = items[index + direction];
  return item && neighbour ? moveFlightPlanRange(points, item.start, item.end, direction < 0 ? neighbour.start : neighbour.end + 1) : points;
}

/** The fixes an append would add after the existing plan, without the merged join; empty past the 200-fix limit. */
export function appendedFixes(existing: RoutePoint[], incoming: RoutePoint[]): RoutePoint[] {
  try {return appendFlightPlan(existing, incoming).slice(existing.length);} catch {return [];}
}

export function moveFlightPlanLeg(points: RoutePoint[], from: number, to: number): RoutePoint[] {
  if (from === to || from < 0 || to < 0 || from >= points.length || to >= points.length) return points;
  const next = [...points], [leg] = next.splice(from, 1); next.splice(to, 0, leg); return next;
}

type Procedure = NavigationCatalog["procedures"][number];
export type TypedRouteEntry = {name: string; point: RoutePoint} | {name: string; procedure: Procedure; route: Procedure["routes"][number]};
const compact = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/** Resolve typed routes like "TLA DCT GOW" or "TLA1A.TLA". Repeated fix names use the one nearest the previous point. */
export function parseTypedRoute(catalog: NavigationCatalog, text: string, from: Point, airports: readonly AirportFix[] = []): {entries: TypedRouteEntry[]; error?: string} {
  const tokens = text.toUpperCase().split(/[\s,]+/).filter(token => token && token !== "DCT");
  const entries: TypedRouteEntry[] = [];
  let last = from;
  for (let i = 0; i < tokens.length; i++) {
    const [name, transition, extra] = tokens[i].split(".");
    if (!name || extra !== undefined || transition === "") return {entries, error: `Write a procedure transition as PROCEDURE.TRANSITION, not ${tokens[i]}.`};
    const procedure = catalog.procedures.find(p => compact(p.name) === name);
    if (procedure) {
      // Without an explicit transition, a neighbouring fix that names one picks it.
      const route = transition ? procedure.routes.find(r => compact(r.name) === transition) : procedure.routes.find(r => [tokens[i - 1], tokens[i + 1]].includes(compact(r.name))) ?? procedure.routes[0];
      if (!route) return {entries, error: transition ? `${procedure.name} has no ${transition} transition.` : `${procedure.name} has no routes.`};
      entries.push({name: `${procedure.name} · ${route.name}`, procedure, route});
      continue;
    }
    if (transition) return {entries, error: `No procedure named ${name} at ${catalog.airport}.`};
    const airport = airports.find(item => item.identifier.toUpperCase() === name);
    if (airport) {const point = {...airport.point, name: airport.identifier}; entries.push({name: airport.identifier, point}); last = point; continue;}
    const fixes = catalog.fixes.filter(f => f.name.toUpperCase() === name);
    if (!fixes.length) return {entries, error: `No waypoint or procedure named ${name} at ${catalog.airport}.`};
    const fix = fixes.reduce((best, f) => Math.hypot(f.point.x - last.x, f.point.y - last.y) < Math.hypot(best.point.x - last.x, best.point.y - last.y) ? f : best);
    entries.push({name: fix.name, point: {...fix.point, name: fix.point.name ?? fix.name}});
    last = fix.point;
  }
  return entries.length ? {entries} : {entries, error: "Type at least one waypoint or procedure."};
}

export async function fetchNavigationRoute(catalog: NavigationCatalog, procedureId: string, routeId: string, signal?: AbortSignal): Promise<NavigationRoute> {
  const response = await fetch(`/api/simulator/navigation?${new URLSearchParams({airport: catalog.airport, route: routeId, revision: catalog.revision})}`, {credentials: "same-origin", signal});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message ?? value.error ?? "Unable to load this route.");
  const route = value as NavigationRoute;
  if (route.airport !== catalog.airport || route.revision !== catalog.revision || route.procedureId !== procedureId || route.routeId !== routeId || !route.points?.length) throw new Error("Navigation data changed. Refresh the catalogue and try again.");
  return route;
}

// Route previews refetch on every hover, so reuse loaded procedures for the catalogue revision.
const loadedRoutes = new Map<string, Promise<NavigationRoute>>();
export function loadNavigationRoute(catalog: NavigationCatalog, procedureId: string, routeId: string): Promise<NavigationRoute> {
  const key = JSON.stringify([catalog.airport, catalog.revision, procedureId, routeId]);
  let route = loadedRoutes.get(key);
  if (!route) {
    route = fetchNavigationRoute(catalog, procedureId, routeId);
    route.catch(() => loadedRoutes.delete(key));
    loadedRoutes.set(key, route);
  }
  return route;
}

/** Resolves typed entries to tagged fixes, plus the navigation source and STAR the aircraft should record. */
export async function typedRoutePoints(catalog: NavigationCatalog, entries: TypedRouteEntry[]) {
  let points: RoutePoint[] = [], source: Aircraft["navigationSource"] = {revision: catalog.revision}, star: string | undefined, simplified = false;
  for (const entry of entries) {
    if ("point" in entry) {points = appendFlightPlan(points, [entry.point]); continue;}
    const route = await loadNavigationRoute(catalog, entry.procedure.id, entry.route.id);
    points = appendFlightPlan(points, tagProcedure(route.points, route, entry.route.name));
    source = {revision: route.revision, procedureId: route.procedureId, routeId: route.routeId};
    if (route.type === "STAR") star = route.name;
    if (route.simplified) simplified = true;
  }
  return {points, source, star, simplified};
}

export function legAltitudeLabel(points: RoutePoint[], index: number, initialAltitude: number) {
  const target = points[index].altitude;
  if (target === undefined) return "Maintain previous altitude";
  let previous = initialAltitude;
  for (let i = 0; i < index; i++) previous = points[i].altitude ?? previous;
  return `${target > previous ? "Climb to" : target < previous ? "Descend to" : "Maintain"} ${target >= 18000 ? `FL${target / 100}` : `${target.toLocaleString("en-GB")} ft`}`;
}
