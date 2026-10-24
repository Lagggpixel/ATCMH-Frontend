import {airportRunways} from "./airports";
import type {Aircraft, Airport} from "./model";

/** Mapped exits end exactly on this boundary; allow projection round-off. */
export const runwayLateralClear = (lateral: number, clearance: number) => Math.abs(lateral) >= clearance - 1e-7;

/** Final automatic go-arounds wait for 50 ft AAL or the landing threshold. */
export function runwayGoAroundDue(altitude: number, elevation: number, along: number) {
  return altitude <= elevation + 50 || along >= 0;
}

/** Occupancy lasts until the aircraft clears the protected runway area,
 * including reciprocal runways and traffic crossing the landing runway. */
export function runwayOccupied(airport: Airport, runway: string, aircraft: readonly Aircraft[], ownId: string) {
  const pair = airportRunways(airport).find(pair => pair.ends.some(end => end.id === runway));
  if (!pair) return false;
  const [start, end] = pair.ends, dx = end.point.x - start.point.x, dy = end.point.y - start.point.y;
  const length = Math.hypot(dx, dy), x = dx / length, y = dy / length;
  const clearance = pair.exitClearanceFeet
    ? Math.max(pair.exitClearanceFeet, (pair.widthFeet ?? 0) / 2 + 50) / 6076
    : pair.widthFeet ? Math.min(.06, .04 + pair.widthFeet / (2 * 6076)) : .06;
  return aircraft.some(other => {
    if (other.id === ownId || !other.active || other.altitude > airport.elevation + 10
      || !["parked", "pushback", "taxi", "lineup", "rollout", "takeoff"].includes(other.mode)) return false;
    const px = other.position.x - start.point.x, py = other.position.y - start.point.y;
    const along = px * x + py * y;
    return along >= -.02 && along <= length + .02 && !runwayLateralClear(px * -y + py * x, clearance);
  });
}
