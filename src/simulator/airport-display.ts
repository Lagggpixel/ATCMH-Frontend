import type {ExerciseWeather, Point, RoutePoint} from "./model";

export interface ScopeAirport {identifier: string; name: string | null; point: Point; isTowered: boolean; elevationFeet?: number; importance?: number; longestRunwayLengthFeet?: number}
export interface AirportRunwayInfo {
  id: string; heading: number; lengthFeet: number; widthFeet?: number;
  surface?: string; ils?: {identifier?: string; mhz?: string; glideAngle?: number};
}
export interface AirportInformation {
  airport: string; name: string; elevationFeet?: number; location?: {lat: number; lon: number}; isTowered?: boolean;
  city?: string; state?: string; airportClass?: string; contributors?: string;
  runways: AirportRunwayInfo[]; frequencies: {id: string; name: string; type: string; mhz: string}[]; warnings: string[];
}
export interface AirportWeather {
  airport: string; fetchedAt: string; weather?: ExerciseWeather; taf?: string;
  atis: {type: string; datis: string; updatedAt: string}[]; warnings: string[];
}
export interface AirportProcedure {
  id: string; airport: string; name: string; type: "SID" | "STAR" | "Approach"; index?: number;
  routes: {id: string; name: string; points: RoutePoint[]}[];
}
export interface AirportProcedures {airport: string; origin: string; revision: string; procedures: AirportProcedure[]}
export type AirportDisplayData = AirportInformation | AirportWeather | AirportProcedures;

/** Only the controlled airport can supply procedure catalogues and geometry. */
export const canLoadAirportProcedures = (airport: string | undefined, origin: string | undefined) => !!airport && airport === origin;

/** Hit the displayed airport symbols, nearest first, with IF's three-airport cap. */
export function hitAirports(airports: readonly ScopeAirport[], at: Point, project: (p: Point) => Point, radius = 30) {
  return airports.map(airport => ({airport, distance: Math.hypot(project(airport.point).x - at.x, project(airport.point).y - at.y)}))
    .filter(item => item.distance <= radius).sort((a, b) => a.distance - b.distance).slice(0, 3).map(item => item.airport);
}
export const procedureKey = (procedure: Pick<AirportProcedure, "airport" | "id">) => `${procedure.airport}:${procedure.id}`;
// Infinite Flight 26.4 UIUtils.ProcedureColors: indexed by procedure, not type.
export const PROCEDURE_COLORS = ["#ff9aa2", "#ffb7b2", "#ffdac1", "#e2f0cb", "#b5ead7", "#c7ceea"] as const;
export const procedureColor = (procedure: Pick<AirportProcedure, "index">) => PROCEDURE_COLORS[(procedure.index ?? 0) % PROCEDURE_COLORS.length];
export function procedureRunwaySummary(procedure: Pick<AirportProcedure, "routes">) {
  const ends = [...new Set(procedure.routes.flatMap(route => route.name.match(/^RW(\d{2}[LRC]?)(?:\b|$)/)?.[1] ?? []))];
  return ends.length > 3 ? `${ends.length} Rwys` : ends.length ? ends.join(",") : "All Rwys";
}
/** Empty selections preview everything only while that airport's picker is open. */
export function visibleProcedures(selected: readonly AirportProcedure[], preview?: AirportProcedures) {
  if (!preview || selected.some(item => item.airport === preview.airport)) return selected;
  return [...selected, ...preview.procedures];
}
export function runwayWindComponents(heading: number, weather: ExerciseWeather) {
  const angle = (weather.windDirection - heading) * Math.PI / 180;
  return {headwind: Math.round(Math.cos(angle) * weather.windSpeed), crosswind: Math.round(Math.abs(Math.sin(angle) * weather.windSpeed))};
}
export function weatherCategory(weather?: ExerciseWeather) {
  if (!weather) return;
  const ceiling = [...(weather.rawMetar ?? "").matchAll(/\b(?:BKN|OVC|VV)(\d{3})/g)].map(match => Number(match[1]) * 100);
  const feet = ceiling.length ? Math.min(...ceiling) : /\b(?:CLR|SKC|NSC|NCD|CAVOK|FEW\d{3}|SCT\d{3})\b/.test(weather.rawMetar ?? "") ? Infinity : undefined;
  const miles = weather.visibilityKm / 1.609344;
  if (miles < 1 || feet !== undefined && feet < 500) return "LIFR";
  if (miles < 3 || feet !== undefined && feet < 1000) return "IFR";
  if (feet === undefined) return;
  return miles <= 5 || feet <= 3000 ? "MVFR" : "VFR";
}
