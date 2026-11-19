
import {airportSelection, getAirport, runwayEnds} from "../airports";
import {airportApproaches, facilities, insideAirspace, localPoint, type RadioFacility} from "../aviation";
import type {Airport, Point, RadarApproach, RoutePoint} from "../model";
import {gatesFor} from "../scenarios";
import {appendFlightPlan, tagProcedure} from "../scenario-flight-plan";
import {approachEntry, insideSector, nmBetween, sectorEntry} from "./geometry";
import {endlessDefinition, radarStreamRunways, type EndlessDefinition, type EndlessStream} from "./definition";
import type {NavigationSource} from "../server/navigation-api";

type Procedure = NavigationSource["procedures"][number];
type ProcedureRoute = Procedure["routes"][number];
type Waypoint = ProcedureRoute["points"][number];
export interface RouteVariant {
  points: RoutePoint[];
  spawn: {position: Point; index: number};
  star?: string;
  alternate?: {name: string; points: RoutePoint[]};
}
export interface CompiledStream {
  definition: EndlessStream;
  interval: number;
  firstAt: number;
  destination: Point;
  departureElevation?: number;
  variants: RouteVariant[];
}
export interface CompiledEndless {
  definition: EndlessDefinition;
  selection: ReturnType<typeof airportSelection>;
  revisions: Record<string, string>;
  streams: CompiledStream[];
  boundary?: Point[];
  neighbours: RadioFacility[];
  range: number;
}

export function endlessSectors(airport: Airport) {
  return facilities.filter(f => f.type === "center" && insideAirspace(f.boundary, airport.origin.lat, airport.origin.lon))
    .map(f => ({id: f.id, name: f.name, ring: (f.boundary as [number, number][]).map(([lon, lat]) =>
      localPoint(airport, lat, airport.origin.lon + ((lon - airport.origin.lon + 540) % 360) - 180))}))
    .filter(f => f.ring.length <= 100 && f.ring.every(p => nmBetween(p, {x: 0, y: 0}) <= 455));
}

function selectEnd(ends: RadarApproach[], id?: string) {
  const visual = ends.filter(p => p.type === "visual");
  const end = id ? visual.find(p => p.runway === id) : visual[0];
  if (!end?.threshold || !end.departure) throw new Error("A mapped runway end is required.");
  return {...end, threshold: end.threshold, departure: end.departure};
}

const project = (airport: Airport, p: Waypoint): RoutePoint => ({
  ...localPoint(airport, p.lat, p.lon), name: p.identifier,
  ...(p.altitudeConstraint ? {altitudeConstraint: p.altitudeConstraint} : {}),
});

function procedureOptions(airport: Airport, source: NavigationSource, type: "SID" | "STAR", hint: string | undefined, runway: string, end: Point, join: Point) {
  return source.procedures.filter(p => p.type === type && (!hint || p.identifier.toUpperCase() === hint.toUpperCase() || p.id === hint))
    .flatMap(p => p.routes.filter(r => !r.simplified && r.points.length <= 150).flatMap(r => {
      const runwayTokens = (r.transition ?? "").toUpperCase().match(/(?:^|\b)RW(?:Y)?\s*(\d{2}[LRC]?)/g) ?? [];
      if (runwayTokens.length && !runwayTokens.some(token => token.endsWith(runway))) return [];
      const pts = r.points.map(point => project(airport, point));
      const local = type === "SID" ? pts[0] : pts.at(-1)!;
      const remote = type === "SID" ? pts.at(-1)! : pts[0];
      if (nmBetween(local, end) > (type === "SID" ? 35 : 70)) return [];
      const rank = nmBetween(local, end) + nmBetween(remote, join) * .7;
      return [{name: p.identifier, rank, points: tagProcedure(pts, {type, name: p.identifier}, r.transition ?? undefined, r.id.slice(0, 100))}];
    })).sort((a, b) => a.rank - b.rank);
}

