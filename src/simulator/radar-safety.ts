import {radarArrivalFrequency} from "./model";
import {performanceFor} from "./aircraft-performance";
import type {Aircraft, Airport, Frequency, Instruction, RadarEnvironment} from "./model";
import {aircraftSpeedLimits, machKnots} from "./radar-speed";
import {airportRunways} from "./airports";

export function headingOnlyUnable(a: Aircraft, c: Instruction): string | null {
  return a.radar && c.type === "vector" && c.heading !== undefined && !c.altitude && (!a.radar.targetAltitude || a.radar.altitudeFromRoute || a.followRouteAltitudes || a.starDescent)
    ? "Assign an altitude before issuing a heading-only vector." : null;
}

/** Automatic pilot decisions only; manual mentor assignment remains available. */
export function automaticRadarUnable(a: Aircraft, c: Instruction): string | null {
  const headingError = headingOnlyUnable(a, c); if (headingError) return headingError;
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
// Conservative geometry check shared by instrument and visual approaches. Distances are NM.
function establishedFinal(a: Aircraft, environment?: RadarEnvironment, airport?: Airport) {
  const r = a.radar, p = environment?.approaches.find(item => item.id === r?.cleared);
  if (!r || r.navigation !== "approach" || r.missedApproach || !p || !airport) return undefined;
  if (p.type === "ils" && !(r.localizer || r.captured) || p.type === "gps" && !r.captured) return undefined;
  if (p.airportIcao && p.airportIcao.toUpperCase() !== airport.icao.toUpperCase() && (!p.threshold || !p.departure)) return undefined;
  const runway = airportRunways(airport).find(pair => pair.ends.some(end => end.id === p.runway));
  const threshold = p.threshold ?? runway?.ends.find(end => end.id === p.runway)?.point;
  const departure = p.departure ?? runway?.ends.find(end => end.id !== p.runway)?.point;
  if (!threshold || !departure) return undefined;
  const dx = departure.x - threshold.x, dy = departure.y - threshold.y, length = Math.hypot(dx, dy);
  if (!length) return undefined;
  const vx = dx / length, vy = dy / length, x = a.position.x - threshold.x, y = a.position.y - threshold.y;
  const distance = -(x * vx + y * vy), offset = Math.abs(x * vy - y * vx);
  if (distance < 0 || distance > 10 || offset > 0.25) return undefined;
  if (p.type === "visual") {
    const course = (Math.atan2(vx, vy) * 180 / Math.PI + 360) % 360;
    if (a.track === undefined || !Number.isFinite(a.track) || Math.abs(((a.track - course + 540) % 360) - 180) > 15) return undefined;
  }
  return {airport: (p.airportIcao ?? airport.icao).toUpperCase(), runway: p.runway.toUpperCase()};
}
/** Current spacing alerts, including reduced same-runway final spacing. */
export function radarSeparationAlerts(aircraft: Aircraft[], environment?: RadarEnvironment, frequency: Frequency | "all" = "all", airport?: Airport) {
  const alerts = new Map<string, SeparationAlert[]>();
  const range = frequency === "ground" ? 10000 / 1852 : frequency === "tower" || frequency === "atis" ? 50000 / 1852 : frequency === "center" ? environment?.range ?? 200 : 125000 / 1852;
  const airborne = aircraft.filter(a => a.active && !!a.radar && a.altitude > (airport?.elevation ?? 0) + 1 && a.radar?.departure?.phase !== "roll"
    && !["parked", "pushback", "taxi", "lineup", "rollout"].includes(a.mode)
    && (frequency === "all" || a.frequency === frequency) && Math.hypot(a.position.x, a.position.y) <= range);
  for (let i = 0; i < airborne.length; i++) for (let j = i + 1; j < airborne.length; j++) {
    const a = airborne[i], b = airborne[j], lateral = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y), vertical = Math.abs(a.altitude - b.altitude);
    const finalA = establishedFinal(a, environment, airport), finalB = establishedFinal(b, environment, airport);
    const sameFinal = finalA && finalB && finalA.airport === finalB.airport && finalA.runway === finalB.runway;
    if (sameFinal ? lateral >= 2.5 : lateral >= 3 || vertical >= 1000) continue;
    for (const [one, other] of [[a, b], [b, a]]) alerts.set(one.id, [...(alerts.get(one.id) ?? []), {otherId: other.id, lateral, vertical, seconds: 0, level: "alert"}]);
  }
  return alerts;
}
export const separationLabel = (alert: SeparationAlert) => `${Number(alert.lateral.toFixed(1))}nm ${Math.round(alert.vertical)}ft`;
export function terrainClearance(a: Aircraft, elevation: number | undefined, environment?: RadarEnvironment) {
  return a.active && a.radar && !a.radar.departure && !a.radar.arrival && elevation !== undefined && Number.isFinite(elevation) && !radarApproachExempt(a, environment) && a.altitude - elevation < 1000 ? a.altitude - elevation : undefined;
}
