import {LETTERS} from "../catalog";
import {getAirport} from "../airports";
import {engineFor} from "../engine";
import type {Exercise} from "../model";
import type {WeatherReport} from "./weather-provider";

export type SessionWeatherLoader = (airport: string, fresh?: boolean) => Promise<WeatherReport>;

/** Fetch outside session locks. A failed public source never prevents creation/reset. */
export async function requestSessionWeather(airport: string, load?: SessionWeatherLoader) {
  if (!load) return undefined;
  try {return await load(airport, true);} catch {return undefined;}
}

export function applySessionWeather(exercise: Exercise, report?: WeatherReport): Exercise {
  if (!report || report.airport !== getAirport(exercise).icao || (!report.weather && !report.atis.length)) return exercise;
  const next = structuredClone(exercise);
  if (report.weather) {next.weather = {...report.weather}; next.atis.weather = {...report.weather};}
  const broadcast = report.atis.find(a => /combined/i.test(a.type)) ?? report.atis.find(a => /dep/i.test(a.type)) ?? report.atis[0];
  if (broadcast) {
    next.atis.publicText = broadcast.datis;
    next.atis.publicSource = `https://atis.info/api/${report.airport}`;
    next.atis.observedAt = broadcast.updatedAt;
    const code = broadcast.code.toUpperCase();
    if (/^[A-Z]$/.test(code)) next.atis.letter = LETTERS[code.charCodeAt(0) - 65];
  } else {
    delete next.atis.publicText; delete next.atis.publicSource; delete next.atis.observedAt;
  }
  next.publishedAtis = engineFor(next).atisText(next.atis);
  next.publishedDraft = structuredClone(next.atis);
  return next;
}
