import aviationData from "./data/aviation.json";
import kbhmLegacy from "./data/kbhm-before-runway-repair.json";
import sbbrLegacy from "./data/sbbr-before-runway-repair.json";
import rjttLegacy from "./data/rjtt-before-runway-repair.json";
import cyycLegacy from "./data/cyyc-before-axis-repair.json";
import klasLegacy from "./data/klas-before-axis-repair.json";
import lgavLegacy from "./data/lgav-before-axis-repair.json";
import nzaaLegacy from "./data/nzaa-before-axis-repair.json";
import roahLegacy from "./data/roah-before-axis-repair.json";
import scelLegacy from "./data/scel-before-axis-repair.json";
import {AIRPORT_RADIO_NAMES} from "./radio-identifiers";
import kase from "./data/kase.json";
import vnlk from "./data/vnlk.json";
import egph from "./data/egph.json";
import egll from "./data/egll.json";
import kbhm from "./data/kbhm.json";
import cyul from "./data/cyul.json";
import roah from "./data/roah.json";
import kdal from "./data/kdal.json";
import sbbr from "./data/sbbr.json";
import lfmn from "./data/lfmn.json";
import kont from "./data/kont.json";
import klas from "./data/klas.json";
import lgav from "./data/lgav.json";
import phog from "./data/phog.json";
import nzaa from "./data/nzaa.json";
import lbsf from "./data/lbsf.json";
import kjfk from "./data/kjfk.json";
import kbos from "./data/kbos.json";
import scel from "./data/scel.json";
import ebbr from "./data/ebbr.json";
import eddl from "./data/eddl.json";
import cyyc from "./data/cyyc.json";
import lime from "./data/lime.json";
import kslc from "./data/kslc.json";
import ksan from "./data/ksan.json";
import egss from "./data/egss.json";
import tncm from "./data/tncm.json";
import oakb from "./data/oakb.json";
import lqsa from "./data/lqsa.json";
import edds from "./data/edds.json";
import ltfm from "./data/ltfm.json";
import eidw from "./data/eidw.json";
import eidwLegacy from "./data/eidw-2026-10-17.json";
import rjtt from "./data/rjtt.json";
import {EXERCISE_WEATHER, type Aircraft, type Airport, type Frequency} from "./model";

