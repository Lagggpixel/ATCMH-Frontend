"use client";
import {useEffect, useState} from "react";
import type {NavigationCatalog} from "./navigation-data";

// Scope and aircraft picker share one airport catalogue, never a scenario's manual fixes.
const cache = new Map<string, {until: number; data: Promise<NavigationCatalog>}>();
const listeners = new Map<string, Set<() => void>>();
export function loadNavigationCatalog(airport: string): Promise<NavigationCatalog> {
  const existing = cache.get(airport);
  if (existing && existing.until > Date.now()) return existing.data;
  const data = (async () => {
    try {
      const response = await fetch(`/api/simulator/navigation?${new URLSearchParams({airport})}`, {credentials: "same-origin"});
      const value = await response.json();
      if (!response.ok) throw new Error(value.error?.message ?? value.error ?? "Navigation data is unavailable.");
      if (value.airport !== airport) throw new Error("Navigation data does not match this airport.");
      return value as NavigationCatalog;
    } catch (error) {cache.delete(airport); throw error;}
  })();
  cache.set(airport, {until: Date.now() + 300_000, data});
  return data;
}

export function useNavigationCatalog(airport?: string) {
  const [result, setResult] = useState<{airport: string; catalog?: NavigationCatalog; error?: string}>();
  useEffect(() => {
    if (!airport) return;
    let active = true, generation = 0;
    const load = () => {
      const request = ++generation;
      loadNavigationCatalog(airport).then(catalog => {if (active && request === generation) setResult({airport, catalog});},
        reason => {if (active && request === generation) setResult({airport, error: reason instanceof Error ? reason.message : "Navigation data is unavailable."});});
    };
    const refresh = () => {setResult(undefined); load();};
    const subscribers = listeners.get(airport) ?? new Set<() => void>();
    listeners.set(airport, subscribers); subscribers.add(refresh); load();
    return () => {active = false; subscribers.delete(refresh); if (!subscribers.size) listeners.delete(airport);};
  }, [airport]);
  const current = result?.airport === airport ? result : undefined;
  return {catalog: current?.catalog, error: current?.error, retry: () => {
    if (airport) {cache.delete(airport); listeners.get(airport)?.forEach(refresh => refresh());}
  }};
}
