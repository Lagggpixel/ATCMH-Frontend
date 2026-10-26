import type {Aircraft, Frequency} from "./model";

export interface ScopeOptions {
  waypoints: boolean; navaids: boolean; airspaces: boolean; taxiways: boolean;
  approaches: boolean; uncontrolledAirports: boolean; trails: boolean;
  frequencyTrails: boolean; windsAloft: boolean; filter: string;
  /** Staff radar only: Airbus ND-style terrain dots (TERR). */
  terrain: boolean;
}
export const initialOptions: ScopeOptions = {
  waypoints: false, navaids: false, airspaces: true, taxiways: true, approaches: true,
  uncontrolledAirports: true, trails: true, frequencyTrails: true, windsAloft: false, filter: "none", terrain: false,
};
export const scopeOptionRows = [
  ["waypoints", "Fixes"], ["navaids", "Navaids"], ["airspaces", "Airspaces"],
  ["taxiways", "Taxiways"], ["approaches", "Approaches"],
  ["uncontrolledAirports", "Uncontrolled Airports"], ["trails", "Aircraft Trails"],
  ["frequencyTrails", "Only Trails On Frequency"],
] as const;
export const trafficFilters = [
  ["10000", "Hide Traffic > 10K"], ["15000", "Hide Traffic > 15K"],
  ["20000", "Hide Traffic > 20K"], ["25000", "Hide Traffic > 25K"],
  ["30000", "Hide Traffic > 30K"], ["below15", "Hide Traffic < 15K"],
] as const;
export const toggleTrafficFilter = (current: string, next: string) => current === next ? "none" : next;

/** IF altitude filters never hide aircraft tuned to this controller. Staff have
 * no single tuned frequency, so their all-frequency view retains the band. */
export function trafficVisible(a: Pick<Aircraft, "altitude" | "frequency">, filter: string, frequency: Frequency | "all" = "all") {
  if (filter === "none" || frequency !== "all" && a.frequency === frequency) return true;
  return filter === "below15" ? a.altitude >= 15000 : a.altitude <= Number(filter);
}
