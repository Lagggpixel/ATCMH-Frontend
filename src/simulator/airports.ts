import egph from "./data/egph.json";
import egll from "./data/egll.json";
import kbhm from "./data/kbhm.json";
import cyul from "./data/cyul.json";
import roah from "./data/roah.json";
import kdal from "./data/kdal.json";
import sbbr from "./data/sbbr.json";
import type {Airport, Frequency} from "./model";

export const AIRPORT_IDS = ["EGPH", "EGLL", "KBHM", "CYUL", "ROAH", "KDAL", "SBBR"] as const;
export type AirportId = typeof AIRPORT_IDS[number];
export const airportData = {EGPH: egph, EGLL: egll, KBHM: kbhm, CYUL: cyul, ROAH: roah, KDAL: kdal, SBBR: sbbr};
const snapshots: Record<AirportId, Airport> = {
  EGPH: {...egph, dataVersion: egph.sourceDate, runways: [{...egph.runway, id: "06/24"}]},
  EGLL: {...egll, runway: egll.runways[0]}, KBHM: {...kbhm, runway: kbhm.runways[0]},
  CYUL: {...cyul, runway: cyul.runways[0]}, ROAH: {...roah, runway: roah.runways[0]},
  KDAL: {...kdal, runway: kdal.runways[0]}, SBBR: {...sbbr, runway: sbbr.runways[0]},
};
export const defaultAirport = snapshots.EGPH;
export type AirportSelection = {airport?: string; airportDataVersion?: string; trainingStation?: string; radarEnvironment?: import("./model").RadarEnvironment};
export function getAirport(selection: AirportSelection = {}): Airport {
  const id = selection.airport ?? "EGPH";
  if (!Object.hasOwn(snapshots, id)) throw new Error("This airport is not available.");
  const airport = snapshots[id as AirportId];
  if (selection.airportDataVersion && selection.airportDataVersion !== airport.dataVersion)
    throw new Error("This airport data version is unavailable. Restore its pinned snapshot before opening this exercise.");
  return airport;
}
export const airportList = AIRPORT_IDS.map(id => snapshots[id]);
export const airportRunways = (airport: Airport) => airport.runways ?? [{...airport.runway, id: airport.runway.ends.map(e => e.id).join("/")}];
export const runwayEnds = (airport: Airport) => airportRunways(airport).flatMap(r => r.ends);
export const defaultRunway = (airport: Airport) => airport.runway.ends[1].id;
export const airportCallsign = (airport: Airport) => ({EGPH: "Edinburgh", EGLL: "Heathrow", KBHM: "Birmingham", CYUL: "Montreal", ROAH: "Naha", KDAL: "Dallas", SBBR: "Brasilia"})[airport.icao as AirportId];

export type ServiceType = Frequency | "local" | "approach" | "center";
export interface RadioStation {id: string; service: ServiceType; name: string; airport?: string; sector?: string; mhz?: string; available: boolean}
const labels = {local: "Ground & Tower", ground: "Ground", tower: "Tower", atis: "ATIS", approach: "Approach", center: "Center"};
/** IDs are independent of MHz and leave room for multiple regional sectors. */
export function airportStations(airport: Airport): RadioStation[] {
  return (["local", "ground", "tower", "atis", "approach", "center"] as const).map(service => ({
    id: `${airport.icao}:${service}`, service, airport: airport.icao, name: `${airportCallsign(airport)} ${labels[service]}`,
    available: true,
    mhz: airport.icao === "EGPH" ? ({ground: "121.75", tower: "118.70", atis: "131.35"} as Partial<Record<ServiceType, string>>)[service] : undefined,
  }));
}
export function trainingStation(selection: AirportSelection): RadioStation {
  const airport = getAirport(selection), id = selection.trainingStation ?? `${airport.icao}:ground`;
  const station = airportStations(airport).find(s => s.id === id && s.available && ["local", "ground", "tower", "approach", "center"].includes(s.service));
  if (!station) throw new Error("Choose Ground & Tower, Approach or Center for this airport.");
  return station;
}
export function frequenciesFor(airport: Airport): Record<Frequency, {label: string; value: string; name: string}> {
  return Object.fromEntries(airportStations(airport).filter(s => s.available && s.service !== "local").map(s => [s.service, {label: labels[s.service], value: s.mhz ?? "Training", name: s.name}])) as Record<Frequency, {label: string; value: string; name: string}>;
}
export const airportSelection = (airport: Airport, service: "local" | "ground" | "tower" | "approach" | "center" = "local") => ({airport: airport.icao as AirportId, airportDataVersion: airport.dataVersion!, trainingStation: `${airport.icao}:${service}`});
export const trainingMode = (selection: AirportSelection): "local" | "approach" | "center" => {const service = trainingStation(selection).service; return service === "approach" || service === "center" ? service : "local";};
export const openingFrequency = (selection: AirportSelection): Frequency => {const service = trainingStation(selection).service; return service === "local" ? "ground" : service as Frequency;};
export const controlledFrequencies = (selection: AirportSelection): Frequency[] => trainingMode(selection) === "local" ? ["ground", "tower", "atis"] : [trainingMode(selection) as Frequency, "atis"];
export const environmentLabel = (selection: AirportSelection) => `${selection.airport ?? "EGPH"} · ${labels[trainingMode(selection)]}`;
export const simulatedMetar = (airport: Airport) => `Simulated ${airport.icao} · Wind 240° at 10KT · Visibility 10km · QNH 1001`;

/** Shared by API parsing and the engine, including nested event instructions. */
export function runwayReferenceError(value: unknown, airport: Airport): string | undefined {
  const allowed = new Set(runwayEnds(airport).map(end => end.id));
  const visit = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return true;
    if (Array.isArray(value)) return value.every(visit);
    return Object.entries(value).every(([key, item]) => {
      if (["runway", "lastRunway", "departureRunway"].includes(key) && typeof item === "string") return allowed.has(item);
      if (["departures", "arrivals"].includes(key) && Array.isArray(item)) return item.every(id => allowed.has(id));
      return visit(item);
    });
  };
  return visit(value) ? undefined : "A runway reference is not in this airport snapshot.";
}
