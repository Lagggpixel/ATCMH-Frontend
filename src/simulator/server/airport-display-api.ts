import {z} from "zod";
import {getAirport, airportRunways} from "../airports";
import {facilities, localPoint} from "../aviation";
import type {AirportInformation, AirportProcedures, AirportWeather, AirportDisplayData} from "../airport-display";
import {fetchNavigationData} from "./navigation-api";
import {fetchWeatherReport} from "./weather-provider";
import {SessionError} from "../sessions";
import {authorizeSessionRequest} from "./session-auth";
import {sessionFailure} from "./session-api";

const coordinate = z.object({lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180)});
const mapSchema = z.object({icao: z.string(), center: coordinate, airports: z.array(coordinate.extend({identifier: z.string(), name: z.string().nullable(), altitudeM: z.number().finite().nullable(), isTowered: z.boolean()})).max(150)});
const threshold = coordinate.extend({designator: z.string().min(1).max(10), headingDegrees: z.number().finite().nullable(), ils: z.object({glideSlopeDegrees: z.number().finite().nullable()}).nullable()});
const runwaySchema = z.object({icao: z.string(), runways: z.array(z.object({widthM: z.number().finite().nonnegative().nullable(), start: threshold, end: threshold})).max(100)});
async function readJson(url: URL, headers?: Record<string, string>) {
  const response = await fetch(url, {headers: {"user-agent": "ATCMH-Sweatbox/1.0 (airport display)", ...headers}, signal: AbortSignal.timeout(12000), cache: "no-store", redirect: "error"});
  if (response.status === 204) return [];
  if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 3_000_000) throw new Error("Airport source unavailable");
  const body = await response.text(); if (body.length > 3_000_000) throw new Error("Airport source too large");
  return JSON.parse(body);
}
async function navigationJson(code: string, suffix: string) {
  const base = process.env.INFINITE_HORIZON_API_URL, key = process.env.INFINITE_HORIZON_API_KEY;
  if (!base || !key) throw new Error("Airport source unavailable");
  return readJson(new URL(`/navigation/airports/${code}/${suffix}`, base), {"x-api-key": key});
}
export async function fetchAirportInformation(code: string): Promise<AirportInformation> {
  let pinned; try {pinned = getAirport({airport: code});} catch { /* Nearby airports need not support training sessions. */ }
  const [map, runways] = await Promise.allSettled([
    navigationJson(code, "map-overlay?radiusNm=5&layers=airports").then(value => mapSchema.parse(value)),
    navigationJson(code, "runways").then(value => runwaySchema.parse(value)),
  ]);
  const reference = map.status === "fulfilled" && map.value.icao === code ? map.value : undefined;
  const field = reference?.airports.find(item => item.identifier === code);
  const result: AirportInformation = {airport: code, name: field?.name ?? pinned?.name ?? code,
    elevationFeet: field?.altitudeM != null ? field.altitudeM * 3.28084 : pinned?.elevation,
    location: reference?.center ?? pinned?.origin, isTowered: field?.isTowered,
    frequencies: facilities.filter(item => item.airport === code).map(({id, name, type, mhz}) => ({id, name, type, mhz})), runways: [], warnings: []};
  if (runways.status === "fulfilled" && runways.value.icao === code) {
    for (const runway of runways.value.runways) {
      const a = runway.start, b = runway.end, radians = Math.PI / 180;
      const h = Math.sin((b.lat - a.lat) * radians / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((b.lon - a.lon) * radians / 2) ** 2;
      const lengthFeet = 2 * 3440.065 * Math.asin(Math.sqrt(Math.min(1, h))) * 6076.12;
      for (const end of [a, b]) if (end.headingDegrees !== null) result.runways.push({id: end.designator, heading: end.headingDegrees, lengthFeet,
        ...(runway.widthM !== null ? {widthFeet: runway.widthM * 3.28084} : {}),
        ...(end.ils ? {ils: {...(end.ils.glideSlopeDegrees !== null ? {glideAngle: end.ils.glideSlopeDegrees} : {})}} : {})});
    }
  } else if (pinned) {
    result.runways = airportRunways(pinned).flatMap(runway => runway.ends.map(end => ({id: end.id, heading: end.heading, lengthFeet: runway.lengthFeet, widthFeet: runway.widthFeet})));
    result.warnings.push("Published runway details unavailable. Showing the pinned training runway snapshot.");
  } else result.warnings.push("Runway details are unavailable.");
  if (!reference) result.warnings.push("Airport reference data is temporarily unavailable.");
  return result;
}
export async function fetchAirportWeather(code: string): Promise<AirportWeather> {
  const [report, forecast] = await Promise.allSettled([fetchWeatherReport(code),
    readJson(new URL(`https://aviationweather.gov/api/data/taf?ids=${code}&format=json`)).then(value => z.array(z.object({icaoId: z.string(), rawTAF: z.string().max(20000)})).max(100).parse(value))]);
  return {airport: code, fetchedAt: new Date().toISOString(), weather: report.status === "fulfilled" ? report.value.weather : undefined,
    taf: forecast.status === "fulfilled" ? forecast.value.find(item => item.icaoId === code)?.rawTAF : undefined,
    atis: report.status === "fulfilled" ? report.value.atis.map(({type, datis, updatedAt}) => ({type, datis, updatedAt})) : [],
    warnings: report.status === "rejected" ? ["Public weather is temporarily unavailable."] : []};
}
export async function fetchAirportProcedures(code: string, origin: string): Promise<AirportProcedures> {
  const airport = getAirport({airport: origin}), source = await fetchNavigationData(code);
  return {airport: code, origin, revision: source.revision, procedures: source.procedures.map((procedure, index) => ({
    id: procedure.id, airport: code, name: procedure.identifier, type: procedure.type, index,
    routes: procedure.routes.map(route => ({id: route.id, name: route.transition ?? "Common route", points: route.points.map(point => {
      const projected = localPoint(airport, point.lat, point.lon);
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || Math.abs(projected.x) > 2000 || Math.abs(projected.y) > 2000)
        throw new SessionError("invalid-navigation", "This procedure is outside the supported display area.", 422);
      return {...projected, name: point.identifier};
    })})),
  }))};
}
export function createAirportDisplayApi(loadInfo = fetchAirportInformation, loadWeather = fetchAirportWeather, loadProcedures = fetchAirportProcedures, authorize = authorizeSessionRequest) {
  const cache = new Map<string, {until: number; data: Promise<AirportDisplayData>}>();
  return async (request: Request) => {
    try {
      await authorize(request, false);
      const query = new URL(request.url).searchParams, code = query.get("airport") ?? "", layer = query.get("layer"), origin = query.get("origin") ?? code;
      if (!/^[A-Z0-9]{4}$/.test(code)) throw new SessionError("invalid-airport", "Choose a four-character airport identifier.", 400);
      if (layer !== "info" && layer !== "weather" && layer !== "procedures") throw new SessionError("invalid-layer", "Choose airport information, weather or procedures.", 400);
      if (layer === "procedures") {try {getAirport({airport: origin});} catch {throw new SessionError("invalid-origin", "Choose an available training origin.", 400);}}
      const key = `${code}:${layer}:${layer === "procedures" ? origin : ""}`;
      if (query.get("refresh") === "1") cache.delete(key);
      let entry = cache.get(key);
      if (!entry || entry.until <= Date.now()) {
        const data = (layer === "info" ? loadInfo(code) : layer === "weather" ? loadWeather(code) : loadProcedures(code, origin)).catch(error => {cache.delete(key); throw error;});
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        entry = {until: Date.now() + 300_000, data}; cache.set(key, entry);
      }
      return Response.json(await entry.data, {headers: {"cache-control": "private, no-store"}});
    } catch (error) {
      return sessionFailure(error instanceof SessionError ? error : new SessionError("airport-data-unavailable", "Airport data is temporarily unavailable. Try again shortly.", 503));
    }
  };
}
export const airportDisplayApi = createAirportDisplayApi();
