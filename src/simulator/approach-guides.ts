import {engineFor} from "./engine";
import {defaultAirport} from "./airports";
import type {Airport} from "./model";
import type {Runway} from "./model";
import runwayIls from "./data/runway-ils.json";
import {IF_COLORS, IF_MAP_COLORS} from "./if-colors";

const runwayCapabilities: Record<string, Record<string, {localizer: boolean; glideslope: boolean}>> = runwayIls.airports;

export function approachGuide(runway: Runway, airport: Airport = defaultAirport) {
  const {threshold, vector} = engineFor({airport: airport.icao}).runwayGeometry(runway);
  const center = {x: threshold.x - vector.x * 11, y: threshold.y - vector.y * 11};
  const side = {x: vector.y * .5, y: -vector.x * .5};
  const identifier = runway.trim().toUpperCase().replace(/^\d{1,2}/, number => number.padStart(2, "0"));
  const capability = runwayCapabilities[airport.icao]?.[identifier];
  const ils = capability?.localizer && capability.glideslope;
  const color = ils ? IF_MAP_COLORS.ilsEdge : IF_COLORS.offFrequency;
  const centerColor = ils ? IF_MAP_COLORS.ilsCenter : IF_COLORS.offFrequency;
  return {threshold, center, left: {x: center.x + side.x, y: center.y + side.y}, right: {x: center.x - side.x, y: center.y - side.y}, color, centerColor};
}
