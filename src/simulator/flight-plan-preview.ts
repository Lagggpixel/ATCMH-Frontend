"use client";
import {useSyncExternalStore} from "react";
import type {Point, RoutePoint} from "./model";

/** What the flight plan editor wants drawn on this browser's scope: fixes about to be added, or the procedure under the pointer. */
export interface FlightPlanPreview {adding?: {aircraftId: string; from: Point; points: RoutePoint[]}; highlight?: {aircraftId: string; points: RoutePoint[]}}

let preview: FlightPlanPreview = {}, serialized = "{}";
const listeners = new Set<() => void>();

export function setFlightPlanPreview<K extends keyof FlightPlanPreview>(part: K, value: FlightPlanPreview[K] | null) {
  const next = {...preview};
  if (value) next[part] = value; else delete next[part];
  // Live editors re-render on every simulation tick; only notify the scope when the drawing changes.
  const text = JSON.stringify(next);
  if (text === serialized) return;
  preview = next; serialized = text;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};};
const empty: FlightPlanPreview = {};
export function useFlightPlanPreview(): FlightPlanPreview {
  return useSyncExternalStore(subscribe, () => preview, () => empty);
}
