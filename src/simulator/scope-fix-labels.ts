import type {Point, RoutePoint} from "./model";
import {navigationKind, navigationSizes, type NavigationKind} from "./navigation-symbols";
import type {ScopeNavigationFix} from "./scope-overlays";

export type FixLabelMode = "auto" | "all" | "none";
export interface FixSymbol extends Point {id: string; key: string; route: boolean; kind: NavigationKind; background: boolean}
interface Viewport {width: number; height: number}
interface Box {x: number; y: number; width: number; height: number}
export interface FixLabel extends Box {symbol: FixSymbol}

// A fixed rank spreads names through the catalogue without changing on pan/zoom.
function rank(key: string) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** A stable geographic grid approximates zoom-dependent aviation tiles. Only
 * background fixes are thinned; navaids and selected aircraft routes remain. */
export function selectScopeFixes(fixes: ScopeNavigationFix[], route: RoutePoint[] | undefined, scale: number): ScopeNavigationFix[] {
  if (!Number.isFinite(scale) || scale <= 0) return fixes;
  // Power-of-two cells are anchored to the airport, so panning does not reshuffle them.
  const cellSize = 2 ** Math.ceil(Math.log2(72 / scale));
  const cells = new Map<string, {fix: ScopeNavigationFix; key: string; rank: number}>();
  const retained: ScopeNavigationFix[] = [];
  for (const fix of fixes) {
    if (fix.routeOnly || navigationKind(fix) !== "fix" || route?.some(point => Math.hypot(point.x - fix.point.x, point.y - fix.point.y) < .001)) {
      retained.push(fix); continue;
    }
    const key = `${fix.id}:${fix.point.x}:${fix.point.y}`;
    const cell = `${Math.floor(fix.point.x / cellSize)}:${Math.floor(fix.point.y / cellSize)}`;
    const score = rank(key), current = cells.get(cell);
    if (!current || score < current.rank || score === current.rank && key < current.key) cells.set(cell, {fix, key, rank: score});
  }
  return [...retained, ...Array.from(cells.values(), item => item.fix)];
}

export function projectFixSymbols(fixes: ScopeNavigationFix[], route: RoutePoint[] | undefined, camera: {center: Point; scale: number}, size: Viewport): FixSymbol[] {
  return fixes.map(fix => ({
    id: fix.id, key: `${fix.id}:${fix.point.x}:${fix.point.y}`,
    kind: navigationKind(fix), background: !fix.routeOnly,
    x: size.width / 2 + (fix.point.x - camera.center.x) * camera.scale,
    y: size.height / 2 - (fix.point.y - camera.center.y) * camera.scale,
    route: !!route?.some(point => Math.hypot(point.x - fix.point.x, point.y - fix.point.y) < .001),
  })).filter(fix => fix.x >= -15 && fix.x <= size.width + 15 && fix.y >= -15 && fix.y <= size.height + 15)
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
  // NDB/VOR/TACAN glyphs need their own bounds when Auto is used by a consumer.
  for (const symbol of symbols) {
    const radius = (symbol.background ? navigationSizes[symbol.kind] : 10) / 2;
    reserve({x: symbol.x - radius, y: symbol.y - radius, width: radius * 2, height: radius * 2});
  }
  for (const symbol of symbols) {
    const width = measure(symbol.id), height = 14;
    // IF RenderWaypoint centres a white identifier below the symbol at y + 20.
    const positions = [{x: symbol.x - width / 2, y: symbol.y + 20 - height / 2}];
    // Important route names can use another side of the triangle in a tight cluster.
    if (symbol.route && mode === "auto") positions.push(
      {x: symbol.x - width - 10, y: symbol.y - 7},
      {x: symbol.x - width / 2, y: symbol.y - height - 10},
      {x: symbol.x - width / 2, y: symbol.y + 10},
    );
    let placed = false;
    for (const position of positions) {
      const label = {...position, width, height, symbol};
      const padded = {x: label.x - 4, y: label.y - 4, width: width + 8, height: height + 8};
      if (mode === "auto" && (padded.x < 0 || padded.y < 0 || padded.x + padded.width > size.width || padded.y + padded.height > size.height || collides(padded))) continue;
      labels.push(label); reserve(padded); placed = true; break;
    }
    // A selected route should remain identifiable even in an unavoidable cluster.
    if (!placed && symbol.route && mode === "auto") {
      const label = {...positions[0], width, height, symbol};
      labels.push(label); reserve({x: label.x - 4, y: label.y - 4, width: width + 8, height: height + 8});
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
