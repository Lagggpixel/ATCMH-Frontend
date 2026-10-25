import type {Point} from "./model";

export interface ScopeMapData {
  airport: string;
  airports: {id: string; identifier: string; name: string | null; point: Point; isTowered: boolean; elevationFeet?: number}[];
  navaids?: {id: string; point: Point; waypointType: string; vorType?: string}[];
  approaches?: {airportIcao: string; runway: string; threshold: Point; departure: Point; ils: boolean; localizer?: boolean}[];
}
export interface WindLevel {altitude: number; direction: number; speed: number}
export interface ScopeWinds {airport: string; validAt: string; source: string; points: {point: Point; surface: WindLevel; levels: WindLevel[]}[]}
export const windAltitudeChoices = [
  [-1, "AUTO"], [0, "SURFACE"], [3000, "3,000ft"], [8000, "8,000ft"],
  [13000, "13,000ft"], [18000, "FL180"], [23000, "FL230"], [28000, "FL280"],
  [33000, "FL330"], [38000, "FL380"], [43000, "FL430"],
] as const;

/** Interpolate wind vectors, so 350° -> 010° crosses north, not south. */
export function windAtAltitude(profile: ScopeWinds["points"][number], altitude: number): WindLevel | undefined {
  if (altitude === 0) return profile.surface;
  if (altitude < profile.surface.altitude) return;
  const levels = [profile.surface, ...profile.levels.filter(level => level.altitude > profile.surface.altitude)].sort((a, b) => a.altitude - b.altitude);
  const upper = levels.findIndex(level => level.altitude >= altitude);
  if (upper < 0) return;
  if (upper === 0 || levels[upper].altitude === altitude) return levels[upper];
  const a = levels[upper - 1], b = levels[upper], weight = (altitude - a.altitude) / (b.altitude - a.altitude);
  const vector = (level: WindLevel) => ({x: Math.sin(level.direction * Math.PI / 180) * level.speed, y: Math.cos(level.direction * Math.PI / 180) * level.speed});
  const first = vector(a), second = vector(b), x = first.x + (second.x - first.x) * weight, y = first.y + (second.y - first.y) * weight;
  return {altitude, speed: Math.hypot(x, y), direction: (Math.atan2(x, y) * 180 / Math.PI + 360) % 360};
}
