import {MAX_TAXI_POINTS} from "./model";
import {airportRunways} from "./airports";
import type {Airport, Point, Runway, TaxiPoint} from "./model";
// Distances are nautical miles. Routing uses mapped centerlines only, never apron polygons.

export const TAXI_ROUTING = {snapDistance: .025, holdDistance: .04, runwayEndMargin: .025, departureAccessRadius: .2};
type Edge = {to: number; distance: number; protectedBy?: string[]};

export interface TaxiGraph {points: Point[]; edges: Edge[][]; holds: number[]; runwayHolds?: Record<string, number[]>}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const interpolate = (a: Point, b: Point, t: number): Point => ({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t});
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const subtract = (a: Point, b: Point): Point => ({x: a.x - b.x, y: a.y - b.y});
const cache = new WeakMap<Airport, TaxiGraph>();
/** Split mapped centerlines and mark each runway's protected edges separately. */

export function buildTaxiGraph(airport: Airport): TaxiGraph {
  const cached = cache.get(airport); if (cached) return cached;
  const segments = airport.features.filter(f => ["taxiway", "taxilane", "parking_position"].includes(f.kind)).flatMap(f => f.points.slice(1).map((b, i) => ({a: f.points[i], b, cuts: [0, 1]}))).filter(s => distance(s.a, s.b) > 1e-8);
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    if (Math.max(segments[i].a.x, segments[i].b.x) < Math.min(segments[j].a.x, segments[j].b.x) - 1e-8 || Math.max(segments[j].a.x, segments[j].b.x) < Math.min(segments[i].a.x, segments[i].b.x) - 1e-8 || Math.max(segments[i].a.y, segments[i].b.y) < Math.min(segments[j].a.y, segments[j].b.y) - 1e-8 || Math.max(segments[j].a.y, segments[j].b.y) < Math.min(segments[i].a.y, segments[i].b.y) - 1e-8) continue;
    const a = segments[i], b = segments[j], r = subtract(a.b, a.a), s = subtract(b.b, b.a), denominator = cross(r, s);
    if (Math.abs(denominator) < 1e-12) continue;
    const delta = subtract(b.a, a.a), t = cross(delta, s) / denominator, u = cross(delta, r) / denominator;
    if (t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8) {a.cuts.push(Math.max(0, Math.min(1, t))); b.cuts.push(Math.max(0, Math.min(1, u)));}
  }
  const areas = airportRunways(airport).map(pair => {
    const start = pair.ends[0].point, end = pair.ends[1].point, length = distance(start, end);
    const vector = {x: (end.x - start.x) / length, y: (end.y - start.y) / length};
    const local = (p: Point) => ({x: (p.x - start.x) * vector.x + (p.y - start.y) * vector.y, y: (p.x - start.x) * -vector.y + (p.y - start.y) * vector.x});
    const inside = (p: Point) => {const q = local(p); return q.x > -TAXI_ROUTING.runwayEndMargin + 1e-8 && q.x < length + TAXI_ROUTING.runwayEndMargin - 1e-8 && Math.abs(q.y) < TAXI_ROUTING.holdDistance - 1e-8;};
    return {pair, length, local, inside};
  });
  const graph: TaxiGraph = {points: [], edges: [], holds: [], runwayHolds: {}}, ids = new Map<string, number>();
  const node = (p: Point) => {const key = `${p.x.toFixed(7)},${p.y.toFixed(7)}`; const existing = ids.get(key); if (existing !== undefined) return existing; const id = graph.points.length; ids.set(key, id); graph.points.push(p); graph.edges.push([]); return id;};
  for (const segment of segments) {
    for (const area of areas) {
      const a = area.local(segment.a), b = area.local(segment.b);
      for (const [axis, values] of [["x", [-TAXI_ROUTING.runwayEndMargin, area.length + TAXI_ROUTING.runwayEndMargin]], ["y", [-TAXI_ROUTING.holdDistance, TAXI_ROUTING.holdDistance]]] as const) {
        const delta = b[axis] - a[axis];
        if (Math.abs(delta) > 1e-12) for (const value of values) {const t = (value - a[axis]) / delta; if (t > 0 && t < 1) segment.cuts.push(t);}
      }
    }
    const cuts = [...new Set(segment.cuts.map(t => Math.round(t * 1e10) / 1e10))].sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const p = interpolate(segment.a, segment.b, cuts[i - 1]), q = interpolate(segment.a, segment.b, cuts[i]);
      if (distance(p, q) < 1e-8) continue;
      const protectedBy = areas.filter(area => area.inside(interpolate(p, q, .5))).map(area => area.pair.id);
      const from = node(p), to = node(q), cost = distance(p, q);
      graph.edges[from].push({to, distance: cost, protectedBy}); graph.edges[to].push({to: from, distance: cost, protectedBy});
    }
  }
  for (const area of areas) {
    const holds = graph.points.flatMap((p, i) => {const q = area.local(p); return q.x >= -TAXI_ROUTING.runwayEndMargin - 1e-6 && q.x <= area.length + TAXI_ROUTING.runwayEndMargin + 1e-6 && Math.abs(Math.abs(q.y) - TAXI_ROUTING.holdDistance) < 1e-6 ? [i] : [];});
    graph.runwayHolds![area.pair.id] = holds; graph.holds.push(...holds);
  }
  cache.set(airport, graph); return graph;
}
/** A* with Euclidean admissible heuristic and deterministic tie-breaking. */

