import {runwayGeometry} from "./engine";
import type {Runway} from "./model";

export function approachGuide(runway: Runway) {
  const {threshold, vector} = runwayGeometry(runway);
  const center = {x: threshold.x - vector.x * 11, y: threshold.y - vector.y * 11};
  const side = {x: vector.y * .5, y: -vector.x * .5};
  return {threshold, center, left: {x: center.x + side.x, y: center.y + side.y}, right: {x: center.x - side.x, y: center.y - side.y}};
}
