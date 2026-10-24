import {airportRunways, runwayEnds} from "./airports";
import {groundReady} from "./ground-ready";
import {MAX_TAXI_POINTS, type Aircraft, type Airport, type GroundRoute, type GroundRouteDestination, type Point, type TaxiPoint} from "./model";
import {buildTaxiGraph, planParkingRoute, planTaxiRoute, routeToNodes, TAXI_ROUTING, type TaxiGraph} from "./taxi-routing";
import {standPoints} from "./stand-geometry";

const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const groundPointKey = (p: Point) => `${p.x.toFixed(7)},${p.y.toFixed(7)}`;
export const canRouteGround = (a: Aircraft, airport: Airport) => a.active && !a.radar && a.altitude <= airport.elevation + 1 && ["parked", "taxi", "pushback", "lineup"].includes(a.mode);
export const groundRouteKind = (a: Aircraft, airport: Airport): GroundRoute["kind"] => !(a.enginesRunning ?? groundReady(a, airport)) && a.speed < .2 ? "pushback" : "taxi";
export function routeDestinationLabel(airport: Airport, destination: GroundRouteDestination) {
  if (destination.type === "runway") return `Runway ${destination.id}`;
  if (destination.type === "point") return "Waypoint";
  const name = airport.features.find(f => f.id === destination.id)?.name;
  return name ? /stand|gate|ramp/i.test(name) ? name : `Stand ${name}` : "Parking";
}

function projection(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return {x: a.x + t * dx, y: a.y + t * dy};
}

/** Split the destination edge before snapping the start, including same-edge trips. */
export function planPointRoute(airport: Airport, start: Point, destination: Point): ReturnType<typeof planTaxiRoute> {
  const source = buildTaxiGraph(airport);
  let best: {from: number; to: number; point: Point; gap: number} | undefined;
  source.edges.forEach((edges, from) => edges.forEach(edge => {
    if (edge.to < from || (edge.protectedBy?.length ?? 0) > 1) return;
    const point = projection(destination, source.points[from], source.points[edge.to]), d = gap(point, destination);
    if (!best || d < best.gap) best = {from, to: edge.to, point, gap: d};
  }));
  if (!best || best.gap > .06) return {error: "No compatible mapped taxiway near this destination."};
  const target = best as {from: number; to: number; point: Point; gap: number};
  const graph: TaxiGraph = {...source, points: [...source.points, target.point], edges: source.edges.map(edges => edges.map(edge => ({...edge})))};
  const id = source.points.length, edge = source.edges[target.from].find(e => e.to === target.to)!;
  graph.edges[target.from] = graph.edges[target.from].filter(e => e.to !== target.to);
  graph.edges[target.to] = graph.edges[target.to].filter(e => e.to !== target.from);
  graph.edges.push([]);
  for (const end of [target.from, target.to]) {
    const distance = gap(graph.points[end], target.point);
    graph.edges[end].push({...edge, to: id, distance}); graph.edges[id].push({...edge, to: end, distance});
  }
  return routeToNodes(graph, start, [id], false, [], undefined, airport);
}

export function destinationAt(airport: Airport, p: Point): GroundRouteDestination {
  const runwayBody = airportRunways(airport).map(pair => ({pair, distance: gap(p, projection(p, pair.ends[0].point, pair.ends[1].point))}))
    .filter(candidate => candidate.distance <= (candidate.pair.widthFeet ?? 150) / 6076).sort((a, b) => a.distance - b.distance)[0];
  if (runwayBody) return {type: "runway", id: [...runwayBody.pair.ends].sort((a, b) => gap(a.point, p) - gap(b.point, p))[0].id};
  const stand = airport.features.filter(f => f.kind === "parking_position" && f.points.length > 1).map(f => ({feature: f, distance: gap(standPoints(airport, f).at(-1)!, p)})).filter(f => f.distance < .015).sort((a, b) => a.distance - b.distance)[0]?.feature;
  if (stand) return {type: "parking", id: stand.id};
  const graph = buildTaxiGraph(airport);
  const hold = airportRunways(airport).flatMap(pair => (graph.runwayHolds?.[pair.id] ?? []).map(index => ({point: graph.points[index], pair})))
    .map(candidate => ({...candidate, distance: gap(candidate.point, p)})).filter(candidate => candidate.distance <= TAXI_ROUTING.snapDistance).sort((a, b) => a.distance - b.distance)[0];
  const runway = hold ? [...hold.pair.ends].sort((a, b) => gap(a.point, hold.point) - gap(b.point, hold.point))[0]
    : runwayEnds(airport).filter(end => gap(end.point, p) < .07).sort((a, b) => gap(a.point, p) - gap(b.point, p))[0];
  return runway ? {type: "runway", id: runway.id} : {type: "point"};
}

