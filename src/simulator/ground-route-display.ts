import {airportRunways, runwayEnds} from "./airports";
import type {Airport, GroundRoute, Point} from "./model";

export interface GroundRouteItem {
  key: string;
  index: number;
  name: string;
  text: string;
  mapText: string;
  point: Point;
  hold: boolean;
  canHold: boolean;
  type: "start" | "taxiway" | "waypoint" | "hold" | "runway" | "parking" | "push" | "pull";
}

/** IF TaxiPathEditor rows, excluding the routing graph's intermediate vertices. */
export function groundRouteItems(airport: Airport, route: GroundRoute): GroundRouteItem[] {
  const items: GroundRouteItem[] = [];
  const add = (index: number, type: GroundRouteItem["type"], name: string, point: Point = route.points[index]) => {
    const hold = !!route.points[index].hold && !["start", "runway", "parking", "push", "pull"].includes(type);
    const prefix = type === "push" ? "Push to " : type === "pull" ? "Pull to " : "";
    items.push({key: `${type}-${index}`, index, type, name, point, hold, canHold: ["hold", "taxiway", "waypoint"].includes(type),
      text: `${prefix}${name}${hold ? " (Hold)" : ""}${type === "hold" ? " [Threshold]" : ""}`,
      mapText: type === "runway" ? `Runway ${name}` : type === "hold" ? `Hold ${name}${hold ? " Hold" : ""}` : type === "push" ? "Push" : type === "pull" ? "Pull" : `${name}${hold ? " Hold" : ""}`});
  };
  add(0, "start", "Start");
  if (route.kind === "pushback") {
    route.controlIndices.slice(1).forEach((index, i) => add(index, i ? "pull" : "push", "Waypoint"));
    return items;
  }
  route.points.forEach((point, index) => {
    if (!index) return;
    if (point.name && point.name !== route.points[index - 1]?.name && !point.runway) add(index, "taxiway", point.name);
    if (point.runway) {
      const pair = airportRunways(airport).find(pair => pair.ends.some(end => end.id === point.runway));
      add(index, "hold", pair?.ends.map(end => end.id).join("-") ?? point.runway);
    } else if (route.controlIndices.includes(index)) {
      if (index === route.points.length - 1 && route.destination.type === "parking") add(index, "parking", airport.features.find(f => f.id === route.destination.id)?.name || "Parking");
      else add(index, "waypoint", "Waypoint");
    }
  });
  if (route.destination.type === "runway") {
    const end = runwayEnds(airport).find(end => end.id === route.destination.id);
    if (end) add(route.points.length - 1, "runway", end.id, end.point);
  }
  return items;
}