function compileRoutes(
  stream: EndlessStream, definition: EndlessDefinition, airport: Airport, origins: NavigationSource, arrivals: NavigationSource, boundary?: Point[],
) {
  const runways = radarStreamRunways(stream);
  const departure = selectEnd(airportApproaches(airport, stream.origin), runways.departure);
  const arrival = selectEnd(airportApproaches(airport, stream.destination), runways.arrival);
  const destination = arrival.threshold;
  const source = departure.threshold;
  if (boundary) {
    const expectedOriginInside = stream.kind !== "arrival", expectedDestinationInside = stream.kind !== "departure";
    if (insideSector(boundary, source) !== expectedOriginInside || insideSector(boundary, destination) !== expectedDestinationInside)
      throw new Error("The origin and destination must match the stream's sector entry or exit.");
  }
  const sids = procedureOptions(airport, origins, "SID", stream.sid, departure.runway, source, destination);
  const stars = procedureOptions(airport, arrivals, "STAR", stream.star, arrival.runway, destination, source);
  if (!sids.length) throw new Error(`No usable ${stream.origin} SID. Choose another departure runway or procedure.`);
  if (!stars.length) throw new Error(`No usable ${stream.destination} STAR. Choose another arrival runway or procedure.`);
  const fixes = [...origins.waypoints, ...arrivals.waypoints];
  const enroute = (stream.via ?? "").split(/\s+/).filter(Boolean).filter(name => name.toUpperCase() !== "DCT").map(name => {
    const matches = fixes.filter(fix => fix.identifier.toUpperCase() === name.toUpperCase());
    if (!matches.length) throw new Error(`En-route waypoint ${name} was not found in the navigation catalogue.`);
    return project(airport, matches.sort((a, b) => nmBetween(project(airport, a), source) - nmBetween(project(airport, b), source))[0]);
  });
  const variants: RouteVariant[] = [], attempted = new Set<string>();
  for (const sid of sids.slice(0, 8)) for (const star of stars.slice(0, 8)) {
    if (variants.length >= 6) break;
    const prefix = appendFlightPlan(appendFlightPlan([{...source, name: stream.origin}], sid.points), enroute);
    const filed = appendFlightPlan(prefix, star.points);
    if (filed.length > 198 || filed.some(p => Math.max(Math.abs(p.x), Math.abs(p.y)) > 2000)) continue;
    const track = [...filed, destination];
    const inbound = stream.kind === "arrival";
    const runwayLength = nmBetween(source, departure.departure);
    const position = {x: departure.departure.x + (departure.departure.x - source.x) / runwayLength * 3,
      y: departure.departure.y + (departure.departure.y - source.y) / runwayLength * 3};
    const departureIndex = filed.findIndex((p, i) => i > 0 && nmBetween(p, source) > runwayLength + 4);
    const entries = !inbound ? [{position, index: Math.max(1, departureIndex)}]
      : boundary ? [sectorEntry(boundary, track)] : [76, 85, 94].map(radius => approachEntry(track, {x: 0, y: 0}, radius));
    for (const spawn of entries) {
      if (!spawn || spawn.index >= filed.length || variants.length >= 6) continue;
      const key = [spawn.position.x.toFixed(1), spawn.position.y.toFixed(1), filed[spawn.index].name].join(":");
      if (attempted.has(key)) continue;
      attempted.add(key);
      const alternate = stars.find(other => other.name !== star.name && nmBetween(other.points[0], star.points[0]) > 5);
      const alternatePoints = alternate ? appendFlightPlan(prefix, alternate.points) : undefined;
      variants.push({points: filed, spawn, star: star.name,
        ...(alternate && alternatePoints && alternatePoints.length <= 200 ? {alternate: {name: alternate.name, points: alternatePoints}} : {})});
    }
  }
  if (!variants.length) throw new Error(definition.mode === "center" ? "The route has no usable sector crossing 25 NM outside the boundary." : "The route has no usable radar entry.");
  return {variants, destination, departureElevation: departure.elevation};
}

