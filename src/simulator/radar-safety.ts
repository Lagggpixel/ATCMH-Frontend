import type {Aircraft, Instruction, RadarEnvironment} from "./model";
import {aircraftSpeedLimits, machKnots} from "./radar-speed";

/** Automatic pilot decisions only; manual mentor assignment remains available. */
export function automaticRadarUnable(a: Aircraft, c: Instruction): string | null {
  if (!a.radar) return null;
  if (a.radar.cleared && (c.type === "heading" || c.type === "speed" || c.type === "vector" && (c.heading !== undefined || !!c.altitude) || c.type === "radar-speed" && c.mode !== "approach")) return "Already cleared for approach.";
  if (c.type === "missed-approach" && !a.radar.cleared) return "Not cleared for approach.";
  const limits = aircraftSpeedLimits(a.type);
  if (!limits) return null;
  if (c.type === "speed") return c.value < limits.min || c.value > limits.max ? "Speed outside aircraft limits." : null;
  if (c.type !== "radar-speed" || c.value === undefined) return null;
  const value = c.unit === "mach" ? machKnots(c.value, a.altitude) : c.value;
  const tooLow = value < limits.min && c.relation !== "minimum";
  const tooHigh = (c.unit === "mach" ? limits.mach === undefined || c.value > limits.mach : value > limits.max) && c.relation !== "maximum";
  return tooLow || tooHigh ? "Speed outside aircraft limits." : null;
}
export function radarApproachExempt(a: Aircraft, environment?: RadarEnvironment) {
  const r = a.radar;
  if (!r) return false;
  if (r.guidance === "vectors" && r.transferred && a.frequency === "tower") return true;
  const approach = environment?.approaches.find(p => p.id === r.cleared);
  return r.navigation === "approach" && !!approach && (approach.type !== "ils" || !!(r.localizer ?? r.captured));
}
export interface SeparationAlert {otherId: string; lateral: number; vertical: number}
export function radarSeparationAlerts(aircraft: Aircraft[], environment?: RadarEnvironment) {
  const alerts = new Map<string, SeparationAlert[]>();
  const airborne = aircraft.filter(a => a.radar && a.active && !["parked", "pushback", "taxi", "lineup", "rollout"].includes(a.mode));
  for (let i = 0; i < airborne.length; i++) for (let j = i + 1; j < airborne.length; j++) {
    const a = airborne[i], b = airborne[j], lateral = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y), vertical = Math.abs(a.altitude - b.altitude);
    if (lateral >= 3 || vertical >= 1000 || radarApproachExempt(a, environment) && radarApproachExempt(b, environment)) continue;
    for (const [one, other] of [[a, b], [b, a]]) alerts.set(one.id, [...(alerts.get(one.id) ?? []), {otherId: other.id, lateral, vertical}]);
  }
  return alerts;
}
export const separationLabel = (alert: SeparationAlert) => `${Number(alert.lateral.toFixed(1))}nm ${Math.round(alert.vertical)}ft`;
export function terrainClearance(a: Aircraft, elevation: number | undefined, environment?: RadarEnvironment) {
  return a.active && a.radar && elevation !== undefined && Number.isFinite(elevation) && !radarApproachExempt(a, environment) && a.altitude - elevation < 1000 ? a.altitude - elevation : undefined;
}
