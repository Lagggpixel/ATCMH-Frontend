import {z} from "zod";
import {getAirport} from "../airports";
import {localPoint} from "../aviation";
import type {ScopeMapData, ScopeWinds, WindLevel} from "../scope-map-data";
import {SessionError} from "../sessions";
import {authorizeSessionRequest} from "./session-auth";
import {sessionFailure} from "./session-api";

const location = z.object({id: z.string().min(1).max(100), identifier: z.string().min(1).max(100), name: z.string().max(300).nullable(), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180)});
const mapSchema = z.object({icao: z.string().length(4), airports: z.array(location.extend({isTowered: z.boolean()})).max(150)});
async function readJson(url: URL, headers?: Record<string, string>) {
  const response = await fetch(url, {headers, signal: AbortSignal.timeout(15000), cache: "no-store", redirect: "error"});
  if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 3_000_000) throw new Error("Source unavailable");
  const text = await response.text(); if (text.length > 3_000_000) throw new Error("Source too large");
  return JSON.parse(text);
}
export async function fetchScopeMap(code: string): Promise<ScopeMapData> {
  const airport = getAirport({airport: code});
  const base = process.env.INFINITE_HORIZON_API_URL, key = process.env.INFINITE_HORIZON_API_KEY;
  if (!base || !key) throw new Error("Navigation source unavailable");
  const url = new URL(`/navigation/airports/${code}/map-overlay`, base);
  url.searchParams.set("radiusNm", "100"); url.searchParams.set("layers", "airports");
  const source = mapSchema.parse(await readJson(url, {"x-api-key": key}));
  if (source.icao !== code) throw new Error("Airport mismatch");
  return {airport: code,
    airports: source.airports.map(item => ({id: item.id, identifier: item.identifier, name: item.name, point: localPoint(airport, item.lat, item.lon), isTowered: item.isTowered})),
  };
}

const pressures = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150];
const series = z.array(z.number().finite().nullable()).min(1).max(48);
const forecastSchema = z.object({elevation: z.number().finite(), hourly_units: z.record(z.string()), hourly: z.object({time: z.array(z.number().finite()).min(1).max(48)}).catchall(series)});
/** Pressure heights are supplied by the model, never treated as fixed altitudes.
 * This display-only forecast does not replace the exercise's saved weather. */
export async function fetchScopeWinds(code: string): Promise<ScopeWinds> {
  const airport = getAirport({airport: code});
  const points = [-50, 0, 50].flatMap(y => [-50, 0, 50].map(x => ({x, y})));
  const coordinates = points.map(point => ({lat: airport.origin.lat + point.y / 60, lon: ((airport.origin.lon + point.x / (60 * Math.cos(airport.origin.lat * Math.PI / 180)) + 540) % 360) - 180}));
  const variables = ["wind_speed_10m", "wind_direction_10m", ...pressures.flatMap(pressure => [`wind_speed_${pressure}hPa`, `wind_direction_${pressure}hPa`, `geopotential_height_${pressure}hPa`])];
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({latitude: coordinates.map(point => point.lat.toFixed(5)).join(","), longitude: coordinates.map(point => point.lon.toFixed(5)).join(","),
    hourly: variables.join(","), forecast_hours: "2", timeformat: "unixtime", wind_speed_unit: "kn"}).toString();
  const forecasts = z.array(forecastSchema).length(points.length).parse(await readJson(url));
  let validAt = "";
  const windPoints = forecasts.map((forecast, index) => {
    const time = forecast.hourly.time.reduce((best, value, i, list) => Math.abs(value * 1000 - Date.now()) < Math.abs(list[best] * 1000 - Date.now()) ? i : best, 0);
    const stamp = new Date(forecast.hourly.time[time] * 1000).toISOString();
    if (validAt && validAt !== stamp) throw new Error("Inconsistent forecast times"); validAt = stamp;
    const wind = (suffix: string, altitude: number): WindLevel | undefined => {
      const speed = forecast.hourly[`wind_speed_${suffix}`]?.[time], direction = forecast.hourly[`wind_direction_${suffix}`]?.[time];
      if (forecast.hourly_units[`wind_speed_${suffix}`] !== "kn" || speed == null || direction == null || speed < 0 || speed > 500 || direction < 0 || direction > 360) return;
      return {altitude, speed, direction};
    };
    const surface = wind("10m", forecast.elevation * 3.28084); if (!surface) throw new Error("Missing surface wind");
    const levels = pressures.flatMap(pressure => {
      const height = forecast.hourly[`geopotential_height_${pressure}hPa`]?.[time];
      if (forecast.hourly_units[`geopotential_height_${pressure}hPa`] !== "m" || height == null) return [];
      const value = wind(`${pressure}hPa`, height * 3.28084); return value ? [value] : [];
    });
    if (levels.length < 2) throw new Error("Missing winds aloft");
    return {point: points[index], surface, levels};
  });
  return {airport: code, validAt, source: "https://open-meteo.com/", points: windPoints};
}

export function createScopeDataApi(loadMap = fetchScopeMap, loadWinds = fetchScopeWinds, authorize = authorizeSessionRequest) {
  const cache = new Map<string, {until: number; data: Promise<ScopeMapData | ScopeWinds>}>();
  return async (request: Request) => {
    try {
      await authorize(request, false);
      const query = new URL(request.url).searchParams, code = query.get("airport") ?? "", layer = query.get("layer");
      try {getAirport({airport: code});} catch {throw new SessionError("invalid-airport", "Choose an available training airport.", 400);}
      if (layer !== "map" && layer !== "winds") throw new SessionError("invalid-layer", "Choose a scope layer.", 400);
      const key = `${code}:${layer}`;
      let entry = cache.get(key);
      if (!entry || entry.until <= Date.now()) {
        const data = (layer === "map" ? loadMap(code) : loadWinds(code)).catch(error => {cache.delete(key); throw error;});
        entry = {until: Date.now() + 600_000, data}; cache.set(key, entry);
      }
      return Response.json(await entry.data, {headers: {"cache-control": "private, no-store"}});
    } catch (error) {
      if (error instanceof SessionError) return sessionFailure(error);
      return sessionFailure(new SessionError("scope-data-unavailable", "Scope layer data is temporarily unavailable. Try again shortly.", 503));
    }
  };
}
export const scopeDataApi = createScopeDataApi();
