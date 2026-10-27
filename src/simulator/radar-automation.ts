import type {Aircraft} from "./model";

export const MAX_ILS_INTERCEPT = 45;
export const GLIDESLOPE_DEVIATION_FEET = 100;

/** Remember both sides of final: a frame can cross the entire capture corridor. */
export function missedLocalizerReason(a: Aircraft, along: number, lateral: number, angle: number, captureDistance: number): string | undefined {
  const r = a.radar!, previous = r.localizerIntercept;
  r.localizerIntercept = {along, lateral, angle};
  if (r.localizer || r.captured || !previous || previous.lateral === lateral) return;
  if (previous.lateral * lateral > 0) return;
  const fraction = previous.lateral / (previous.lateral - lateral);
  const crossing = previous.along + (along - previous.along) * fraction;
  if (crossing >= -.1 || crossing < -captureDistance) return;
  const intercept = previous.angle + (angle - previous.angle) * fraction;
  if (intercept > MAX_ILS_INTERCEPT + 1e-8) return `Missed localizer: ${Math.round(intercept)}° intercept exceeds ${MAX_ILS_INTERCEPT}°.`;
}