export const AIRPORT_IDS = ["EGPH", "EGLL", "KBHM", "CYUL", "ROAH", "KDAL", "SBBR", "LFMN", "KONT", "KLAS", "LGAV", "PHOG", "NZAA", "LBSF", "KJFK", "KBOS", "SCEL", "EBBR", "EDDL", "CYYC", "LIME", "KSLC", "KSAN", "EGSS", "TNCM", "OAKB", "LQSA", "EDDS", "LTFM", "EIDW", "RJTT", "KASE", "VNLK"] as const;
export type AirportId = typeof AIRPORT_IDS[number];
export const airportData = {EGPH: egph, EGLL: egll, KBHM: kbhm, CYUL: cyul, ROAH: roah, KDAL: kdal, SBBR: sbbr, LFMN: lfmn, KONT: kont, KLAS: klas, LGAV: lgav, PHOG: phog, NZAA: nzaa, LBSF: lbsf, KJFK: kjfk, KBOS: kbos, SCEL: scel, EBBR: ebbr, EDDL: eddl, CYYC: cyyc, LIME: lime, KSLC: kslc, KSAN: ksan, EGSS: egss, TNCM: tncm, OAKB: oakb, LQSA: lqsa, EDDS: edds, LTFM: ltfm, EIDW: eidw, RJTT: rjtt, KASE: kase, VNLK: vnlk};
const snapshots: Record<AirportId, Airport> = {
  EGPH: {...egph, dataVersion: egph.sourceDate, runways: [{...egph.runway, id: "06/24"}]},
  EGLL: {...egll, runway: egll.runways[0]}, KBHM: {...kbhm, runway: kbhm.runways[0]},
  CYUL: {...cyul, runway: cyul.runways[0]}, ROAH: {...roah, runway: roah.runways[0]},
  KDAL: {...kdal, runway: kdal.runways[0]}, SBBR: {...sbbr, runway: sbbr.runways[0]},
  LFMN: {...lfmn, runway: lfmn.runways[0]}, KONT: {...kont, runway: kont.runways[0]},
  KLAS: {...klas, runway: klas.runways[0]}, LGAV: {...lgav, runway: lgav.runways[0]},
  PHOG: {...phog, runway: phog.runways[0]}, NZAA: {...nzaa, runway: nzaa.runways[0]},
  LBSF: {...lbsf, runway: lbsf.runways[0]},
  KBOS: {...kbos, runway: kbos.runways[0]},
  SCEL: {...scel, runway: scel.runways[0]},
  EBBR: {...ebbr, runway: ebbr.runways[0]},
  EDDL: {...eddl, runway: eddl.runways[0]},
  CYYC: {...cyyc, runway: cyyc.runways[0]},
  LIME: {...lime, runway: lime.runways[0]},
  KSLC: {...kslc, runway: kslc.runways[0]},
  KSAN: {...ksan, runway: ksan.runways[0]},
  EGSS: {...egss, runway: egss.runways[0]},
  TNCM: {...tncm, runway: tncm.runways[0]},
  OAKB: {...oakb, runway: oakb.runways[0]},
  LQSA: {...lqsa, runway: lqsa.runways[0]},
  EDDS: {...edds, runway: edds.runways[0]},

  KJFK: {...kjfk, runway: kjfk.runways[0]},
  LTFM: {...ltfm, runway: ltfm.runways[0]},
  EIDW: {...eidw, runway: eidw.runways[0]},
  RJTT: {...rjtt, runway: rjtt.runways[0]},
  KASE: {...kase, runway: kase.runways[0]},
  VNLK: {...vnlk, runway: vnlk.runways[0]},
};
export const defaultAirport = snapshots.EGPH;
// Keep saved exercises on the geometry against which their positions were captured.
const legacyDublin: Airport = {...eidwLegacy, runway: eidwLegacy.runways[0]};
const legacyRunways: Partial<Record<AirportId, Airport>> = Object.fromEntries(
  [kbhmLegacy, sbbrLegacy, rjttLegacy, cyycLegacy, klasLegacy, lgavLegacy, nzaaLegacy, roahLegacy, scelLegacy]
    .map(airport => [airport.icao, {...airport, runway: airport.runways[0]}]));
export type AirportSelection = {traffic?: readonly Pick<Aircraft,"destination">[];airport?: string; airportDataVersion?: string; trainingStation?: string; weather?: import("./model").ExerciseWeather; radarEnvironment?: import("./model").RadarEnvironment};
export function getAirport(selection: AirportSelection = {}): Airport {
  const id = selection.airport ?? "EGPH";
  if (!Object.hasOwn(snapshots, id)) throw new Error("This airport is not available.");
  const legacy = id === "EIDW" ? legacyDublin : legacyRunways[id as AirportId];
  const airport = legacy && selection.airportDataVersion === legacy.dataVersion ? legacy : snapshots[id as AirportId];
  if (selection.airportDataVersion && selection.airportDataVersion !== airport.dataVersion)
    throw new Error("This airport data version is unavailable. Restore its pinned snapshot before opening this exercise.");
  return airport;
}
export const airportList = AIRPORT_IDS.map(id => snapshots[id]);
export const airportRunways = (airport: Airport) => airport.runways ?? [{...airport.runway, id: airport.runway.ends.map(e => e.id).join("/")}];
export const runwayEnds = (airport: Airport) => airportRunways(airport).flatMap(r => r.ends);
export const defaultRunway = (airport: Airport) => airport.icao === "KASE" ? "15" : airport.icao === "VNLK" ? "06" : airport.runway.ends[1].id;
export const airportCallsign = (airport: Airport) => AIRPORT_RADIO_NAMES[airport.icao];

export type ServiceType = Frequency | "local" | "approach" | "center";
export interface RadioStation {id: string; service: ServiceType; name: string; airport?: string; sector?: string; mhz?: string; available: boolean}
const labels = {departure: "Departure", unicom: "Unicom",local: "Ground & Tower", ground: "Ground", tower: "Tower", atis: "ATIS", approach: "Approach", center: "Center"};
const primaryChannels = new Map<string, string>();
for (const row of aviationData.rows as {kind: string; airport?: string | null; type?: string; mhz?: number | string}[]) {
  if (row.kind !== "frequency" || !row.airport || !row.type || !row.mhz) continue;
  const key = `${row.airport}:${row.type}`;
  if (!primaryChannels.has(key)) primaryChannels.set(key, Number(row.mhz).toFixed(2));
}

