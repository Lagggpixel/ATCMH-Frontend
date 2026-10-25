import {engineFor} from "./engine";
import {defaultAirport} from "./airports";
import type {Airport, Point} from "./model";
import type {Runway} from "./model";
import runwayIls from "./data/runway-ils.json";
import {IF_COLORS, IF_MAP_COLORS} from "./if-colors";

const runwayCapabilities: Record<string, Record<string, {localizer: boolean; glideslope: boolean}>> = runwayIls.airports;

export function approachGuide(runway: Runway, airport: Airport = defaultAirport) {
  const {threshold, vector} = engineFor({airport: airport.icao, airportDataVersion: airport.dataVersion}).runwayGeometry(runway);
  const identifier = runway.trim().toUpperCase().replace(/^\d{1,2}/, number => number.padStart(2, "0"));
  const capability = runwayCapabilities[airport.icao]?.[identifier];
  // IF colors the map cone from Localizer != null, including LOC-only ends.
  const ils = capability?.localizer;
  return guideGeometry(threshold, vector, !!ils);
}

/** Nearby runway geometry is display-only and never changes an aircraft's approach. */
export function approachGuideFromEndpoints(threshold: Point, departure: Point, ils: boolean) {
  const dx = departure.x - threshold.x, dy = departure.y - threshold.y, length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length === 0) return;
  return guideGeometry(threshold, {x: dx / length, y: dy / length}, ils);
}

// IF 26.4 MapTilesManager.RenderRunwayAndApproach; map coordinates are NM.
export const APPROACH_LENGTH_NM = 19000 / 1852;
export const APPROACH_HALF_WIDTH_NM = 995.60004 / 1852;
function guideGeometry(threshold: Point, vector: Point, ils: boolean) {
  const center = {x: threshold.x - vector.x * APPROACH_LENGTH_NM, y: threshold.y - vector.y * APPROACH_LENGTH_NM};
  const side = {x: vector.y * APPROACH_HALF_WIDTH_NM, y: -vector.x * APPROACH_HALF_WIDTH_NM};
  const color = ils ? IF_MAP_COLORS.ilsEdge : IF_COLORS.offFrequency;
  const centerColor = ils ? IF_MAP_COLORS.ilsCenter : IF_COLORS.offFrequency;
  return {threshold, center, left: {x: center.x + side.x, y: center.y + side.y}, right: {x: center.x - side.x, y: center.y - side.y}, color, centerColor};
}
