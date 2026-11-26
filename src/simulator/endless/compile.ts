
import {airportSelection, getAirport, runwayEnds} from "../airports";
import {airportApproaches, environmentWithDestinations, facilities, insideAirspace, localPoint, type RadioFacility} from "../aviation";
import type {Airport, Point, RadarApproach, RadarEnvironment, RoutePoint} from "../model";
import {headingDifference, radarEnvironmentFor, radarHeading} from "../radar";
import {gatesFor} from "../scenarios";
import {appendFlightPlan, tagProcedure} from "../scenario-flight-plan";
import {ENDLESS_WAYPOINTS, endlessFallbackNavigation, endlessFixSpeed, endlessOriginApproaches} from "./catalog";
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
  approachId?: string;
  vnavFloor?: number;
  alternate?: {name: string; points: RoutePoint[]; approachId?: string; vnavFloor?: number};
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
  fixes?: RadarEnvironment["fixes"];
}

export function endlessSectors(airport: Airport) {
  return facilities.filter(f => f.type === "center" && insideAirspace(f.boundary, airport.origin.lat, airport.origin.lon))
    .map(f => ({id: f.id, name: f.name, ring: (f.boundary as [number, number][]).map(([lon, lat]) =>
      localPoint(airport, lat, airport.origin.lon + ((lon - airport.origin.lon + 540) % 360) - 180))}))
    .filter(f => f.ring.length <= 100 && f.ring.every(p => nmBetween(p, {x: 0, y: 0}) <= 455));
}

function selectEnd(airport: Airport, code: string, id?: string) {
  const ends = airportApproaches(airport, code);
  const matches = (end: RadarApproach) => end.type === "visual" && (!id || end.runway === id) && !!end.threshold && !!end.departure;
  const end = ends.find(matches) ?? endlessOriginApproaches(airport, code).find(matches);
  if (!end?.threshold || !end.departure) throw new Error("A mapped runway end is required.");
  return {...end, threshold: end.threshold, departure: end.departure};
}

const project = (airport: Airport, p: Waypoint): RoutePoint => ({
  ...localPoint(airport, p.lat, p.lon), name: p.identifier,
  ...(p.altitudeConstraint ? {altitudeConstraint: p.altitudeConstraint} : {}),
});

const usableRoute = (route: ProcedureRoute) => !route.simplified && route.points.length > 0 && route.points.length <= 150;
const runwayTokens = (transition: string) => [...transition.toUpperCase().matchAll(/(?:^|\b)RW(?:Y)?\s*(\d{1,2}[LRC]?)(?![A-Z0-9])/g)]
  .map(([, runway]) => runway.replace(/^(\d)([LRC]?)$/, "0$1$2"));
const inScope = (point: Point) => Math.abs(point.x) <= 2000 && Math.abs(point.y) <= 2000;
const sharedFix = (a: RoutePoint, b: RoutePoint) => (!!a.name && a.name.toUpperCase() === b.name?.toUpperCase()) || nmBetween(a, b) < .5;

async function loadNavigation(code: string, load: (airport: string) => Promise<NavigationSource>) {
  try {
    const source = await load(code);
    return source.procedures.length || source.waypoints.length ? source : endlessFallbackNavigation(code) ?? source;
  } catch (error) {
    const fallback = endlessFallbackNavigation(code);
    if (!fallback) throw error;
    return fallback;
  }
}

function procedureOptions(airport: Airport, source: NavigationSource, type: "SID" | "STAR", hint: string | undefined, runway: string, end: Point, join: Point) {
  const options = (procedures: Procedure[]) => procedures.filter(p => p.type === type && (!hint || p.identifier.toUpperCase() === hint.toUpperCase() || p.id === hint))
    .flatMap(p => p.routes.filter(usableRoute).flatMap(r => {
      const tokens = runwayTokens(r.transition ?? "");
      if (tokens.length && !tokens.includes(runway)) return [];
      const pts = r.points.map(point => project(airport, point));
      const local = type === "SID" ? pts[0] : pts.at(-1)!;
      const remote = type === "SID" ? pts.at(-1)! : pts[0];
      if (nmBetween(local, end) > (type === "SID" ? 35 : 70)) return [];
      const rank = nmBetween(local, end) + nmBetween(remote, join) * .7;
      return [{name: p.identifier, rank, points: tagProcedure(pts, {type, name: p.identifier}, r.transition ?? undefined, r.id.slice(-40))}];
    })).sort((a, b) => a.rank - b.rank);
  const loaded = options(source.procedures);
  return loaded.length ? loaded : options(endlessFallbackNavigation(source.icao)?.procedures ?? []);
}