/** IDs are independent of MHz and leave room for multiple regional sectors. */
export function airportStations(airport: Airport): RadioStation[] {
  return (["local", "ground", "tower", "atis", "approach", "center"] as const).map(service => ({
    id: `${airport.icao}:${service}`, service, airport: airport.icao, name: `${airportCallsign(airport)} ${labels[service]}`,
    available: true,
    mhz: primaryChannels.get(`${airport.icao}:${labels[service]}`) ?? (airport.icao === "EGPH" ? ({ground: "121.75", tower: "118.70", atis: "131.35"} as Partial<Record<ServiceType, string>>)[service] : undefined),
  }));
}
export function trainingStation(selection: AirportSelection): RadioStation {
  const airport = getAirport(selection), id = selection.trainingStation ?? `${airport.icao}:ground`;
  const station = airportStations(airport).find(s => s.id === id && s.available && ["local", "ground", "tower", "approach", "center"].includes(s.service));
  if (!station) throw new Error("Choose Ground & Tower, Approach or Center for this airport.");
  return station;
}
export function frequenciesFor(airport: Airport): Record<Frequency, {label: string; value: string; name: string}> {
  return {...{departure: {label: "Departure", value: "Training", name: `${airportCallsign(airport)} Departure`}, unicom: {label: "Unicom", value: "122.80", name: `${airportCallsign(airport)} Unicom`}}, ...Object.fromEntries(airportStations(airport).filter(s => s.available && s.service !== "local").map(s => [s.service, {label: labels[s.service], value: s.mhz ?? "Training", name: s.name}]))} as Record<Frequency, {label: string; value: string; name: string}>;
}
export const airportSelection = (airport: Airport, service: "local" | "ground" | "tower" | "approach" | "center" = "local") => ({airport: airport.icao as AirportId, airportDataVersion: airport.dataVersion!, trainingStation: `${airport.icao}:${service}`});
export const trainingMode = (selection: AirportSelection): "local" | "approach" | "center" => {const service = trainingStation(selection).service; return service === "approach" || service === "center" ? service : "local";};
export const openingFrequency = (selection: AirportSelection): Frequency => {const service = trainingStation(selection).service; return service === "local" ? "ground" : service as Frequency;};
export const controlledFrequencies = (selection: AirportSelection & {aircraft?: readonly Aircraft[]}): Frequency[] => {
  const mode = trainingMode(selection);
  return mode === "local" ? ["ground", "tower", "atis"] : [mode, ...(mode === "center" && selection.aircraft?.some(a => a.active && a.radar?.returningToApproach) ? ["approach" as const] : []), "atis"];
};
export const environmentLabel = (selection: AirportSelection) => `${selection.airport ?? "EGPH"} · ${labels[trainingMode(selection)]}`;
export const simulatedMetar = (airport: Airport, weather: import("./model").ExerciseWeather = EXERCISE_WEATHER) => weather.rawMetar ?? `Simulated ${airport.icao} · Wind ${weather.variableWind ? "VRB" : `${weather.windDirection}°`} at ${weather.windSpeed}${weather.windGust ? ` gusting ${weather.windGust}` : ""}KT · Visibility ${weather.visibilityKm}km · QNH ${weather.qnh}`;

/** Shared by API parsing and the engine, including nested event instructions. */
export function runwayReferenceError(value: unknown, airport: Airport): string | undefined {
  const allowed = new Set(runwayEnds(airport).map(end => end.id));
  const visit = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return true;
    if (Array.isArray(value)) return value.every(visit);
    return Object.entries(value).every(([key, item]) => {
      if(key==="runway" && typeof (value as {airportIcao?:string}).airportIcao === "string" && (value as {airportIcao?:string}).airportIcao!==airport.icao)return true;
      if (["runway", "lastRunway", "departureRunway"].includes(key) && typeof item === "string") return allowed.has(item);
      if (["departures", "arrivals"].includes(key) && Array.isArray(item)) return item.every(id => allowed.has(id));
      return visit(item);
    });
  };
  return visit(value) ? undefined : "A runway reference is not in this airport snapshot.";
}
