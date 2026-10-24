import type {Airport} from "./model";
import type {MapCamera, MapSize} from "./scope-camera";

export const COASTLINE_URL = "/shared-data/natural-earth/coastline-10m/bfa04cdbcbef/coastline.geojson";
export const COASTLINE_STYLE = {color: "rgba(148,170,178,0.8)", width: .75} as const;
interface CoastlineChunk {points: Float64Array; west: number; east: number; south: number; north: number}
export type Coastlines = readonly CoastlineChunk[];
const longitudeDelta = (degrees: number) => ((degrees + 180) % 360 + 360) % 360 - 180;

/** Index short geographic sections once, so panning only projects nearby vertices.
 * Adjacent chunks share an endpoint. Unwrapping preserves coasts at the date line.
 */
export function indexCoastlines(value: unknown): Coastlines {
  if (!value || typeof value !== "object" || !("type" in value) || value.type !== "MultiLineString"
    || !("coordinates" in value) || !Array.isArray(value.coordinates) || !value.coordinates.length || value.coordinates.length > 10_000) throw new Error("Invalid coastline data");
  const chunks: CoastlineChunk[] = [];
  let vertices = 0;
  for (const line of value.coordinates) {
    if (!Array.isArray(line) || line.length < 2 || (vertices += line.length) > 1_000_000) throw new Error("Invalid coastline data");
    let points: number[] = [], previous: number | undefined;
    const flush = () => {
      let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
      for (let i = 0; i < points.length; i += 2) {
        west = Math.min(west, points[i]); east = Math.max(east, points[i]);
        south = Math.min(south, points[i + 1]); north = Math.max(north, points[i + 1]);
      }
      chunks.push({points: new Float64Array(points), west, east, south, north});
    };
    for (const point of line) {
      if (!Array.isArray(point) || point.length !== 2 || typeof point[0] !== "number" || typeof point[1] !== "number"
        || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error("Invalid coastline data");
      const lon: number = previous === undefined ? point[0] : previous + longitudeDelta(point[0] - previous);
      previous = lon; points.push(lon, point[1]);
      if (points.length === 256) {flush(); points = points.slice(-2);}
    }
    if (points.length > 2) flush();
  }
  return chunks;
}

/** A browser-session cache: concurrent scopes share the request and immutable index.
 * Failed requests are evicted, so Retry can recover without reloading the session.
 */
export function createCoastlineLoader(fetcher: typeof fetch = fetch, timeoutMs = 20_000) {
  let pending: Promise<Coastlines> | undefined;
  let failed = false;
  return (): Promise<Coastlines> => {
    if (pending) return pending;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    pending = Promise.resolve().then(async () => {
      const response = await fetcher(COASTLINE_URL, {signal: controller.signal, credentials: "omit", cache: failed ? "reload" : "force-cache"});
      if (!response.ok) throw new Error("Coastlines unavailable");
      const data = indexCoastlines(await response.json());
      failed = false;
      return data;
    }).catch(error => {failed = true; pending = undefined; throw error;}).finally(() => clearTimeout(timer));
    return pending;
  };
}
export const loadCoastlines = createCoastlineLoader();

/** Matches aviation.localPoint / terrainCoordinates: local east/north nautical miles.
 * Called only by the background map effect, never by the traffic animation loop.
 */
export function drawCoastlines(ctx: CanvasRenderingContext2D, data: Coastlines, origin: Airport["origin"], camera: MapCamera, size: MapSize) {
  if (!Number.isFinite(camera.scale) || camera.scale <= 0) return;
  const lonUnit = 60 * Math.cos(origin.lat * Math.PI / 180);
  if (Math.abs(lonUnit) < 1e-6) return;
  const halfWidth = size.width / (2 * camera.scale), halfHeight = size.height / (2 * camera.scale);
  const west = origin.lon + (camera.center.x - halfWidth) / lonUnit, east = origin.lon + (camera.center.x + halfWidth) / lonUnit;
  const south = origin.lat + (camera.center.y - halfHeight) / 60, north = origin.lat + (camera.center.y + halfHeight) / 60;
  ctx.save(); ctx.strokeStyle = COASTLINE_STYLE.color; ctx.lineWidth = COASTLINE_STYLE.width; ctx.setLineDash([]); ctx.beginPath();
  for (const chunk of data) {
    if (chunk.north < south || chunk.south > north) continue;
    const shift = 360 * Math.round(((west + east) - (chunk.west + chunk.east)) / 720);
    if (chunk.east + shift < west || chunk.west + shift > east) continue;
    for (let i = 0; i < chunk.points.length; i += 2) {
      const x = (chunk.points[i] + shift - origin.lon) * lonUnit, y = (chunk.points[i + 1] - origin.lat) * 60;
      const sx = size.width / 2 + (x - camera.center.x) * camera.scale, sy = size.height / 2 - (y - camera.center.y) * camera.scale;
      if (!i) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
  }
  ctx.stroke(); ctx.restore();
}
