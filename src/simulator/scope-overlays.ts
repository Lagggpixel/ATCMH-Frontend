import type {Aircraft, RadarEnvironment} from "./model";
import {navigationKind} from "./navigation-symbols";

export type ScopeNavigationFix = RadarEnvironment["fixes"][number] & {routeOnly?: true};

/** Hidden background fixes leave the selected aircraft's saved route visible. */
export function scopeNavigationFixes(fixes: RadarEnvironment["fixes"], flightPlan: Aircraft["flightPlan"] | undefined, showFixes: boolean, showNavaids = showFixes): ScopeNavigationFix[] {
  const routeFixes = (flightPlan ?? []).map((point, index) => ({
    id: point.name ?? fixes.find(fix => Math.hypot(fix.point.x - point.x, fix.point.y - point.y) < .001)?.id ?? `Waypoint ${index + 1}`,
    point,
  }));
  const visible = fixes.filter(fix => navigationKind(fix) === "fix" ? showFixes : showNavaids);
  const savedOnly = routeFixes.filter(route => !visible.some(fix => Math.hypot(fix.point.x - route.point.x, fix.point.y - route.point.y) < .001))
    .map(route => ({...route, routeOnly: true as const}));
  return savedOnly.length ? [...visible, ...savedOnly] : visible.length === fixes.length ? fixes : visible;
}

/** Predictions supply smooth positions, but only the saved frame decides whom to follow. */
export function scopeFollowTarget(snapshot: Aircraft[], rendered: Aircraft[], selected: string | null, resolve: (aircraft: Aircraft, traffic: Aircraft[]) => Aircraft | undefined) {
  const source = snapshot.find(a => a.id === selected);
  const target = source && resolve(source, snapshot);
  return target ? rendered.find(a => a.id === target.id) ?? target : undefined;
}
