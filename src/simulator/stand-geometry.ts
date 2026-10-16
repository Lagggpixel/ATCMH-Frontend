import type {Airport} from "./model";

/** KDAL 13/15A have reversed OSM ways. Normalize nose geometry without
 * changing the pinned source snapshot or taxi graph connectivity. */
export function standPoints(airport: Airport, stand: Airport["features"][number]) {
  return airport.icao === "KDAL" && ["1215434678", "1215434679"].includes(stand.id)
    ? stand.points.toReversed() : stand.points;
}
