import {airportRunways} from "./airports";
import type {Airport, Point} from "./model";
import type {ScopeMapData} from "./scope-map-data";

/** A runway snapshot in the controlled airport's coordinate system. */
export interface DepartureAirport {
  icao: string; name: string; elevation: number;
  runways: {id: string; threshold: Point; departure: Point}[];
}

/** Only offer departures with usable elevation and both runway endpoints. */
export function departureAirports(airport: Airport, map?: ScopeMapData): DepartureAirport[] {
  const local: DepartureAirport = {icao: airport.icao, name: airport.name, elevation: airport.elevation,
    runways: airportRunways(airport).flatMap(pair => pair.ends.flatMap(end => {
      const opposite = pair.ends.find(other => other.id !== end.id);
      return opposite ? [{id: end.id, threshold: {...end.point}, departure: {...opposite.point}}] : [];
    }))};
  if (!map || map.airport !== airport.icao) return [local];
  const byAirport = new Map<string, NonNullable<ScopeMapData["approaches"]>>();
  for (const end of map.approaches ?? []) {const code = end.airportIcao.toUpperCase(), list = byAirport.get(code) ?? []; list.push(end); byAirport.set(code, list);}
  const nearby = map.airports.flatMap(item => {
    const icao = item.identifier.toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(icao) || icao === airport.icao || item.elevationFeet == null || !Number.isFinite(item.elevationFeet) || item.elevationFeet < 0 || item.elevationFeet > 20000) return [];
    const runways = (byAirport.get(icao) ?? []).flatMap(end => {
      if (end.airportIcao.toUpperCase() !== icao || !/^(?:0[1-9]|[12][0-9]|3[0-6])[LRC]?$/.test(end.runway)) return [];
      const coords = [end.threshold.x, end.threshold.y, end.departure.x, end.departure.y];
      if (coords.some(value => !Number.isFinite(value) || Math.abs(value) > 2000) || Math.hypot(end.threshold.x - end.departure.x, end.threshold.y - end.departure.y) < .01) return [];
      return [{id: end.runway, threshold: {...end.threshold}, departure: {...end.departure}}];
    });
    const unique = [...new Map(runways.map(runway => [runway.id, runway])).values()];
    return unique.length ? [{icao, name: item.name ?? icao, elevation: item.elevationFeet, runways: unique}] : [];
  });
  return [local, ...nearby.sort((a, b) => a.icao.localeCompare(b.icao))];
}

/** Capture geometry at creation so later map changes do not alter sessions or replays. */
export function departureSnapshot(origin: DepartureAirport, runway: string) {
  const end = origin.runways.find(item => item.id === runway);
  if (!end) throw new Error("Choose a runway at the departure airport.");
  return {icao: origin.icao, runway, elevation: origin.elevation, threshold: {...end.threshold}, departure: {...end.departure}, phase: "roll" as const};
}

export function departureGeometry(origin: {threshold: Point; departure: Point}) {
  const dx = origin.departure.x - origin.threshold.x, dy = origin.departure.y - origin.threshold.y;
  const length = Math.hypot(dx, dy);
  if (length < .01) throw new Error("Departure runway geometry is invalid.");
  return {threshold: origin.threshold, departure: origin.departure, vector: {x: dx / length, y: dy / length}, heading: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360};
}

/** Set up an automatic takeoff while keeping the controlled airport's runway field local. */
export function applyDepartureOrigin(a: import("./model").Aircraft, controlled: Airport, origin: DepartureAirport, runway: string) {
  const snapshot = departureSnapshot(origin, runway), geometry = departureGeometry(snapshot);
  if (!a.radar && origin.elevation >= controlled.elevation + 1500) throw new Error("Departure airport elevation must be below the controlled airport's 1,500 ft overhead altitude.");
  a.originDeparture = snapshot; a.position = {...snapshot.threshold};
  a.heading = a.targetHeading = geometry.heading; a.altitude = snapshot.elevation;
  a.speed = 0; a.mode = "takeoff"; a.trail = [];
  return a;
}

/** Select the closest usable airport to a scope click in screen coordinates. */
export function nearestDepartureAirport(candidates: readonly {identifier: string; point: Point}[], origins: readonly DepartureAirport[], point: Point, project: (point: Point) => Point, radius = 30) {
  const allowed = new Set(origins.map(origin => origin.icao)), click = project(point);
  return candidates.filter(item => allowed.has(item.identifier)).map(item => ({item, distance: Math.hypot(project(item.point).x - click.x, project(item.point).y - click.y)}))
    .filter(item => item.distance <= radius).sort((a, b) => a.distance - b.distance)[0]?.item.identifier;
}

/** Choose the closest airport, then the nearest runway end aligned with the aircraft. */
export function nearestScenarioDeparture(origins: readonly DepartureAirport[], map: ScopeMapData, controlled: Airport, position: Point, heading: number) {
  const airportPoint = (origin: DepartureAirport): Point => map.airports.find(item => item.identifier.toUpperCase() === origin.icao)?.point
    ?? (origin.icao === controlled.icao ? {x: 0, y: 0} : origin.runways[0].threshold);
  const origin = [...origins].sort((a, b) => Math.hypot(position.x - airportPoint(a).x, position.y - airportPoint(a).y) - Math.hypot(position.x - airportPoint(b).x, position.y - airportPoint(b).y))[0];
  if (!origin) throw new Error("No departure airport with usable runway data is available.");
  const ends = origin.runways.map(runway => {
    const difference = Math.abs((departureGeometry(runway).heading - heading + 540) % 360 - 180);
    return {runway, difference, distance: Math.hypot(position.x - runway.threshold.x, position.y - runway.threshold.y)};
  });
  const bestHeading = Math.min(...ends.map(end => end.difference));
  // Parallel runway headings can differ slightly in the source geometry.
  const runway = ends.filter(end => end.difference <= bestHeading + 10).sort((a, b) => a.distance - b.distance || a.difference - b.difference)[0].runway;
  return {origin, runway: runway.id};
}
