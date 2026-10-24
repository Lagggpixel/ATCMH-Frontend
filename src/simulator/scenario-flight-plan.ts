import type {Aircraft, Point, RoutePoint} from "./model";
import type {NavigationCatalog, NavigationRoute} from "./navigation-data";

export type NavigationFilter = "All" | "Waypoint" | "SID" | "STAR" | "Approach";
export function navigationSearch(catalog: NavigationCatalog | undefined, query: string, filter: NavigationFilter) {
  const search = query.trim().toUpperCase();
  const fixes = filter === "All" || filter === "Waypoint" ? (catalog?.fixes ?? []).filter(fix => fix.name.toUpperCase().includes(search)) : [];
  const procedures = (catalog?.procedures ?? []).filter(procedure => (filter === "All" || filter === procedure.type)
    && (procedure.name.toUpperCase().includes(search) || procedure.routes.some(route => route.name.toUpperCase().includes(search))));
  const items: {id: string; name: string; type: Exclude<NavigationFilter, "All">; point?: RoutePoint; procedure?: NavigationCatalog["procedures"][number]}[] = [];
  for (const fix of fixes.slice(0, filter === "All" ? 10 : 40)) items.push({id: `fix-${fix.id}`, name: fix.name, type: "Waypoint", point: fix.point});
  for (const type of ["SID", "STAR", "Approach"] as const) for (const procedure of procedures.filter(item => item.type === type).slice(0, filter === "All" ? 10 : 40)) items.push({id: `procedure-${procedure.id}`, name: procedure.name, type, procedure});
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
  const routeIndex = !live ? 0 : kept ?? Math.min(r.routeIndex, flightPlan.length);
  const navigation = !flightPlan.length ? r.navigation === "route" || !live ? "heading" : r.navigation : live || aircraft.flightPlan.length ? r.navigation : "route";
  return {flightPlan, radar: {...r, routeIndex, navigation}, ...(!flightPlan.length ? {followRouteAltitudes: undefined} : {})};
}

export function moveFlightPlanLeg(points: RoutePoint[], from: number, to: number): RoutePoint[] {
  if (from === to || from < 0 || to < 0 || from >= points.length || to >= points.length) return points;
  const next = [...points], [leg] = next.splice(from, 1); next.splice(to, 0, leg); return next;
}

type Procedure = NavigationCatalog["procedures"][number];
export type TypedRouteEntry = {name: string; point: RoutePoint} | {name: string; procedure: Procedure; route: Procedure["routes"][number]};
const compact = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/** Resolve typed routes like "TLA DCT GOW" or "TLA1A.TLA". Repeated fix names use the one nearest the previous point. */
export function parseTypedRoute(catalog: NavigationCatalog, text: string, from: Point): {entries: TypedRouteEntry[]; error?: string} {
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

export function legAltitudeLabel(points: RoutePoint[], index: number, initialAltitude: number) {
  const target = points[index].altitude;
  if (target === undefined) return "Maintain previous altitude";
  let previous = initialAltitude;
  for (let i = 0; i < index; i++) previous = points[i].altitude ?? previous;
  return `${target > previous ? "Climb to" : target < previous ? "Descend to" : "Maintain"} ${target >= 18000 ? `FL${target / 100}` : `${target.toLocaleString("en-GB")} ft`}`;
}