export async function compileEndless(input: EndlessDefinition, load: (airport: string) => Promise<NavigationSource>): Promise<CompiledEndless> {
  const definition = endlessDefinition.parse(input);
  const airport = getAirport({airport: definition.airport});
  const selection = airportSelection(airport, definition.mode);
  const sector = definition.mode === "center" ? endlessSectors(airport).find(sector => sector.id === definition.sector) : undefined;
  if (definition.mode === "center" && !sector) throw new Error("Choose a mapped Center boundary containing the scope airport.");
  const active = definition.streams.filter(stream => stream.rate > 0);
  if (!active.length) throw new Error("Enable at least one traffic stream.");
  if (definition.mode !== "local" && !active.some(stream => stream.kind === "arrival")) throw new Error("Enable an external arrival stream for the opening traffic.");
  const airports = new Set<string>();
  for (const stream of active) {
    const local = definition.mode === "local";
    const invalidKind = local ? stream.kind === "intra-sector" : stream.kind === "pattern" || (stream.kind === "intra-sector" && !sector);
    const stationed = stream.kind === "departure" ? stream.origin : stream.destination;
    const invalidAirport = !sector && stationed !== airport.icao;
    if (invalidKind || invalidAirport) throw new Error(`${stream.name}: The traffic type or airport does not match the controller position.`);
    if (local) {
      if (!runwayEnds(airport).some(end => end.id === stream.runway)) throw new Error(`${stream.name}: Choose a mapped runway.`);
      if (stream.kind === "departure" && !gatesFor(airport).length) throw new Error(`${stream.name}: No connected gates are available.`);
    } else {
      airports.add(stream.origin);
      airports.add(stream.destination);
    }
  }
  if (airports.size > 12) throw new Error("Use at most 12 airports in one scenario.");
  const nav = new Map(await Promise.all([...airports].map(async code => [code, await load(code)] as const)));
  const arrivals = {hourlyRate: 0, nextSlot: 1};
  const departures = {hourlyRate: 0, nextSlot: 1};
  for (const {kind, rate} of active) {
    const lane = kind === "arrival" ? arrivals : departures;
    lane.hourlyRate += rate;
  }
  const streams = active.map((stream, i): CompiledStream => {
    const interval = 3600 / stream.rate;
    // Radar departures and intra-sector flights share the same runway entries.
    const lane = stream.kind === "arrival" ? arrivals : departures;
    const firstAt = Math.min(interval, definition.mode === "local" ? 10 + 20 * i
      : lane.nextSlot++ * 3600 / lane.hourlyRate);
    try {
      const route = definition.mode === "local" ? {variants: [], destination: {x: 0, y: 0}}
        : compileRoutes(stream, definition, airport, nav.get(stream.origin)!, nav.get(stream.destination)!, sector?.ring);
      return {definition: stream, interval, firstAt, ...route};
    } catch (error) {
      throw new Error(`${stream.name}: ${error instanceof Error ? error.message : "Invalid route."}`);
    }
  });
  const controlledAirports = new Set(active.flatMap(s => s.kind === "arrival" ? [s.destination]
    : s.kind === "departure" ? [s.origin] : [s.origin, s.destination]));
  const scopeCenter = sector?.id ?? endlessSectors(airport)[0]?.id;
  const outboundPoints = streams.filter(s => s.definition.kind === "departure").map(s => s.destination);
  const containsDestination = (f: RadioFacility) => outboundPoints.some(p => insideAirspace(f.boundary,
    airport.origin.lat + p.y / 60, airport.origin.lon + p.x / (60 * Math.cos(airport.origin.lat * Math.PI / 180))));
  const neighbours = facilities.filter(f => definition.mode === "approach"
    ? f.type === "tower" && f.airport === airport.icao || f.type === "center" && f.id === scopeCenter
    : definition.mode === "center" && (f.type === "approach" && !!f.airport && controlledAirports.has(f.airport)
      || f.type === "center" && f.id !== scopeCenter && containsDestination(f))).slice(0, 24);
  const range = sector ? Math.min(500, Math.ceil(Math.max(...sector.ring.map(p => nmBetween(p, {x: 0, y: 0}))) + 45)) : 110;
  return {definition, selection, revisions: Object.fromEntries([...nav].map(([code, data]) => [code, data.revision])),
    streams, ...(sector ? {boundary: sector.ring} : {}), neighbours, range};
}
