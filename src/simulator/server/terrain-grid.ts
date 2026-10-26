import {getAirport} from "../airports";
import type {ScopeTerrain} from "../scope-map-data";
import {terrainCoordinates} from "../terrain";

export const TERRAIN_GRID = {spacing: 1.5, radius: 45} as const;
type Lookup = (latitude: number, longitude: number, signal: AbortSignal) => Promise<number>;

/** One uncached point read, so a grid build cannot evict the aircraft and impact samples. */
export async function terrainHeight(latitude: number, longitude: number, signal: AbortSignal) {
  const response = await fetch(`https://terrain.infinitehorizon.app/height?lat=${latitude}&lon=${longitude}`, {signal, cache: "no-store", redirect: "error"});
  if (!response.ok) throw new Error("Terrain unavailable");
  const body = await response.json(), feet: unknown = body?.elevationFt;
  if (typeof feet !== "number" || !Number.isFinite(feet)) throw new Error("Terrain unavailable");
  return feet;
}

/** The point service has no area query, so a display grid is sampled once per airport and cached by the caller.
 * Missing points stay null (drawn as no data); a mostly failed build is an error so Retry can recover. */
export async function fetchScopeTerrain(code: string, lookup: Lookup = terrainHeight, concurrency = 16): Promise<ScopeTerrain> {
  const airport = getAirport({airport: code});
  const {spacing, radius} = TERRAIN_GRID, size = Math.round(radius * 2 / spacing) + 1, origin = {x: -radius, y: -radius};
  const elevations: (number | null)[] = new Array(size * size).fill(null);
  let next = 0, failed = 0;
  const worker = async () => {
    while (next < elevations.length) {
      const index = next++, point = {x: origin.x + (index % size) * spacing, y: origin.y + Math.floor(index / size) * spacing};
      const {latitude, longitude} = terrainCoordinates(airport, point);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {elevations[index] = Math.round(await lookup(latitude, longitude, AbortSignal.timeout(8000))); break;}
        catch {if (attempt) failed++;}
      }
      if (failed > elevations.length / 4) {next = elevations.length; throw new Error("Terrain unavailable");}
    }
  };
  await Promise.all(Array.from({length: concurrency}, worker));
  return {airport: code, spacing, size, origin, elevations};
}
