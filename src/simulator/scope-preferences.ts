import {z} from "zod";
import {initialOptions, trafficFilters, type ScopeOptions} from "./scope-options";
import {windAltitudeChoices} from "./scope-map-data";
import type {MapCamera} from "./scope-camera";
import type {Frequency} from "./model";

// Bounds depend on the mounted scope's CSS height; clamp after restore there.
const cameraSchema = z.object({center: z.object({x: z.number().finite(), y: z.number().finite()}), scale: z.number().finite().positive()});
const optionsSchema = z.object({
  waypoints: z.boolean().catch(initialOptions.waypoints), navaids: z.boolean().catch(initialOptions.navaids),
  airspaces: z.boolean().catch(initialOptions.airspaces), taxiways: z.boolean().catch(initialOptions.taxiways),
  approaches: z.boolean().catch(initialOptions.approaches), uncontrolledAirports: z.boolean().catch(initialOptions.uncontrolledAirports),
  trails: z.boolean().catch(initialOptions.trails), frequencyTrails: z.boolean().catch(initialOptions.frequencyTrails),
  windsAloft: z.boolean().catch(initialOptions.windsAloft),
  terrain: z.boolean().catch(initialOptions.terrain),
  filter: z.string().refine(value => value === "none" || trafficFilters.some(([filter]) => filter === value)).catch("none"),
});
const preferencesSchema = z.object({
  options: optionsSchema.catch({...initialOptions}),
  camera: cameraSchema.optional().catch(undefined),
  windAltitude: z.number().refine(value => windAltitudeChoices.some(([altitude]) => altitude === value)).catch(-1),
  procedureOpacity: z.number().min(.1).max(1).catch(1),
});
export interface ScopePreferences {options: ScopeOptions; camera?: MapCamera; windAltitude: number; procedureOpacity: number}

/** Account and station identity, independent of exercise/session IDs and viewport size. */
export function scopePreferenceKey(accountId: string | undefined, airport: string, mode: "local" | "approach" | "center", frequency: Frequency | "all") {
  return accountId ? `sweatbox:scope:v1:${encodeURIComponent(accountId)}:${airport.toUpperCase()}:${mode}:${frequency}` : undefined;
}
export function readScopePreferences(key: string | undefined): ScopePreferences {
  const defaults = () => ({options: {...initialOptions}, windAltitude: -1, procedureOpacity: 1});
  if (!key) return defaults();
  try {
    const result = preferencesSchema.safeParse(JSON.parse(window.localStorage.getItem(key) ?? "null"));
    return result.success ? result.data : defaults();
  } catch {return defaults();}
}

/** Small switches save immediately; coalesce animation frames and flush before mobile suspension. */
export function scopePreferenceWriter(key: string | undefined) {
  let pending: ScopePreferences | undefined, timer: ReturnType<typeof setTimeout> | undefined, saved: string | undefined;
  const flush = () => {
    clearTimeout(timer); timer = undefined;
    if (!key || !pending) return;
    try {
      const value = JSON.stringify(preferencesSchema.parse(pending));
      if (value !== saved) {window.localStorage.setItem(key, value); saved = value;}
    } catch { /* The scope remains usable if storage is full or blocked. */ }
  };
  return {
    flush,
    update(value: ScopePreferences) {
      const immediate = !pending || pending.options !== value.options || pending.windAltitude !== value.windAltitude || pending.procedureOpacity !== value.procedureOpacity;
      pending = value; clearTimeout(timer);
      if (immediate) flush();
      else if (key) timer = setTimeout(flush, 150);
    },
  };
}
