import {airportRunways} from "./airports";
import {aStar, buildTaxiGraph, routeToNodes} from "./taxi-routing";
import type {Airport, Point, Runway, TaxiPoint} from "./model";

/** Explicitly requested intersections have less runway available than full length. */
export const BRUSSELS_25L_C4 = {airport: "EBBR", runway: "25L", intersection: "C4", toraMetres: 1240, hold: {x: 0.476704199705411, y: -0.471346169506148}, featureId: "53270233"} as const;
export const DUBLIN_16_N = {airport: "EIDW", runway: "16", intersection: "N", toraMetres: 1653, hold: {x: 0.13412465982295, y: 0.29868644856965}, featureId: "1121017723"} as const;

/** Route to a charted intersection only when the controller selects it explicitly. */
export function planIntersectionTaxiRoute(airport: Airport, position: Point, runway: Runway, intersection: string, blocked: Point[] = []):
  {path: TaxiPoint[]; distance: number; intersection: string; toraMetres: number; error?: undefined} | {error: string; path?: undefined; distance?: undefined} {
  const choice = [BRUSSELS_25L_C4, DUBLIN_16_N].find(item => item.airport === airport.icao && item.runway === runway && item.intersection === intersection);
  if (!choice) return {error: "This runway intersection is not available."};
  const feature = airport.features.find(f => f.id === choice.featureId && f.kind === "taxiway" && f.name === intersection);
  const pair = airportRunways(airport).find(p => p.ends.some(e => e.id === runway));
  if (!feature || !pair) return {error: "The mapped runway entry is unavailable."};
  const graph = buildTaxiGraph(airport);
  const segmentDistance = (p: Point, a: Point, b: Point) => {
    const x = b.x - a.x, y = b.y - a.y, length = x * x + y * y;
    const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / length)) : 0;
    return Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y);
  };
  const goals = (graph.runwayHolds?.[pair.id] ?? []).filter(id => {
    const p = graph.points[id];
    return Math.hypot(p.x - choice.hold.x, p.y - choice.hold.y) < .001 && feature.points.slice(1).some((b, i) => segmentDistance(p, feature.points[i], b) < .000001);
  });
  if (goals.length !== 1) return {error: "The mapped runway entry is unavailable."};
  if (choice === DUBLIN_16_N) {
    // Verify the mapped N continuation reaches the 16/34 centreline without
    // using any other runway's protected area.
    const continuation = airport.features.find(f => f.id === "963984867" && f.kind === "taxiway" && f.name === "N");
    const center = {x: .109216040490432, y: .255468650374328};
    const targets = graph.points.flatMap((p, i) => Math.hypot(p.x - center.x, p.y - center.y) < .000001 && continuation?.points.slice(1).some((b, j) => segmentDistance(p, continuation.points[j], b) < .0001) ? [i] : []);
    const protectedGraph = {...graph, edges: graph.edges.map(edges => edges.filter(e => e.protectedBy?.length === 1 && e.protectedBy[0] === pair.id))};
    if (!targets.length || !aStar(protectedGraph, goals[0], targets)) return {error: "The mapped runway entry is unavailable."};
  }
  const route = routeToNodes(graph, position, goals, false, blocked, pair.id, airport);
  if (!route.path) return {error: route.error};
  route.path.at(-1)!.runway = runway;
  return {...route, intersection, toraMetres: choice.toraMetres};
}