/** Existing controls follow mapped lines; a nearby parking endpoint takes priority. */
export function snapGroundControl(airport: Airport, point: Point, parkingRadius: number): Point {
  const parking = airport.features.filter(feature => feature.kind === "parking_position" && feature.points.length > 1)
    .map(feature => standPoints(airport, feature).at(-1)!).map(candidate => ({point: candidate, distance: gap(candidate, point)}))
    .filter(candidate => candidate.distance <= parkingRadius).sort((a, b) => a.distance - b.distance)[0];
  if (parking) return {...parking.point};
  const segments = airport.features.filter(feature => ["taxiway", "taxilane", "parking_position", "runway"].includes(feature.kind))
    .flatMap(feature => feature.points.slice(1).map((end, i) => projection(point, feature.points[i], end)));
  return segments.reduce((nearest, candidate) => !nearest || gap(candidate, point) < gap(nearest, point) ? candidate : nearest, undefined as Point | undefined) ?? point;
}

/** A runway drag targets the nearby entry hold, including intersection entries. */
function planRunwayDestination(airport: Airport, start: Point, point: Point, runway: string): ReturnType<typeof planTaxiRoute> {
  const inferred = destinationAt(airport, point);
  if (inferred.type !== "runway" || inferred.id !== runway) return planTaxiRoute(airport, start, runway);
  const graph = buildTaxiGraph(airport), pair = airportRunways(airport).find(pair => pair.ends.some(end => end.id === runway))!;
  const holds = graph.runwayHolds?.[pair.id] ?? [];
  const nearest = Math.min(...holds.map(index => gap(graph.points[index], point)));
  if (!Number.isFinite(nearest)) return {error: "No mapped hold-short point is available for this runway."};
  return routeToNodes(graph, start, holds.filter(index => gap(graph.points[index], point) <= nearest + .001), true, [], pair.id, airport);
}

function namePoints(airport: Airport, points: TaxiPoint[]) {
  const lines = airport.features.filter(f => ["taxiway", "taxilane", "parking_position"].includes(f.kind) && f.name).flatMap(f => f.points.slice(1).map((p, i) => ({a: f.points[i], b: p, name: f.name.slice(0, 100)})));
  return points.map((p, i) => {
    const from = points[i - 1]; if (!from) return {...p};
    const mid = {x: (from.x + p.x) / 2, y: (from.y + p.y) / 2};
    const line = lines.find(l => gap(mid, projection(mid, l.a, l.b)) < 1e-6 && gap(from, projection(from, l.a, l.b)) < 1e-6 && gap(p, projection(p, l.a, l.b)) < 1e-6);
    return {...p, ...(line ? {name: line.name} : {})};
  });
}

/** Controls describe intent; the returned path is always connected mapped geometry. */
export function buildGroundRoute(airport: Airport, kind: GroundRoute["kind"], controls: Point[], destination: GroundRouteDestination = {type: "point"}): {route?: GroundRoute; error?: string} {
  if (controls.length < 2 || controls.length > (kind === "pushback" ? 3 : 24)) return {error: kind === "pushback" ? "Pushback supports a push endpoint and one optional pull endpoint." : "Use between 2 and 24 route control points."};
  if (controls.some(p => ![p.x, p.y].every(n => Number.isFinite(n) && Math.abs(n) <= 2000))) return {error: "Place route points within the exercise area."};
  if (kind === "taxi" && destination.type === "point") destination = destinationAt(airport, controls.at(-1)!);
  const points: TaxiPoint[] = [{...controls[0]}], controlIndices = [0];
  let error: string | undefined;
  for (let i = 1; i < controls.length; i++) {
    const last = i === controls.length - 1;
    const result = last && kind === "taxi" && destination.type === "runway" ? planRunwayDestination(airport, points.at(-1)!, controls[i], destination.id!)
      : last && kind === "taxi" && destination.type === "parking" ? planParkingRoute(airport, points.at(-1)!, destination.id)
      : planPointRoute(airport, points.at(-1)!, controls[i]);
    if (!result.path || result.path.length < 2) return {error: result.error ?? "Choose a different destination."};
    const length = result.path.slice(1).reduce((total, p, j) => total + gap(result.path![j], p), 0);
    if (kind === "pushback" && length * 1852 > 300) error = "Each push or pull leg must be no longer than 300 metres.";
    points.push(...result.path.slice(1).map(p => kind === "pushback" ? {x: p.x, y: p.y} : {...p}));
    controlIndices.push(points.length - 1);
  }
  if (points.length > MAX_TAXI_POINTS) return {error: `A route supports up to ${MAX_TAXI_POINTS} waypoints.`};
  if (kind === "taxi" && destination.type === "runway") {
    // The entry endpoint is where taxi ends, not an intermediate Hold instruction.
    // Reviewed explicit holds are reapplied by the editor after this calculation.
    delete points.at(-1)!.hold;
    points.at(-1)!.runway = destination.id;
  }
  return {route: {airport: airport.icao, kind, controls: controls.map(p => ({...p})), destination: {...destination}, points: namePoints(airport, points), controlIndices}, ...(error ? {error} : {})};
}

