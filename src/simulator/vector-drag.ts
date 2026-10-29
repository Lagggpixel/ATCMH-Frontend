import type {Action, Aircraft, Frequency, Point, RadarEnvironment} from "./model";

// Browser CSS pixels are density-independent, like the reference map's dp.
export const VECTOR_HOLD_MS = 250;
export const VECTOR_CANCEL_RADIUS = 25;
export const VECTOR_SNAP_RADIUS = 30;
export interface VectorTarget {index: number; name: string; point: Point}

export function outsideVectorCircle(aircraft: Point, pointer: Point, scale: number) {
  return Math.hypot(pointer.x - aircraft.x, pointer.y - aircraft.y) * scale > VECTOR_CANCEL_RADIUS;
}

/** Keep the original array index, including when blank/DRCT entries are skipped. */
export function vectorSnapTarget(a: Pick<Aircraft, "flightPlan">, pointer: Point, scale: number, environment?: RadarEnvironment): VectorTarget | undefined {
  let target: VectorTarget | undefined, nearest = VECTOR_SNAP_RADIUS;
  a.flightPlan.forEach((point, index) => {
    const name = point.name ?? environment?.fixes.find(fix => Math.hypot(fix.point.x - point.x, fix.point.y - point.y) < .001)?.id;
    if (!name?.trim() || name.trim().toUpperCase() === "DRCT") return;
    const gap = Math.hypot(point.x - pointer.x, point.y - pointer.y) * scale;
    if (gap <= nearest && (!target || gap < nearest)) {
      nearest = gap;
      target = {index, name, point: {x: point.x, y: point.y}};
    }
  });
  return target;
}

/** Off-frequency menu actions remain local: no controller transmission or readback is created. */
export function dispatchVectorMenuAction(action: Action, onFrequency: boolean, dispatch: (action: Action, path?: string[]) => void | Promise<boolean>, path?: string[]) {
  if (action.kind === "command" && !onFrequency) return Promise.resolve(true);
  return dispatch(action, path);
}

/** Build a menu-only view without changing the aircraft or its actual frequency. */
export function vectorMenuAircraft(aircraft: Aircraft, frequency: Frequency, mode: "local" | "approach" | "center", onFrequency: boolean): Aircraft {
  if (mode === "local" || onFrequency) return aircraft;
  return {...aircraft, frequency, radar: {...(aircraft.radar ?? {navigation: "heading" as const, routeIndex: 0}), station: mode, returningToApproach: false, transferred: false}};
}
