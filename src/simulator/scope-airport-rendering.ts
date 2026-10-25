import type {ScopeAirport} from "./airport-display";
import {approachGuide, approachGuideFromEndpoints} from "./approach-guides";
import type {Airport, Point} from "./model";
import type {MapCamera, MapSize} from "./scope-camera";
import type {ScopeMapData} from "./scope-map-data";

export type MapApproach = NonNullable<ScopeMapData["approaches"]>[number];
export interface AirportSymbol {airport: ScopeAirport; x: number; y: number; labelWidth: number; pinned: boolean; selected: boolean}
interface Bounds {left: number; right: number; top: number; bottom: number}

/** Flat-map equivalent of IF's 45-degree vertical FOV. Never use aircraft altitude. */
export const mapCameraAltitude = (camera: Pick<MapCamera, "scale">, size: Pick<MapSize, "height">) =>
  size.height * 1852 / (2 * Math.tan(Math.PI / 8) * camera.scale);
export const directApproachesVisible = (altitude: number) => altitude < 800000;
export const runwayNumbersVisible = (altitude: number) => altitude < 80000;
export const projectMapPoint = (point: Point, camera: MapCamera, size: MapSize) => ({
  x: size.width / 2 + (point.x - camera.center.x) * camera.scale,
  y: size.height / 2 - (point.y - camera.center.y) * camera.scale,
});
const intersects = (a: Bounds, b: Bounds) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Sweatbox's flat-map LOD, not IF's unavailable tile inclusion rules. Larger
 * runways earn background detail first; at 24 CSS px/NM reveal even fields
 * without runway metadata. CSS pixels keep this independent of device DPI. */
function airportDetailVisible(airport: ScopeAirport, scale: number, minimumPixels: number) {
  const feet = airport.longestRunwayLengthFeet ?? 0;
  return scale >= 24 || Number.isFinite(feet) && feet > 0 && feet / 6076.11549 * scale >= minimumPixels;
}

/** Match IF's longest-runway, importance, ID ordering before screen-space declutter.
 * Pin the controlled and selected airports, including a selected non-towered field.
 * Background airports need a 4px towered / 8px non-towered projected runway. */
export function layoutAirportSymbols(airports: readonly ScopeAirport[], camera: MapCamera, size: MapSize,
  controlled: string, selected: string | undefined, uncontrolled: boolean, measure = (text: string) => text.length * 8): AirportSymbol[] {
  const boxes: Bounds[] = [], symbols: AirportSymbol[] = [];
  const ordered = [...airports].sort((a, b) =>
    Number(b.identifier === controlled || b.identifier === selected) - Number(a.identifier === controlled || a.identifier === selected)
    || (b.longestRunwayLengthFeet ?? 0) - (a.longestRunwayLengthFeet ?? 0)
    || (a.importance ?? Number.MAX_SAFE_INTEGER) - (b.importance ?? Number.MAX_SAFE_INTEGER)
    || a.identifier.localeCompare(b.identifier));
  for (const airport of ordered) {
    const pinned = airport.identifier === controlled || airport.identifier === selected;
    if (!pinned && !airport.isTowered && !uncontrolled) continue;
    if (!pinned && !airportDetailVisible(airport, camera.scale, airport.isTowered ? 4 : 8)) continue;
    const {x, y} = projectMapPoint(airport.point, camera, size);
    if (x < -50 || x > size.width + 50 || y < -50 || y > size.height + 50) continue;
    // IF: 20px icon, 12px label centered 35px above it, 4px collision margin.
    const labelWidth = measure(airport.identifier), half = Math.max(10, labelWidth / 2);
    const box = {left: x - half - 4, right: x + half + 4, top: y - 46, bottom: y + 14};
    if (!pinned && boxes.some(other => intersects(box, other))) continue;
    boxes.push(box);
    symbols.push({airport, x, y, labelWidth, pinned, selected: airport.identifier === selected});
  }
  // Background labels first; pinned labels win where the two pinned boxes overlap.
  return symbols.sort((a, b) => Number(a.pinned) - Number(b.pinned));
}

