import {radarArrivalFrequency} from "./model";
import {performanceFor} from "./aircraft-performance";
import type {Aircraft, Airport, Frequency, Instruction, RadarEnvironment} from "./model";
import {aircraftSpeedLimits, machKnots} from "./radar-speed";

/** Automatic pilot decisions only; manual mentor assignment remains available. */
export function automaticRadarUnable(a: Aircraft, c: Instruction): string | null {
  const profile=performanceFor(a);
  if(profile && (c.type==="vector" || c.type==="route" || c.type==="missed-approach") && c.altitude && (c.altitude.unit==="feet"?c.altitude.value:c.altitude.value*100)>profile.ceiling)return "Altitude exceeds aircraft ceiling.";
  if (!a.radar && !profile) return null;
  if (a.radar && c.type === "missed-approach" && !a.radar.cleared && a.radar.navigation !== "missed" && !a.radar.missedApproach) return "Not cleared for approach.";
  const limits = performanceFor(a) ?? aircraftSpeedLimits(a.type);
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
  if (r.guidance === "vectors" && r.transferred && radarArrivalFrequency(a.frequency)) return true;
  const approach = environment?.approaches.find(p => p.id === r.cleared);
  return r.navigation === "approach" && !!approach && (approach.type !== "ils" || !!(r.localizer ?? r.captured));
}
export interface SeparationAlert {otherId: string; lateral: number; vertical: number; seconds: number; level: "warning" | "alert" | "critical"}
/** Infinite Flight MapControl.CheckProximity: 45 second velocity prediction,
 * two-second samples, with distances in three dimensions. */
export function radarSeparationAlerts(aircraft: Aircraft[], environment?: RadarEnvironment, frequency: Frequency | "all" = "all", airport?: Airport) {
  const alerts = new Map<string, SeparationAlert[]>();
  const range = frequency === "ground" ? 10000 / 1852 : frequency === "tower" || frequency === "atis" ? 50000 / 1852 : frequency === "center" ? environment?.range ?? 200 : 125000 / 1852;
  const airborne = aircraft.filter(a => a.active && !!a.radar && a.altitude > (airport?.elevation ?? 0) + 1 && a.radar?.departure?.phase !== "roll"
    && !["parked", "pushback", "taxi", "lineup", "rollout"].includes(a.mode)
    && (frequency === "all" || a.frequency === frequency) && Math.hypot(a.position.x, a.position.y) <= range);
  const velocity = (a: Aircraft) => {const h = (a.track ?? a.heading) * Math.PI / 180, s = (a.groundSpeed ?? a.speed) / 3600; return {x: Math.sin(h) * s, y: Math.cos(h) * s, z: (a.verticalSpeed ?? 0) / 60};};
  for (let i = 0; i < airborne.length; i++) for (let j = i + 1; j < airborne.length; j++) {
    const a = airborne[i], b = airborne[j], lateral = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y), vertical = Math.abs(a.altitude - b.altitude);
    const va = velocity(a), vb = velocity(b);
    let level: SeparationAlert["level"] | undefined, seconds = 0;
    for (let t = 0; t <= 45; t += 2) {
      const z = Math.abs(a.altitude - b.altitude + (va.z - vb.z) * t);
      const distance = Math.hypot(a.position.x - b.position.x + (va.x - vb.x) * t, a.position.y - b.position.y + (va.y - vb.y) * t, z / 6076.12);
      const next = distance < .5 && z < 1000 ? "critical" : distance < 1.5 && z < 750 ? "alert" : distance < 2 && z < 500 ? "warning" : undefined;
      if (next && (!level || ["warning", "alert", "critical"].indexOf(next) > ["warning", "alert", "critical"].indexOf(level))) {level = next; seconds = t;}
    }
    if (!level) continue;
    for (const [one, other] of [[a, b], [b, a]]) alerts.set(one.id, [...(alerts.get(one.id) ?? []), {otherId: other.id, lateral, vertical, seconds, level}]);
  }
  return alerts;
}
export const separationLabel = (alert: SeparationAlert) => `${Number(alert.lateral.toFixed(1))}nm ${Math.round(alert.vertical)}ft`;
export function terrainClearance(a: Aircraft, elevation: number | undefined, environment?: RadarEnvironment) {
  return a.active && a.radar && !a.radar.departure && !a.radar.arrival && elevation !== undefined && Number.isFinite(elevation) && !radarApproachExempt(a, environment) && a.altitude - elevation < 1000 ? a.altitude - elevation : undefined;
}