/** Rebuild on the server to reject invented geometry/names, while retaining reviewed Hold choices. */
export function groundRouteError(airport: Airport, route: GroundRoute, kind: GroundRoute["kind"]): string | null {
  if (route.airport !== airport.icao || route.kind !== kind) return "This route belongs to another airport or ground operation.";
  if (route.destination.type === "runway" && !runwayEnds(airport).some(e => e.id === route.destination.id)) return "Choose a runway in this airport.";
  if (route.destination.type === "parking" && !airport.features.some(f => f.id === route.destination.id && f.kind === "parking_position")) return "Choose a mapped parking stand.";
  const built = buildGroundRoute(airport, kind, route.controls, route.destination);
  if (!built.route || built.error) return built.error!;
  const canonical = built.route;
  if (canonical.points.length !== route.points.length || canonical.controlIndices.some((n, i) => route.controlIndices[i] !== n) || route.controlIndices.length !== canonical.controlIndices.length || canonical.points.some((p, i) => gap(p, route.points[i]) > 1e-7 || p.name !== route.points[i].name || p.runway !== route.points[i].runway)) return "The mapped route changed. Recalculate before sending.";
  return null;
}

/** Join only a nearby remaining segment; delayed readback cannot teleport an aircraft. */
export function groundRouteJoin(a: Aircraft, route: GroundRoute): number | undefined {
  let best: {index: number; gap: number} | undefined;
  for (let i = 1; i < route.points.length; i++) {
    const d = gap(a.position, projection(a.position, route.points[i - 1], route.points[i]));
    if (!best || d < best.gap) best = {index: i, gap: d};
  }
  return best && best.gap <= TAXI_ROUTING.snapDistance ? best.index : undefined;
}

export function groundRouteText(route: GroundRoute, airport: Airport, pilot = false): string {
  if (route.kind === "pushback") return "pushback approved";
  const destination = route.destination.type === "runway" ? `runway ${route.destination.id}` : routeDestinationLabel(airport, route.destination);
  const names = route.points.flatMap((p, i) => p.name && p.name !== route.points[i - 1]?.name ? [p.name] : []);
  const hold = route.points.find(p => p.hold);
  const holdText = hold ? `, ${pilot ? "will hold" : "hold"} short${hold.runway ? ` of runway ${hold.runway}` : " at waypoint"}` : "";
  return `${pilot ? "taxiing" : "taxi"} to ${destination}${names.length ? ` via ${names.join(", ")}` : ""}${holdText}${!hold && route.destination.type === "runway" && !pilot ? ", contact tower when ready" : ""}`;
}

export function hitGroundRoute(route: GroundRoute, point: Point, tolerance: number): {index: number; insert: boolean} | undefined {
  for (let i = route.controls.length - 1; i > 0; i--) if (gap(point, route.controls[i]) <= tolerance) return {index: i, insert: false};
  let nearest: {index: number; distance: number} | undefined;
  for (let i = 1; i < route.points.length; i++) {
    const distance = gap(point, projection(point, route.points[i - 1], route.points[i]));
    if (distance <= tolerance && (!nearest || distance < nearest.distance)) nearest = {index: i, distance};
  }
  if (nearest) return {index: Math.max(1, route.controlIndices.findIndex(end => end >= nearest.index)), insert: true};
}
