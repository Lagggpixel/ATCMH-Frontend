import type {Point} from "./model";
import type {MapCamera, MapSize} from "./scope-camera";
import type {ScopeTerrain} from "./scope-map-data";

/** Airbus ND / EGPWS colours. Dots stay screen-aligned like the ND's pattern. */
export const TERRAIN_COLORS = {red: "#ff2a1a", amber: "#ffbf00", green: "#19d219", magenta: "#ff3cff", cyan: "#00e5ff"} as const;
export type TerrainClass = "red" | "amberHigh" | "amberLow" | "greenHigh" | "greenLow" | "noData";
const DOT_SPACING = 4, DOT_SIZE = 1.6;
const fills: Record<TerrainClass, {color: string; dense: boolean}> = {
  red: {color: TERRAIN_COLORS.red, dense: true}, amberHigh: {color: TERRAIN_COLORS.amber, dense: true},
  amberLow: {color: TERRAIN_COLORS.amber, dense: false}, greenHigh: {color: TERRAIN_COLORS.green, dense: true},
  greenLow: {color: TERRAIN_COLORS.green, dense: false}, noData: {color: TERRAIN_COLORS.magenta, dense: false},
};

/** Bilinear elevation in feet; null where the service had no sample, undefined outside the grid. */
export function terrainElevationAt(grid: ScopeTerrain, point: Point): number | null | undefined {
  const gx = (point.x - grid.origin.x) / grid.spacing, gy = (point.y - grid.origin.y) / grid.spacing;
  if (!(gx >= 0 && gy >= 0 && gx <= grid.size - 1 && gy <= grid.size - 1)) return undefined;
  const x0 = Math.min(grid.size - 2, Math.floor(gx)), y0 = Math.min(grid.size - 2, Math.floor(gy)), tx = gx - x0, ty = gy - y0;
  const at = (x: number, y: number) => grid.elevations[y * grid.size + x];
  const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
  if (a === null || b === null || c === null || d === null) return null;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** Relative to the reference altitude (EGPWS bands), or "peaks" against the highest terrain in view.
 * Peaks never shades ground within 1,000 ft of the field, so flat country stays black. */
export function terrainClass(elevation: number | null, reference: number | undefined, peaks: {max: number; field: number}): TerrainClass | undefined {
  if (elevation === null) return "noData";
  if (reference !== undefined) {
    const above = elevation - reference;
    return above > 2000 ? "red" : above > 1000 ? "amberHigh" : above > -500 ? "amberLow" : above > -1000 ? "greenHigh" : above > -2000 ? "greenLow" : undefined;
  }
  if (elevation < peaks.field + 1000) return;
  return elevation >= peaks.max - 1500 ? "greenHigh" : elevation >= peaks.max - 4000 ? "greenLow" : undefined;
}

const worldAt = (camera: MapCamera, size: MapSize, x: number, y: number): Point =>
  ({x: camera.center.x + (x - size.width / 2) / camera.scale, y: camera.center.y - (y - size.height / 2) / camera.scale});

/** Highest and lowest sampled terrain in view, for the TERR readout. */
export function terrainExtremes(grid: ScopeTerrain, camera: MapCamera, size: MapSize) {
  const a = worldAt(camera, size, 0, size.height), b = worldAt(camera, size, size.width, 0);
  let max = -Infinity, min = Infinity;
  for (let row = 0; row < grid.size; row++) {
    const y = grid.origin.y + row * grid.spacing;
    if (y < a.y - grid.spacing || y > b.y + grid.spacing) continue;
    for (let column = 0; column < grid.size; column++) {
      const x = grid.origin.x + column * grid.spacing, value = grid.elevations[row * grid.size + column];
      if (value === null || x < a.x - grid.spacing || x > b.x + grid.spacing) continue;
      max = Math.max(max, value); min = Math.min(min, value);
    }
  }
  return Number.isFinite(max) ? {max, min: Math.max(0, min)} : undefined;
}

/** Dense dots use a staggered 4 px lattice; sparse dots keep a quarter of it. */
export function drawTerrain(ctx: CanvasRenderingContext2D, grid: ScopeTerrain, camera: MapCamera, size: MapSize, reference: number | undefined, field: number, opacity = .75) {
  const extremes = terrainExtremes(grid, camera, size);
  if (!extremes) return;
  const peaks = {max: extremes.max, field};
  const dots = new Map<TerrainClass, number[]>();
  for (let row = 0, y = DOT_SPACING / 2; y < size.height; row++, y += DOT_SPACING) {
    const shift = row & 1 ? DOT_SPACING / 2 : 0;
    for (let column = 0, x = shift; x < size.width; column++, x += DOT_SPACING) {
      const elevation = terrainElevationAt(grid, worldAt(camera, size, x, y));
      if (elevation === undefined) continue;
      const kind = terrainClass(elevation, reference, peaks);
      if (!kind || !fills[kind].dense && (row & 1 || (column + (row >> 1)) & 1)) continue;
      let list = dots.get(kind); if (!list) dots.set(kind, list = []);
      list.push(x, y);
    }
  }
  ctx.save(); ctx.globalAlpha = opacity;
  for (const [kind, list] of dots) {
    ctx.fillStyle = fills[kind].color;
    for (let i = 0; i < list.length; i += 2) ctx.fillRect(list[i] - DOT_SIZE / 2, list[i + 1] - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE);
  }
  ctx.restore();
}

/** The ND readout colours each figure by the band it would be drawn in. */
export function terrainFigureColor(elevation: number, reference: number | undefined) {
  if (reference === undefined) return TERRAIN_COLORS.green;
  const above = elevation - reference;
  return above > 2000 ? TERRAIN_COLORS.red : above > -500 ? TERRAIN_COLORS.amber : TERRAIN_COLORS.green;
}
export const terrainHundreds = (feet: number) => String(Math.max(0, Math.round(feet / 100))).padStart(3, "0");
