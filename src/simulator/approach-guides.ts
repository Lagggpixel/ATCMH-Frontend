import {engineFor} from "./engine";
import {defaultAirport} from "./airports";
import type {Airport} from "./model";
import type {Runway} from "./model";

export function approachGuide(runway: Runway, airport: Airport = defaultAirport) {
  const {threshold, vector} = engineFor({airport: airport.icao}).runwayGeometry(runway);
  const center = {x: threshold.x - vector.x * 11, y: threshold.y - vector.y * 11};
  const side = {x: vector.y * .5, y: -vector.x * .5};
  return {threshold, center, left: {x: center.x + side.x, y: center.y + side.y}, right: {x: center.x - side.x, y: center.y - side.y}};
}
