import type {Aircraft, Airport, Point} from "./model";
import {airportVisible} from "./command-navigation";

export const SIGHTING_SECONDS = 3;
export const SIGHTING_SAMPLE_SECONDS = 8;
export const sightingTarget = (a: Aircraft, airport: Airport) => ({name: a.destination?.name ?? airport.icao, point: a.destination?.point ?? {x: 0, y: 0}});
export const sightingTargetKey = (a: Aircraft, airport: Airport) => JSON.stringify(sightingTarget(a, airport));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Normal-visibility training: side views are allowed; no approach clearance is needed. */
export function sightingGeometry(a: Aircraft, airport: Airport) {
  const elevation = a.airportSighting?.target === sightingTargetKey(a, airport) ? a.airportSighting.terrain?.targetElevation : undefined;
  return airportVisible(a, airport, elevation ?? (a.destination ? 0 : airport.elevation));
}
export function sightingSampleCurrent(a: Aircraft, airport: Airport, elapsed: number) {
  const s = a.airportSighting, t = s?.terrain;
  return !!s && s.target === sightingTargetKey(a, airport) && !!t && elapsed >= t.checkedAt && elapsed - t.checkedAt <= SIGHTING_SAMPLE_SECONDS
    && distance(a.position, t.position) <= .25 && Math.abs(a.altitude - t.altitude) <= 75;
}
export function advanceAirportSighting(a: Aircraft, airport: Airport, dt: number, elapsed: number, automatic: boolean) {
  if (!a.reportAirportInSight) {delete a.airportSighting; return;}
  const target = sightingTargetKey(a, airport);
  if (a.airportSighting?.target !== target) a.airportSighting = {target, seconds: 0};
  const s = a.airportSighting!;
  const visible = automatic && a.active && !!a.frequency && a.frequency !== "atis" && sightingGeometry(a, airport)
    && sightingSampleCurrent(a, airport, elapsed) && s.terrain?.status === "clear";
  s.seconds = visible ? Math.min(SIGHTING_SECONDS, s.seconds + dt) : 0;
}
export const airportSightingReady = (a: Aircraft, airport: Airport, elapsed: number) => a.active && (a.airportSighting?.seconds ?? 0) >= SIGHTING_SECONDS - 1e-8
  && sightingGeometry(a, airport) && sightingSampleCurrent(a, airport, elapsed) && a.airportSighting?.terrain?.status === "clear";

/** Sampled terrain screening; unavailable samples never imply an unobstructed view. */
export function terrainSightLine(altitude: number, elevations: number[]) {
  if (elevations.length < 2 || Array.from(elevations).some(h => !Number.isFinite(h))) return "unavailable" as const;
  const target = elevations.at(-1)! + 15; // airport structures, in feet
  if (altitude <= elevations[0]) return "blocked" as const;
  return elevations.slice(1, -1).some((height, i) => height + 5 >= altitude + (target - altitude) * (i + 1) / (elevations.length - 1)) ? "blocked" as const : "clear" as const;
}
