import type {Airport} from "./model";

/** Normalize the mapped nose direction for the affected stand centerlines. */
export function standPoints(airport: Airport, stand: Airport["features"][number]) {
  return (airport.icao === "KDAL" && ["1215434678", "1215434679"].includes(stand.id) ||
    airport.icao === "KBHM" && ["940275b5746ce599708379d966d420bc752ffcefc2c22afd10ebe0804ef9b044", "a9648e4202a624027c6035db9f6cf57d71dcf83c471b54b626ce911fe42b1f93"].includes(airport.dataVersion ?? "") && stand.id.startsWith("10571855"))
    ? stand.points.toReversed() : stand.points;
}
