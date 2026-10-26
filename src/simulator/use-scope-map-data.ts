"use client";
import {useEffect, useState} from "react";
import type {ScopeMapData, ScopeTerrain, ScopeWinds} from "./scope-map-data";

const cache = new Map<string, {until: number; data: Promise<ScopeMapData | ScopeWinds | ScopeTerrain>}>();
export function useScopeMapData<T extends ScopeMapData | ScopeWinds | ScopeTerrain>(airport: string, layer: "map" | "winds" | "terrain", enabled: boolean) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{key: string; data?: T; error?: string}>();
  const key = `${airport}:${layer}`;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let entry = cache.get(key);
    if (!entry || entry.until <= Date.now()) {
      const data = (async () => {
        try {
          const response = await fetch(`/api/simulator/scope-data?${new URLSearchParams({airport, layer})}`, {credentials: "same-origin"});
          const value = await response.json();
          if (!response.ok) throw new Error(value.error?.message ?? value.error ?? "Scope data is unavailable.");
          if (value.airport !== airport) throw new Error("Scope data does not match this airport.");
          return value as T;
        } catch (error) {cache.delete(key); throw error;}
      })();
      entry = {until: Date.now() + 600_000, data}; cache.set(key, entry);
    }
    entry.data.then(data => {if (active) setResult({key, data: data as T});}, error => {if (active) setResult({key, error: error instanceof Error ? error.message : "Scope data is unavailable."});});
    return () => {active = false;};
  }, [airport, key, layer, enabled, retry]);
  return {data: result?.key === key ? result.data : undefined, error: result?.key === key ? result.error : undefined,
    retry: () => {cache.delete(key); setResult(undefined); setRetry(value => value + 1);}};
}
