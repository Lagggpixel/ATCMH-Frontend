import type {Aircraft, Airport, Point, TaxiPoint} from "./model";
import {airportRunways} from "./airports";
import {aStar, buildTaxiGraph, routeToNodes, TAXI_ROUTING} from "./taxi-routing";
import {courseDifference, courseTo} from "./command-navigation";

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
type GroundPlan = {path: TaxiPoint[]; leader?: string; error?: undefined} | {error: string; path?: undefined; leader?: undefined};

/** A clearance belongs to the first hold ahead, never to an arbitrary waypoint. */
export function crossingHold(airport: Airport, a: Aircraft, runway?: string): {index: number; error?: undefined} | {error: string; index?: undefined} {
  if (!["taxi", "parked"].includes(a.mode)) return {error: "This instruction requires taxiing or stopped ground traffic."};
  const index = a.taxiPath.findIndex((point, i) => i >= a.taxiIndex && point.hold);
  if (index < 0) return {error: "The taxi path has no upcoming runway crossing."};
  const hold = a.taxiPath[index];
  if (runway && hold.runway && !airportRunways(airport).some(pair => pair.ends.some(end => end.id === runway) && pair.ends.some(end => end.id === hold.runway)))
    return {error: "Clearance must match the runway at the next hold point."};
  if (!a.taxiPath.slice(index + 1).some(point => distance(point, hold) > 1e-7))
    return {error: "The taxi path ends at this hold point. Configure a route across the runway first."};
  return {index};
}

/** Travel to the next mapped junction, then take the selected branch. */
export function progressiveRoute(airport: Airport, a: Aircraft, variant: string, traffic: Aircraft[] = []): GroundPlan {
  if (variant === "follow") {
    const ahead = traffic.filter(b => b.id !== a.id && b.active && ["taxi", "lineup"].includes(b.mode) && Math.abs(b.altitude - a.altitude) < 50 && distance(a.position, b.position) <= .5
      && Math.abs(courseDifference(a.heading, courseTo(a.position, b.position))) < 45 && Math.abs(courseDifference(a.heading, b.heading)) < 60)
      .sort((b, c) => distance(a.position, b.position) - distance(a.position, c.position))[0];
    if (!ahead || !ahead.taxiPath[ahead.taxiIndex]) return {error: "No taxiing aircraft ahead with a mapped route to follow."};
    const graph = buildTaxiGraph(airport), next = ahead.taxiPath[ahead.taxiIndex];
    const goal = graph.points.map((p, i) => ({i, gap: distance(p, next)})).sort((l, r) => l.gap - r.gap)[0];
    if (!goal || goal.gap > TAXI_ROUTING.snapDistance) return {error: "The aircraft ahead has no connected mapped taxi route."};
    const join = routeToNodes(graph, a.position, [goal.i], !!next.hold, [], undefined, airport);
    if (!join.path) return join;
    if (next.runway) join.path.at(-1)!.runway = next.runway;
    return {path: [...join.path, ...ahead.taxiPath.slice(ahead.taxiIndex + 1).map(p => ({...p}))], leader: ahead.id};
  }
  const graph = buildTaxiGraph(airport);
  let snap: {point: Point; from: number; to: number; gap: number} | undefined;
  for (let from = 0; from < graph.points.length; from++) for (const edge of graph.edges[from]) {
    if (edge.to < from) continue;
    const p = graph.points[from], q = graph.points[edge.to], dx = q.x - p.x, dy = q.y - p.y;
    const t = Math.max(0, Math.min(1, ((a.position.x - p.x) * dx + (a.position.y - p.y) * dy) / (dx * dx + dy * dy)));
    const point = {x: p.x + dx * t, y: p.y + dy * t}, gap = distance(a.position, point);
    if (!snap || gap < snap.gap) snap = {point, from, to: edge.to, gap};
  }
  if (!snap || snap.gap > TAXI_ROUTING.snapDistance) return {error: "No mapped taxiway near this aircraft."};
  const desired = (a.heading + (variant === "reverse" ? 180 : 0)) % 360;
  const endpoints = [snap.from, snap.to].sort((l, r) => Math.abs(courseDifference(desired, courseTo(snap!.point, graph.points[l]))) - Math.abs(courseDifference(desired, courseTo(snap!.point, graph.points[r]))));
  let current = endpoints.find(i => distance(snap!.point, graph.points[i]) > 1e-7) ?? endpoints[0];
  let previous = current === snap.from ? snap.to : snap.from, turned = variant === "reverse";
  const points: TaxiPoint[] = [{...a.position}, {...snap.point}], seen = new Set<number>();
  for (let step = 0; step < graph.points.length; step++) {
    if (seen.has(current)) break; seen.add(current);
    const p = graph.points[current];
    const incoming = courseTo(graph.points[previous], p);
    const options = graph.edges[current].filter(e => e.to !== previous && !seen.has(e.to)).map(e => ({...e, angle: courseDifference(incoming, courseTo(p, graph.points[e.to]))}));
    const entering = options.find(e => e.protectedBy?.length);
    const runway = entering?.protectedBy?.[0];
    points.push({...p, ...(runway ? {hold: true, runway: airportRunways(airport).find(pair => pair.id === runway)!.ends[0].id} : {})});
    if (runway || !options.length) break;
    const junction = options.filter(e => Math.abs(e.angle) > 20).length > 0;
    if (turned && junction) break;
    const selected = variant === "left" ? options.filter(e => e.angle < -20).sort((l, r) => Math.abs(l.angle + 90) - Math.abs(r.angle + 90))[0]
      : variant === "right" ? options.filter(e => e.angle > 20).sort((l, r) => Math.abs(l.angle - 90) - Math.abs(r.angle - 90))[0] : undefined;
    const next = !turned && selected ? selected : options.sort((l, r) => Math.abs(l.angle) - Math.abs(r.angle))[0];
    if (!turned && selected) turned = true;
    else if (!turned && ["left", "right"].includes(variant) && Math.abs(next.angle) > 30) break;
    previous = current; current = next.to;
  }
  if (["left", "right"].includes(variant) && !turned) return {error: `No reachable mapped ${variant} taxiway before the next stop.`};
  const path = points.filter((p, i) => i === 0 || distance(p, points[i - 1]) > 1e-7);
  return path.length > 1 ? {path} : {error: "No connected taxiway ahead."};
}

