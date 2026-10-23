import type {Aircraft, RadarEnvironment} from "./model";

/** Hidden background fixes leave the selected aircraft's saved route visible. */
export function scopeNavigationFixes(fixes: RadarEnvironment["fixes"], flightPlan: Aircraft["flightPlan"] | undefined, showAll: boolean): RadarEnvironment["fixes"] {
  const routeFixes = (flightPlan ?? []).map((point, index) => ({
    id: point.name ?? fixes.find(fix => Math.hypot(fix.point.x - point.x, fix.point.y - point.y) < .001)?.id ?? `Waypoint ${index + 1}`,
    point,
  }));
  if (!showAll) return routeFixes;
  const savedOnly = routeFixes.filter(route => !fixes.some(fix => Math.hypot(fix.point.x - route.point.x, fix.point.y - route.point.y) < .001));
  return savedOnly.length ? [...fixes, ...savedOnly] : fixes;
}

/** Predictions supply smooth positions, but only the saved frame decides whom to follow. */
export function scopeFollowTarget(snapshot: Aircraft[], rendered: Aircraft[], selected: string | null, resolve: (aircraft: Aircraft, traffic: Aircraft[]) => Aircraft | undefined) {
  const source = snapshot.find(a => a.id === selected);
  const target = source && resolve(source, snapshot);
  return target ? rendered.find(a => a.id === target.id) ?? target : undefined;
}
