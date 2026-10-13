import type {Airport, Point} from "./model";

/** Matches the airport snapshot's east/north projection. */
export function terrainCoordinates(airport: Airport, point: Point) {
  return {latitude: airport.origin.lat + point.y / 60,
    longitude: airport.origin.lon + point.x / (60 * Math.cos(airport.origin.lat * Math.PI / 180))};
}
export const terrainFeet = (feet: number) => Math.ceil(feet / 100) * 100;
const cache = new Map<string, number>();
/** Point elevation only, not an obstacle clearance or the highest terrain along a vector. */
export async function rawTerrainElevation(latitude: number, longitude: number, signal: AbortSignal): Promise<number> {
  const key = `${latitude},${longitude}`;
  if (cache.has(key)) return cache.get(key)!;
  const response = await fetch(`https://terrain.infinitehorizon.app/height?lat=${latitude}&lon=${longitude}`, {signal, credentials: "omit", referrerPolicy: "no-referrer"});
  if (!response.ok) throw new Error("Terrain unavailable");
  const body = await response.json(), sampledFeet: unknown = body.elevationFt;
  if (typeof sampledFeet !== "number" || !Number.isFinite(sampledFeet)) throw new Error("Terrain unavailable");
  const feet = sampledFeet;
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(key, feet);
  return feet;
}
export async function terrainElevation(latitude: number, longitude: number, signal: AbortSignal) {
  return terrainFeet(await rawTerrainElevation(latitude, longitude, signal));
}