/** Reach the named runway's hold line, then optionally cross its protected edges. */
export function runwayContinuation(airport: Airport, position: Point, runway: string, cross: boolean): GroundPlan {
  const graph = buildTaxiGraph(airport), pair = airportRunways(airport).find(p => p.ends.some(e => e.id === runway));
  if (!pair) return {error: "Runway is not in this airport snapshot."};
  const holds = graph.runwayHolds?.[pair.id] ?? [];
  const approach = routeToNodes(graph, position, holds, true, [], pair.id, airport);
  if (approach.path) approach.path.at(-1)!.runway = runway;
  if (!approach.path || !cross) return approach;
  const start = graph.points.findIndex(p => distance(p, approach.path.at(-1)!) < 1e-6);
  const p = pair.ends[0].point, q = pair.ends[1].point, length = distance(p, q);
  const lateral = (point: Point) => ((point.x - p.x) * -(q.y - p.y) + (point.y - p.y) * (q.x - p.x)) / length;
  const side = Math.sign(lateral(graph.points[start]));
  const goals = graph.points.flatMap((point, i) => side * lateral(point) <= -.06 && distance(point, graph.points[start]) < 2 ? [i] : []);
  const crossingGraph = {...graph, edges: graph.edges.map((edges, from) => edges.filter(e => !e.protectedBy?.some(id => id !== pair.id) && distance(graph.points[from], graph.points[start]) < 2 && distance(graph.points[e.to], graph.points[start]) < 2))};
  const across = aStar(crossingGraph, start, goals);
  if (!across) return {error: "No mapped crossing to the far side of this runway."};
  const path = [...approach.path.map((point, i) => i === approach.path.length - 1 ? {x: point.x, y: point.y} : point), ...across.slice(1).map(i => ({...graph.points[i]}))];
  return {path};
}

