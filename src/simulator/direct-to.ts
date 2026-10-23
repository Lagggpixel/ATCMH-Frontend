import type {Aircraft, RadarEnvironment} from "./model";

export function routeWaypointName(a: Pick<Aircraft, "flightPlan">, environment: RadarEnvironment, index: number) {
  const point = a.flightPlan[index];
  return point?.name ?? (point && environment.fixes.find(fix => Math.hypot(fix.point.x - point.x, fix.point.y - point.y) < .001)?.id) ?? `Waypoint ${index + 1}`;
}

/** The route index identifies an occurrence; the spoken name never includes its menu suffix. */
export function directToWaypoints(a: Pick<Aircraft, "flightPlan">, environment: RadarEnvironment) {
  const names = a.flightPlan.map((_, index) => routeWaypointName(a, environment, index));
  const counts = new Map<string, number>(), occurrences = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return names.map((name, index) => {
    const occurrence = (occurrences.get(name) ?? 0) + 1;
    occurrences.set(name, occurrence);
    return {index, name, label: counts.get(name)! > 1 ? `${name} (${occurrence})` : name};
  });
}
