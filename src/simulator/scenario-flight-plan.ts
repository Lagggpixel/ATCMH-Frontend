import type {Aircraft, RoutePoint} from "./model";
import type {NavigationCatalog} from "./navigation-data";

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

export function flightPlanPatch(aircraft: Aircraft, flightPlan: RoutePoint[]): Partial<Aircraft> {
  return {flightPlan, ...(aircraft.radar ? {radar: {...aircraft.radar, routeIndex: 0,
    navigation: !flightPlan.length ? "heading" : !aircraft.flightPlan.length ? "route" : aircraft.radar.navigation}} : {}),
    ...(!flightPlan.length ? {followRouteAltitudes: undefined} : {})};
}

export function legAltitudeLabel(points: RoutePoint[], index: number, initialAltitude: number) {
  const target = points[index].altitude;
  if (target === undefined) return "Maintain previous altitude";
  let previous = initialAltitude;
  for (let i = 0; i < index; i++) previous = points[i].altitude ?? previous;
  return `${target > previous ? "Climb to" : target < previous ? "Descend to" : "Maintain"} ${target >= 18000 ? `FL${target / 100}` : `${target.toLocaleString("en-GB")} ft`}`;
}