/** Back taxi follows the centerline; ground contact requires a mapped exit. */
export function backTaxiRoute(airport: Airport, a: Aircraft, runway: string, exit: boolean): GroundPlan {
  const pair = airportRunways(airport).find(p => p.ends.some(e => e.id === runway))!;
  const end = pair.ends.find(e => e.id === runway)!, other = pair.ends.find(e => e.id !== runway)!, size = distance(end.point, other.point);
  const v = {x: (other.point.x - end.point.x) / size, y: (other.point.y - end.point.y) / size};
  const along = (a.position.x - end.point.x) * v.x + (a.position.y - end.point.y) * v.y;
  const lateral = Math.abs((a.position.x - end.point.x) * -v.y + (a.position.y - end.point.y) * v.x);
  // Sarajevo's runway 11 departure starts at the mapped runway 29-end hold.
  // Entry is a separate Tower back-taxi instruction, never part of taxi clearance.
  if (airport.icao === "LQSA" && runway === "11" && !exit && lateral > .035 && along > size - .15) {
    if (a.frequency !== "tower" || a.mode !== "parked" || a.speed >= .2) return {error: "Stop at the runway 29-end hold and contact Tower before back-taxiing."};
    const graph = buildTaxiGraph(airport), entry = airport.features.find(f => f.id === "941742803" && f.kind === "taxiway");
    if (!entry) return {error: "The mapped runway entry is unavailable."};
    const holds = (graph.runwayHolds?.[pair.id] ?? []).filter(i => distance(graph.points[i], other.point) < .12 && distance(graph.points[i], a.position) < .005);
    const centers = graph.points.flatMap((p, i) => {
      const offset = (p.x - end.point.x) * v.x + (p.y - end.point.y) * v.y;
      const side = Math.abs((p.x - end.point.x) * -v.y + (p.y - end.point.y) * v.x);
      return side < .002 && offset > size - .15 && entry.points.some(q => distance(p, q) < .02) ? [i] : [];
    });
    const protectedGraph = {...graph, edges: graph.edges.map(edges => edges.filter(e => e.protectedBy?.length === 1 && e.protectedBy[0] === pair.id))};
    for (const hold of holds) {
      const route = aStar(protectedGraph, hold, centers);
      if (route) return {path: [{...a.position}, ...route.slice(1).map(i => ({...graph.points[i]})), {...end.point}]};
    }
    return {error: "No mapped runway entry is available at this hold."};
  }
  if (lateral > .06 || along < -.02 || along > size + .02) return {error: "Back taxi requires an aircraft on the selected runway."};
  const path: TaxiPoint[] = [{...a.position}, {x: end.point.x + v.x * Math.max(0, along), y: end.point.y + v.y * Math.max(0, along)}];
  if (!exit) return {path: [...path, {...end.point}]};
  const graph = buildTaxiGraph(airport);
  const local = (point: Point) => ({along: (point.x - end.point.x) * v.x + (point.y - end.point.y) * v.y, lateral: (point.x - end.point.x) * -v.y + (point.y - end.point.y) * v.x});
  const centers = graph.points.flatMap((point, i) => {const q = local(point); return Math.abs(q.lateral) <= .002 && q.along >= 0 && q.along <= along + 1e-6 ? [{i, along: q.along}] : [];}).sort((l, r) => r.along - l.along);
  const protectedGraph = {...graph, edges: graph.edges.map(edges => edges.filter(e => e.protectedBy?.includes(pair.id) && e.protectedBy.length === 1))};
  const clearGraph = {...graph, edges: graph.edges.map(edges => edges.filter(e => !e.protectedBy?.length))};
  for (const center of centers) {
    let holds = [...(graph.runwayHolds?.[pair.id] ?? [])];
    while (holds.length) {
      const route = aStar(protectedGraph, center.i, holds);
      if (!route) break;
      const holdId = route.at(-1)!, hold = graph.points[holdId], side = Math.sign(local(hold).lateral);
      holds = holds.filter(i => i !== holdId);
      const goals = graph.points.flatMap((p, i) => side * local(p).lateral >= .06 && distance(p, hold) <= .5 ? [i] : []);
      const outward = aStar(clearGraph, holdId, goals);
      if (!outward) continue;
      const tail: Point[] = [];
      for (let i = 1; i < outward.length; i++) {
        const from = graph.points[outward[i - 1]], to = graph.points[outward[i]], lateral = side * local(to).lateral;
        if (lateral >= .06) {
          const prior = side * local(from).lateral, t = Math.min(1, (.065 - prior) / (lateral - prior));
          tail.push({x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t}); break;
        }
        tail.push({...to});
      }
      return {path: [...path, {x: end.point.x + v.x * center.along, y: end.point.y + v.y * center.along}, {...graph.points[center.i]}, ...route.slice(1).map(i => ({...graph.points[i]})), ...tail]};
    }
  }
  return {error: "No mapped runway exit available in the back-taxi direction."};
}