export function aStar(graph: TaxiGraph, start: number, goals: number[]): number[] | null {
  if (!goals.length) return null;
  const targets = new Set(goals), open = new Set([start]), previous = new Map<number, number>(), scores = new Map([[start, 0]]);
  const heuristic = (id: number) => Math.min(...goals.map(goal => distance(graph.points[id], graph.points[goal])));
  const estimates = new Map([[start, heuristic(start)]]);
  while (open.size) {
    const current = [...open].reduce((best, id) => estimates.get(id)! < estimates.get(best)! ? id : best);
    if (targets.has(current)) {const result = [current]; while (previous.has(result[0])) result.unshift(previous.get(result[0])!); return result;}
    open.delete(current);
    for (const edge of graph.edges[current]) {
      const score = scores.get(current)! + edge.distance;
      if (score + 1e-10 < (scores.get(edge.to) ?? Infinity)) {scores.set(edge.to, score); estimates.set(edge.to, score + heuristic(edge.to)); previous.set(edge.to, current); open.add(edge.to);}
    }
  }
  return null;
}

export function planTaxiRoute(airport: Airport, position: Point, runway: Runway, blocked: Point[] = []): {path: TaxiPoint[]; distance: number; error?: undefined} | {error: string; path?: undefined; distance?: undefined} {
  const source = buildTaxiGraph(airport), threshold = airportRunways(airport).flatMap(pair => pair.ends).find(end => end.id === runway)?.point;
  if (!threshold) return {error: "Runway is not in the airport snapshot."};
  const pair = airportRunways(airport).find(pair => pair.ends.some(end => end.id === runway))!;
  const first = pair.ends[0].point, last = pair.ends[1].point, length = distance(first, last);
  const v = {x: (last.x - first.x) / length, y: (last.y - first.y) / length};
  const along = (position.x - first.x) * v.x + (position.y - first.y) * v.y;
  const lateral = Math.abs((position.x - first.x) * -v.y + (position.y - first.y) * v.x);
  if (along > -TAXI_ROUTING.runwayEndMargin && along < length + TAXI_ROUTING.runwayEndMargin && lateral < TAXI_ROUTING.holdDistance - 1e-7) return {error: "Aircraft is inside the runway protected area. Reposition onto a taxiway before calculating a departure route."};
  const holds = source.runwayHolds?.[pair.id] ?? source.holds;
  // Some thresholds have only an intersection connector; departureRoute back-taxis
  // from that mapped hold to the full-length threshold before starting the roll.
  const closest = Math.min(...holds.map(id => distance(source.points[id], threshold)));
  const radius = Math.min(.5, Math.max(TAXI_ROUTING.departureAccessRadius, closest + .001));
  const goals = holds.filter(id => distance(source.points[id], threshold) <= radius);
  return routeToNodes(source, position, goals, true, blocked, pair.id, airport);
}