/** Geometry follows the retained airport symbols, at a closer 16px runway LOD.
 * Always retain pinned geometry, including cones crossing from offscreen. */
export function visibleRunwayAirports(symbols: readonly AirportSymbol[], scale: number, controlled: string, selected: string | undefined) {
  const visible = new Set([controlled]);
  if (selected) visible.add(selected);
  for (const symbol of symbols) {
    if (symbol.pinned || airportDetailVisible(symbol.airport, scale, 16)) visible.add(symbol.airport.identifier);
  }
  return visible;
}

/** Include the label above the icon; culled airports must never intercept a tap. */
export function hitAirportSymbols(symbols: readonly AirportSymbol[], at: Point, radius = 30) {
  return symbols.map(symbol => ({symbol, distance: Math.hypot(symbol.x - at.x, symbol.y - at.y)}))
    .filter(({symbol, distance}) => distance <= radius || Math.abs(symbol.x - at.x) <= symbol.labelWidth / 2 + 4 && at.y >= symbol.y - 46 && at.y <= symbol.y - 24)
    .sort((a, b) => a.distance - b.distance).slice(0, 3).map(item => item.symbol.airport);
}

export function airportRunwayLengths(approaches: readonly MapApproach[]) {
  const lengths = new Map<string, number>();
  for (const item of approaches) {
    const feet = Math.hypot(item.departure.x - item.threshold.x, item.departure.y - item.threshold.y) * 6076.11549;
    lengths.set(item.airportIcao, Math.max(lengths.get(item.airportIcao) ?? 0, feet));
  }
  return lengths;
}

export function airportApproachGuides(airport: Airport, nearby: readonly MapApproach[]) {
  return [
    ...(airport.runways ?? [airport.runway]).flatMap(runway => runway.ends.map(end => ({airportIcao: airport.icao, runway: end.id, heading: end.heading,
      departure: runway.ends.find(other => other.id !== end.id)?.point ?? end.point, guide: approachGuide(end.id, airport)}))),
    ...nearby.filter(item => item.airportIcao !== airport.icao).flatMap(item => {
      const guide = approachGuideFromEndpoints(item.threshold, item.departure, item.localizer ?? item.ils);
      return guide ? [{airportIcao: item.airportIcao, runway: item.runway,
        heading: (Math.atan2(item.departure.x - item.threshold.x, item.departure.y - item.threshold.y) * 180 / Math.PI + 360) % 360, departure: item.departure, guide}] : [];
    }),
  ];
}
export type AirportApproachGuide = ReturnType<typeof airportApproachGuides>[number];

/** Pins survive zoom decluttering and layer switches. Keep IF's camera-height
 * threshold for the thicker direct overlay, while retaining thin pinned cones. */
export function approachStyle(item: AirportApproachGuide, controlled: string, selected: string | undefined,
  towered: ReadonlyMap<string, boolean>, options: {approaches: boolean; uncontrolledAirports: boolean}, altitude: number, controlledInMap: boolean) {
  const direct = (item.airportIcao === selected || item.airportIcao === controlled && !controlledInMap) && directApproachesVisible(altitude);
  if (direct) return {width: 2, direct: true};
  if (item.airportIcao !== controlled && item.airportIcao !== selected && (!options.approaches || !options.uncontrolledAirports && !towered.get(item.airportIcao))) return;
  return {width: .75, direct: false};
}

/** Cull geometry by its whole bounding box: a cone can cross the screen while its airport is offscreen. */
export function mapPathVisible(points: readonly Point[], camera: MapCamera, size: MapSize) {
  const halfWidth = size.width / camera.scale / 2, halfHeight = size.height / camera.scale / 2;
  return Math.max(...points.map(p => p.x)) >= camera.center.x - halfWidth
    && Math.min(...points.map(p => p.x)) <= camera.center.x + halfWidth
    && Math.max(...points.map(p => p.y)) >= camera.center.y - halfHeight
    && Math.min(...points.map(p => p.y)) <= camera.center.y + halfHeight;
}
