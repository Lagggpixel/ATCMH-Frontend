import type {Point} from "./model";
import type {MapCamera, MapSize} from "./scope-camera";
import type {ScopeTerrain} from "./scope-map-data";

/** Airbus ND / EGPWS colours. */
export const TERRAIN_COLORS = {red: "#ff2a1a", amber: "#ffbf00", green: "#19d219", magenta: "#ff3cff", cyan: "#00e5ff"} as const;
export type TerrainClass = "red" | "amberHigh" | "amberLow" | "greenHigh" | "greenLow" | "greenFaint" | "noData";
const DOT_SPACING = 6, DOT_SIZE = 1.6;
/** Density is the coarsest lattice drawn in full: 1 dense, 2 sparse (a quarter), 3 faint (a sixteenth). */
const fills: Record<TerrainClass, {color: string; density: number}> = {
  red: {color: TERRAIN_COLORS.red, density: 1}, amberHigh: {color: TERRAIN_COLORS.amber, density: 1},
  amberLow: {color: TERRAIN_COLORS.amber, density: 2}, greenHigh: {color: TERRAIN_COLORS.green, density: 1},
  greenLow: {color: TERRAIN_COLORS.green, density: 2}, greenFaint: {color: TERRAIN_COLORS.green, density: 3},
  noData: {color: TERRAIN_COLORS.magenta, density: 2},
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

/** Relative to the reference altitude (EGPWS bands), or "peaks" against the terrain in view: ground from
 * 500 ft above the field up to the highest point is split into thirds, densest at the top. */
export function terrainClass(elevation: number | null, reference: number | undefined, peaks: {max: number; field: number}): TerrainClass | undefined {
  if (elevation === null) return "noData";
  if (reference !== undefined) {
    const above = elevation - reference;
    return above > 2000 ? "red" : above > 1000 ? "amberHigh" : above > -500 ? "amberLow" : above > -1000 ? "greenHigh" : above > -2000 ? "greenLow" : undefined;
  }
  const floor = peaks.field + 500, range = Math.max(1500, peaks.max - floor);
  if (elevation < floor) return;
  const height = (elevation - floor) / range;
  return height >= 2 / 3 ? "greenHigh" : height >= 1 / 3 ? "greenLow" : "greenFaint";
}

/** Manual REF steps: AUTO (peaks), then whole thousands from the first one at least 1,000 ft above the field. */
export const TERRAIN_REFERENCE_MAX = 25000;
export function stepTerrainReference(current: number, direction: 1 | -1, field: number) {
  const lowest = Math.ceil((field + 1000) / 1000) * 1000;
  if (!current) return direction > 0 ? lowest : 0;
  const next = current + direction * 1000;
  return next < lowest ? 0 : Math.min(TERRAIN_REFERENCE_MAX, next);
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

const even = (value: number) => (value % 2 + 2) % 2 === 0;
/** How many times a point of the finest lattice survives halving: a staggered lattice's points at
 * (i + odd(j)/2, j) belong to the next coarser one when j is even and i + j/2 is even. */
function latticeLevel(i: number, j: number, limit: number) {
  let level = 0;
  while (level < limit && even(j) && even(i + j / 2)) {
    const row = j / 2; i = (i - (even(row) ? 0 : 1)) / 2; j = row; level++;
  }
  return level;
}

/** Dots are pinned to the map so terrain does not slide under them while panning or zooming.
 * The lattice halves in world size at each zoom doubling; the extra dots fade in between,
 * keeping screen spacing between 3 and 6 px. Sparse bands keep a quarter of the dense dots. */
export function drawTerrain(ctx: CanvasRenderingContext2D, grid: ScopeTerrain, camera: MapCamera, size: MapSize, reference: number | undefined, field: number, opacity = .75) {
  const extremes = terrainExtremes(grid, camera, size);
  if (!extremes) return;
  const peaks = {max: extremes.max, field};
  const zoom = Math.log2(DOT_SPACING / camera.scale), spacing = 2 ** Math.floor(zoom), fade = 1 - (zoom - Math.floor(zoom));
  const a = worldAt(camera, size, 0, size.height), b = worldAt(camera, size, size.width, 0);
  const dots = new Map<string, {color: string; alpha: number; points: number[]}>();
  for (let j = Math.floor(a.y / spacing) - 1; j <= Math.ceil(b.y / spacing) + 1; j++) {
    const shift = even(j) ? 0 : .5, y = j * spacing;
    for (let i = Math.floor(a.x / spacing - shift) - 1; i <= Math.ceil(b.x / spacing) + 1; i++) {
      const level = latticeLevel(i, j, 3);
      if (!level && fade < .03) continue;
      const elevation = terrainElevationAt(grid, {x: (i + shift) * spacing, y});
      if (elevation === undefined) continue;
      const kind = terrainClass(elevation, reference, peaks);
      if (!kind) continue;
      // Each density is fully drawn from its own lattice; the next finer one fades in while zooming.
      const visible = fills[kind].density;
      if (level < visible - 1) continue;
      const alpha = level >= visible ? 1 : fade;
      if (alpha < .03) continue;
      const key = `${kind}:${alpha === 1 ? 1 : 0}`;
      let group = dots.get(key); if (!group) dots.set(key, group = {color: fills[kind].color, alpha, points: []});
      group.points.push(camera.scale * ((i + shift) * spacing - camera.center.x) + size.width / 2, size.height / 2 - camera.scale * (y - camera.center.y));
    }
  }
  ctx.save();
  for (const group of dots.values()) {
    ctx.globalAlpha = opacity * group.alpha; ctx.fillStyle = group.color;
    for (let i = 0; i < group.points.length; i += 2) ctx.fillRect(group.points[i] - DOT_SIZE / 2, group.points[i + 1] - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE);
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
