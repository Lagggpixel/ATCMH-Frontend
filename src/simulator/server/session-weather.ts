import {getAirport} from "../airports";
import {engineFor} from "../engine";
import type {Exercise} from "../model";
import type {WeatherReport} from "./weather-provider";

export type SessionWeatherLoader = (airport: string, fresh?: boolean, weatherOnly?: boolean) => Promise<WeatherReport>;

/** Fetch outside session locks. A failed public source never prevents creation/reset. */
export async function requestSessionWeather(airport: string, load?: SessionWeatherLoader) {
  if (!load) return undefined;
  try {return await load(airport, true, true);} catch {return undefined;}
}

export function applySessionWeather(exercise: Exercise, report?: WeatherReport): Exercise {
  if (!report?.weather || report.airport !== getAirport(exercise).icao) return exercise;
  const next = structuredClone(exercise);
  next.weather = {...report.weather}; next.atis.weather = {...report.weather};
  delete next.atis.publicText; delete next.atis.publicSource; delete next.atis.observedAt;
  next.publishedAtis = engineFor(next).atisText(next.atis);
  next.publishedDraft = structuredClone(next.atis);
  return next;
}