function routeToNodes(source: TaxiGraph, position: Point, goals: number[], hold: boolean, blocked: Point[] = [], forbidden?: string, airport?: Airport): {path: TaxiPoint[]; distance: number; error?: undefined} | {error: string; path?: undefined; distance?: undefined} {
  const graph: TaxiGraph = {points: [...source.points], edges: source.edges.map(edges => edges.filter(edge => (!forbidden || !edge.protectedBy?.includes(forbidden)) && (edge.protectedBy?.length ?? 0) < 2)), holds: source.holds};
  let nearest: {from: number; to: number; point: Point; gap: number} | undefined;
  graph.edges.forEach((edges, from) => edges.forEach(({to}) => {if (to < from) return; const a = graph.points[from], b = graph.points[to], dx = b.x - a.x, dy = b.y - a.y; const t = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.y - a.y) * dy) / (dx * dx + dy * dy))); const point = interpolate(a, b, t), gap = distance(position, point); if (!nearest || gap < nearest.gap) nearest = {from, to, point, gap};}));
  if (!nearest || nearest.gap > TAXI_ROUTING.snapDistance) return {error: "No mapped taxiway near this aircraft. Reposition it onto a taxiway or stand centerline."};
  const snap = nearest as {from: number; to: number; point: Point; gap: number};
  const start = graph.points.length; graph.points.push(snap.point); graph.edges.push([{to: snap.from, distance: distance(snap.point, graph.points[snap.from])}, {to: snap.to, distance: distance(snap.point, graph.points[snap.to])}]);
  const obstructed = (from: Point, to: Point) => blocked.some(p => {
    const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / length)) : 0;
    return distance(p, interpolate(from, to, t)) < .025;
  });
  graph.edges = graph.edges.map((edges, from) => edges.filter(edge => !obstructed(graph.points[from], graph.points[edge.to])));
  const route = aStar(graph, start, goals);
  if (!route) return {error: "No connected taxiway route to this destination. Reposition or draw a route manually."};
  const crossingHolds = new Map<Point, string>();
  for (let i = 0; i < route.length - 1; i++) {
    const edge = graph.edges[route[i]].find(e => e.to === route[i + 1]);
    const prior = i ? graph.edges[route[i - 1]].find(e => e.to === route[i]) : undefined;
    const entered = edge?.protectedBy?.find(id => !prior?.protectedBy?.includes(id));
    if (entered && airport) crossingHolds.set(graph.points[route[i]], airportRunways(airport).find(pair => pair.id === entered)!.ends[0].id);
  }
  const points: TaxiPoint[] = [];
  for (const p of [position, ...route.map(id => graph.points[id])]) {
    const value = {...p, ...(crossingHolds.has(p) ? {hold: true, runway: crossingHolds.get(p)} : {})};
    if (points.length && distance(p, points.at(-1)!) <= 1e-7) Object.assign(points.at(-1)!, value);
    else points.push(value);
  }
  // Graph intersections on a straight centerline do not need extra steering points.
  // Preserve every turn and every runway boundary/hold, including crossing exits.
  for (let i = points.length - 2; i > 0; i--) {
    const p = points[i], a = points[i - 1], b = points[i + 1];
    const isBoundary = source.holds.some(id => distance(source.points[id], p) < 1e-7);
    if (!p.hold && !isBoundary && Math.abs(cross(subtract(p, a), subtract(b, p))) < 1e-10 && (p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y) >= 0) points.splice(i, 1);
  }
  if (points.length < 2) return {error: "Aircraft is already at this destination."};
  if (points.length > MAX_TAXI_POINTS) return {error: `Calculated route exceeds ${MAX_TAXI_POINTS} points. Draw a shorter route manually.`};
  return {path: points.map((p, i) => ({...p, ...(hold && i === points.length - 1 ? {hold: true} : {})})), distance: points.slice(1).reduce((total, p, i) => total + distance(points[i], p), 0)};
}
/** Choose a reachable mapped stand, excluding occupied destinations. */

export function planParkingRoute(airport: Airport, position: Point, standId?: string, occupied: Point[] = []): ReturnType<typeof routeToNodes> {
  const graph = buildTaxiGraph(airport);
  const stands = airport.features.filter(f => f.kind === "parking_position" && f.points.length > 1 && (!standId || f.id === standId));
  const goals = stands.flatMap(stand => {
    const end = stand.points.at(-1)!;
    if (occupied.some(p => distance(p, end) < .03)) return [];
    const node = graph.points.findIndex(p => distance(p, end) < 1e-6);
    return node < 0 ? [] : [node];
  });
  if (!goals.length) return {error: "No unoccupied mapped parking destination is available."};
  if (goals.some(id => distance(position, graph.points[id]) < 1e-6)) return {path: [{...position}], distance: 0};
  return routeToNodes(graph, position, goals, false, [], undefined, airport);
}