function bridgeEnroute(exit: RoutePoint, entry: RoutePoint, via: RoutePoint[], fixes: RoutePoint[]) {
  const length = nmBetween(exit, entry);
  if (length <= 25) return via;
  const course = radarHeading(exit, entry);
  const dx = (entry.x - exit.x) / length, dy = (entry.y - exit.y) / length;
  const progress = (p: Point) => (p.x - exit.x) * dx + (p.y - exit.y) * dy;
  const lateral = (p: Point) => Math.abs((p.x - exit.x) * dy - (p.y - exit.y) * dx);
  const legs = [exit, ...via, entry];
  const candidates = fixes.flatMap(point => {
    const along = progress(point);
    if (along < length * .15 || along > length * .85 || Math.abs(headingDifference(radarHeading(exit, point), course)) > 35
      || legs.some(fix => sharedFix(fix, point))) return [];
    const leg = legs.findIndex((from, index) => {
      const to = legs[index + 1];
      if (!to || along - progress(from) < 15 || progress(to) - along < 15) return false;
      const heading = radarHeading(from, to);
      return Math.abs(headingDifference(radarHeading(from, point), heading)) <= 35
        && Math.abs(headingDifference(radarHeading(point, to), heading)) <= 35;
    });
    return leg < 0 ? [] : [{point, along, leg}];
  }).sort((a, b) => lateral(a.point) - lateral(b.point) || a.along - b.along);
  const selected = candidates.slice(0, 1);
  if (selected.length) {
    const second = candidates.find(candidate => Math.abs(selected[0].along - candidate.along) >= 15
      && !sharedFix(selected[0].point, candidate.point));
    if (second) selected.push(second);
  }
  selected.sort((a, b) => a.along - b.along);
  return legs.slice(0, -1).flatMap((_, index) => [
    ...selected.filter(candidate => candidate.leg === index).map(candidate => candidate.point),
    ...(via[index] ? [via[index]] : []),
  ]);
}

function conflictingJoin(a: RoutePoint, b: RoutePoint) {
  const first = a.altitudeConstraint, second = b.altitudeConstraint;
  return !!first && !!second && ((first.max ?? Infinity) < (second.min ?? -Infinity)
    || (second.max ?? Infinity) < (first.min ?? -Infinity));
}

function filedApproach(airport: Airport, arrivals: NavigationSource, arrival: ReturnType<typeof selectEnd>, starEnd: RoutePoint, equipment: RadarApproach[]) {
  const {runway, threshold, departure} = arrival;
  const identifierRunway = /^(?:ILS|LOC|RNAV|GPS|RNP|VISUAL|[ILR])(?:\s*\([^)]*\))?\s*[- ]*\s*(?:RWY?\s*)?(\d{1,2}[LRC]?)(?:\s*[- ]?[A-Z])?$/;
  const matching = (procedures: Procedure[]) => procedures.filter(p => p.type === "Approach").flatMap(p => {
    const identifier = p.identifier.toUpperCase();
    const kind = (p.approachType || identifier).trim().toUpperCase();
    const type = /^(?:ILS|I(?=\d))/.test(kind) ? "ils" : /^(?:RNAV|GPS|RNP|R(?=\d))/.test(kind) ? "gps" : /^VISUAL/.test(kind) ? "visual" : undefined;
    const approach = equipment.find(item => item.type === type);
    if (!approach) return [];
    const namedRunway = identifier.match(identifierRunway)?.[1]?.replace(/^(\d)([LRC]?)$/, "0$1$2");
    return p.routes.filter(usableRoute).flatMap(r => {
      const transition = r.transition?.trim().toUpperCase() ?? "";
      const tokens = runwayTokens(transition);
      if (/^\d{2}[LRC]?$/.test(transition)) tokens.push(transition);
      if (tokens.length ? !tokens.includes(runway) : namedRunway !== runway) return [];
      const points = r.points.map(point => project(airport, point));
      if (nmBetween(points.at(-1)!, threshold) < .5) points.pop();
      if (!points.length || !points.every(inScope)) return [];
      const shared = sharedFix(starEnd, points[0]);
      if (shared && conflictingJoin(starEnd, points[0])) return [];
      return [{procedure: p, route: r, points, approach,
        shared, distance: nmBetween(starEnd, points[0])}];
    });
  }).sort((a, b) => Number(b.approach.type === "ils") - Number(a.approach.type === "ils") || Number(b.shared) - Number(a.shared) || a.distance - b.distance);
  const chosen = matching(arrivals.procedures)[0] ?? matching(endlessFallbackNavigation(arrivals.icao)?.procedures ?? [])[0];
  if (chosen) {
    const points = tagProcedure(chosen.points, {type: "Approach", name: chosen.procedure.identifier},
      chosen.route.transition ?? undefined, chosen.route.id.slice(-40));
    if (!points.some(point => point.finalApproachFix)) {
      const faf = points.findLast(point => {
        const distance = nmBetween(point, threshold);
        return distance >= 5 && distance <= 10;
      }) ?? points.at(-1)!;
      faf.finalApproachFix = true;
    }
    return {points, approachId: chosen.approach.id};
  }
  const fallback = equipment.find(item => item.type === "ils") ?? equipment.find(item => item.type === "gps") ?? equipment.find(item => item.type === "visual");
  const label = fallback?.type === "ils" ? "ILS" : fallback?.type === "gps" ? "GPS" : "Visual";
  const scale = 9 / nmBetween(threshold, departure);
  const altitude = Math.round((arrival.elevation ?? airport.elevation) + 3000);
  return {approachId: fallback?.id, points: [{
    x: threshold.x + (threshold.x - departure.x) * scale, y: threshold.y + (threshold.y - departure.y) * scale,
    name: `FAF ${runway}`, altitudeConstraint: {min: altitude, max: altitude}, finalApproachFix: true,
    procedure: {key: `endless:app:${runway}`, type: "Approach" as const, name: `${label} ${runway}`},
  }]};
}

