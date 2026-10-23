import type {Point, RadarEnvironment, RoutePoint} from "./model";

export type FixLabelMode = "auto" | "all" | "none";
export interface FixSymbol extends Point {id: string; key: string; route: boolean}
interface Viewport {width: number; height: number}
interface Box {x: number; y: number; width: number; height: number}
export interface FixLabel extends Box {symbol: FixSymbol}

// A fixed rank spreads names through the catalogue without changing on pan/zoom.
function rank(key: string) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function projectFixSymbols(fixes: RadarEnvironment["fixes"], route: RoutePoint[] | undefined, camera: {center: Point; scale: number}, size: Viewport): FixSymbol[] {
  return fixes.map(fix => ({
    id: fix.id, key: `${fix.id}:${fix.point.x}:${fix.point.y}`,
    x: size.width / 2 + (fix.point.x - camera.center.x) * camera.scale,
    y: size.height / 2 - (fix.point.y - camera.center.y) * camera.scale,
    route: !!route?.some(point => Math.hypot(point.x - fix.point.x, point.y - fix.point.y) < .001),
  })).filter(fix => fix.x >= -4 && fix.x <= size.width + 4 && fix.y >= -4 && fix.y <= size.height + 4)
    .sort((a, b) => Number(b.route) - Number(a.route) || rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}

/** Symbols never depend on label mode. Route names claim space before background names. */
export function layoutFixLabels(symbols: FixSymbol[], size: Viewport, measure: (name: string) => number, mode: FixLabelMode): FixLabel[] {
  if (mode === "none") return [];
  const labels: FixLabel[] = [];
  // Screen-space buckets keep dense catalogues cheap during camera movement.
  const occupied = new Map<string, Box[]>();
  const cells = (box: Box) => {
    const keys: string[] = [];
    for (let x = Math.floor(box.x / 64); x <= Math.floor((box.x + box.width) / 64); x++)
      for (let y = Math.floor(box.y / 64); y <= Math.floor((box.y + box.height) / 64); y++) keys.push(`${x}:${y}`);
    return keys;
  };
  const reserve = (box: Box) => {for (const key of cells(box)) {const items = occupied.get(key) ?? []; items.push(box); occupied.set(key, items);}};
  const collides = (box: Box) => cells(box).some(key => occupied.get(key)?.some(other =>
    box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y));
  // Keep names clear of every fix triangle, including fixes whose names are hidden.
  for (const symbol of symbols) reserve({x: symbol.x - 4, y: symbol.y - 4, width: 8, height: 8});
  for (const symbol of symbols) {
    const width = measure(symbol.id), height = 14;
    const positions = [{x: symbol.x + 10, y: symbol.y - 7}];
    // Important route names can use another side of the triangle in a tight cluster.
    if (symbol.route && mode === "auto") positions.push(
      {x: symbol.x - width - 10, y: symbol.y - 7},
      {x: symbol.x - width / 2, y: symbol.y - height - 10},
      {x: symbol.x - width / 2, y: symbol.y + 10},
    );
    for (const position of positions) {
      const label = {...position, width, height, symbol};
      const padded = {x: label.x - 4, y: label.y - 4, width: width + 8, height: height + 8};
      if (mode === "auto" && (padded.x < 0 || padded.y < 0 || padded.x + padded.width > size.width || padded.y + padded.height > size.height || collides(padded))) continue;
      labels.push(label); reserve(padded); break;
    }
  }
  return labels;
}

export function hitFixSymbol(symbols: FixSymbol[], point: Point, radius = 12): FixSymbol | undefined {
  let nearest: FixSymbol | undefined, best = radius;
  for (const symbol of symbols) {
    const distance = Math.hypot(symbol.x - point.x, symbol.y - point.y);
    if (distance < best) {nearest = symbol; best = distance;}
  }
  return nearest;
}
