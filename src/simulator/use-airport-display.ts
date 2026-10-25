"use client";
import {useEffect, useState} from "react";
import type {AirportDisplayData} from "./airport-display";
import {canLoadAirportProcedures} from "./airport-display";

const cache = new Map<string, {until: number; data: Promise<AirportDisplayData>}>();
export function useAirportDisplay<T extends AirportDisplayData>(airport: string | undefined, layer: "info" | "weather" | "procedures", origin?: string) {
  const [attempt, setAttempt] = useState(0), [result, setResult] = useState<{key: string; data?: T; error?: string}>();
  const key = `${airport}:${layer}:${origin ?? ""}`;
  useEffect(() => {
    if (!airport || layer === "procedures" && !canLoadAirportProcedures(airport, origin)) return;
    let active = true;
    let entry = cache.get(key);
    if (!entry || entry.until <= Date.now()) {
      const data = (async () => {
        try {
          const query = new URLSearchParams({airport, layer, ...(origin ? {origin} : {}), ...(attempt ? {refresh: "1"} : {})});
          const response = await fetch(`/api/simulator/airport-display?${query}`, {credentials: "same-origin"});
          const value = await response.json();
          if (!response.ok) throw new Error(value.error?.message ?? value.error ?? "Airport data unavailable.");
          if (value.airport !== airport || layer === "procedures" && value.origin !== origin) throw new Error("Airport data does not match this view.");
          return value as T;
        } catch (error) {cache.delete(key); throw error;}
      })();
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      entry = {until: Date.now() + 300_000, data}; cache.set(key, entry);
    }
    entry.data.then(data => {if (active) setResult({key, data: data as T});}, error => {if (active) setResult({key, error: error instanceof Error ? error.message : "Airport data unavailable."});});
    return () => {active = false;};
  }, [airport, layer, origin, key, attempt]);
  return {data: result?.key === key ? result.data : undefined, error: result?.key === key ? result.error : undefined,
    retry: () => {cache.delete(key); setResult(undefined); setAttempt(value => value + 1);}};
}