function appendApproach(star: RoutePoint[], approach: RoutePoint[]) {
  const last = star.at(-1)!, first = approach[0];
  if (!sharedFix(last, first)) return [...star, ...approach];
  const min = Math.max(last.altitudeConstraint?.min ?? -Infinity, first.altitudeConstraint?.min ?? -Infinity);
  const max = Math.min(last.altitudeConstraint?.max ?? Infinity, first.altitudeConstraint?.max ?? Infinity);
  if (min > max) return [...star, ...approach.slice(1)];
  const altitudeConstraint = min === -Infinity && max === Infinity ? undefined
    : {...(min === -Infinity ? {} : {min}), ...(max === Infinity ? {} : {max})};
  const join = {...first, ...last, altitudeConstraint, finalApproachFix: first.finalApproachFix || last.finalApproachFix,
    ...(approach.length === 1 ? {procedure: first.procedure} : {})};
  return [...star.slice(0, -1), join, ...approach.slice(1)];
}

function compileRoutes(
  stream: EndlessStream, definition: EndlessDefinition, airport: Airport, origins: NavigationSource, arrivals: NavigationSource, boundary?: Point[],
) {
  const runways = radarStreamRunways(stream);
  const departure = selectEnd(airport, stream.origin, runways.departure);
  const arrival = selectEnd(airport, stream.destination, runways.arrival);
  const destination = arrival.threshold;
  const source = departure.threshold;
  if (boundary) {
    const expectedOriginInside = stream.kind !== "arrival", expectedDestinationInside = stream.kind !== "departure";
    if (insideSector(boundary, source) !== expectedOriginInside || insideSector(boundary, destination) !== expectedDestinationInside)
      throw new Error("The origin and destination must match the stream's sector entry or exit.");
  }
  const sids = procedureOptions(airport, origins, "SID", stream.sid, departure.runway, source, destination);
  const stars = procedureOptions(airport, arrivals, "STAR", stream.star, arrival.runway, destination, source);
  const allStars = stream.star ? procedureOptions(airport, arrivals, "STAR", undefined, arrival.runway, destination, source) : stars;
  if (!sids.length) throw new Error(`No usable ${stream.origin} SID. Choose another departure runway or procedure.`);
  if (!stars.length) throw new Error(`No usable ${stream.destination} STAR. Choose another arrival runway or procedure.`);
  const fixes = [...origins.waypoints, ...arrivals.waypoints].map(fix => project(airport, fix)).filter(inScope);
  const namedFixes = [...fixes, ...ENDLESS_WAYPOINTS.map(fix => project(airport, fix)).filter(inScope)];
  const enroute = (stream.via ?? "").split(/\s+/).filter(Boolean).filter(name => name.toUpperCase() !== "DCT").map(name => {
    const matches = namedFixes.filter(fix => fix.name?.toUpperCase() === name.toUpperCase());
    if (!matches.length) throw new Error(`En-route waypoint ${name} was not found in the navigation catalogue.`);
    return matches.sort((a, b) => nmBetween(a, source) - nmBetween(b, source))[0];
  });
  const inbound = stream.kind === "arrival";
  const environment = environmentWithDestinations(airport, radarEnvironmentFor(airport), [{destination: {name: stream.destination, point: destination}}]);
  const runwayApproaches = environment.approaches.filter(p => p.airportIcao === stream.destination && p.runway === arrival.runway);
  const buildPlan = (sid: typeof sids[number], star: typeof stars[number]) => {
    const bridge = bridgeEnroute(sid.points.at(-1)!, star.points[0], enroute, fixes);
    const prefix = appendFlightPlan(appendFlightPlan([{...source, name: stream.origin}], sid.points), bridge);
    if (sharedFix(prefix.at(-1)!, star.points[0])) prefix.pop();
    if (prefix.length + star.points.length > 201) return;
    const approach = filedApproach(airport, arrivals, arrival, star.points.at(-1)!, runwayApproaches);
    const points = [...prefix, ...appendApproach(star.points, approach.points), {...destination, name: stream.destination}];
    if (points.length > 200 || !points.every(inScope)) return;
    const faf = points.find(point => point.finalApproachFix);
    const vnavFloor = Math.max(Math.round((arrival.elevation ?? airport.elevation) + 2500),
      faf?.altitudeConstraint?.min ?? faf?.altitudeConstraint?.max ?? 0);
    return {points: points.map(point => {
      const speed = endlessFixSpeed(stream.destination, point.name);
      return speed === undefined ? point : {...point, speed};
    }), ...(inbound ? {approachId: approach.approachId, vnavFloor} : {})};
  };
  const variants: RouteVariant[] = [], attempted = new Set<string>();
  for (const sid of sids.slice(0, 8)) for (const star of stars.slice(0, 8)) {
    if (variants.length >= 6) break;
    const plan = buildPlan(sid, star);
    if (!plan) continue;
    const {points} = plan;
    const runwayLength = nmBetween(source, departure.departure);
    const position = {x: departure.departure.x + (departure.departure.x - source.x) / runwayLength * 3,
      y: departure.departure.y + (departure.departure.y - source.y) / runwayLength * 3};
    const departureIndex = points.findIndex((p, i) => i > 0 && nmBetween(p, source) > runwayLength + 4);
    const entries = !inbound ? [{position, index: Math.max(1, departureIndex)}]
      : boundary ? [sectorEntry(boundary, points)] : [76, 85, 94].map(radius => approachEntry(points, {x: 0, y: 0}, radius));
    for (const spawn of entries) {
      if (!spawn || spawn.index >= points.length - 1 || variants.length >= 6) continue;
      const key = [spawn.position.x.toFixed(1), spawn.position.y.toFixed(1), points[spawn.index].name].join(":");
      if (attempted.has(key)) continue;
      attempted.add(key);
      const alternate = allStars.find(other => other.name !== star.name && nmBetween(other.points[0], star.points[0]) > 5);
      const alternatePlan = alternate ? buildPlan(sid, alternate) : undefined;
      variants.push({...plan, spawn, star: star.name,
        ...(alternate && alternatePlan ? {alternate: {name: alternate.name, ...alternatePlan}} : {})});
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
  const nav = new Map(await Promise.all([...airports].map(async code => [code, await loadNavigation(code, load)] as const)));
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
  const fixes = new Map<string, Point>();
  for (const {definition: stream, variants} of streams) {
    if (!controlledAirports.has(stream.destination)) continue;
    for (const {points} of variants) for (const point of points) {
      const id = point.name?.trim().toUpperCase();
      if (id && id.length <= 32 && (point.procedure?.type === "STAR" || point.procedure?.type === "Approach") && !fixes.has(id)) {
        fixes.set(id, {x: point.x, y: point.y});
      }
    }
  }
  return {definition, selection, revisions: Object.fromEntries([...nav].map(([code, data]) => [code, data.revision])),
    streams, ...(sector ? {boundary: sector.ring} : {}), neighbours, range,
    ...(fixes.size ? {fixes: [...fixes].slice(0, 150).map(([id, point]) => ({id, point}))} : {})};
}
