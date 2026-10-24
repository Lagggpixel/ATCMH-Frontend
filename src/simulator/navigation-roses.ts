import type {Point} from "./model";
import type {ScopeNavigationFix} from "./scope-overlays";
import {navigationKind} from "./navigation-symbols";

/** IF renders VOR surrounds as ground-projected VectorType.VOR linework,
 * using Theme.Colors.VORLines and width 2, independently of the centre glyph.
 * Its baked aviation-tile geometry is not available in this source checkout.
 * Reconstruct the observed circle, magnetic-north spoke and 10-degree inward ticks at a nominal 10 NM
 * radius; this radius is a trainer display convention, not a verified IF value.
 */
export const COMPASS_ROSE_RADIUS_NM = 10;
export const COMPASS_ROSE_COLOR = "#fbfbfb";
export const COMPASS_ROSE_TICK_RATIO = .1;
export const compassRoseBearings = Array.from({length: 36}, (_, index) => index * 10);
export interface CompassRose extends Point {radius: number; variation: number}

export function projectCompassRoses(fixes: readonly ScopeNavigationFix[], camera: {center: Point; scale: number}, viewport: {width: number; height: number}): CompassRose[] {
  const radius = COMPASS_ROSE_RADIUS_NM * camera.scale;
  if (!Number.isFinite(radius) || radius <= 0) return [];
  const roses: CompassRose[] = [];
  for (const fix of fixes) {
    if (fix.routeOnly) continue;
    const kind = navigationKind(fix);
    if (kind !== "vor" && kind !== "tacan") continue;
    const x = viewport.width / 2 + (fix.point.x - camera.center.x) * camera.scale;
    const y = viewport.height / 2 - (fix.point.y - camera.center.y) * camera.scale;
    // The centre may be offscreen while the rose crosses the viewport.
    const nearestX = Math.max(0, Math.min(viewport.width, x)), nearestY = Math.max(0, Math.min(viewport.height, y));
    if (Math.hypot(x - nearestX, y - nearestY) > radius + 2) continue;
    const rose = {x, y, radius, variation: Number.isFinite(fix.slavedVariation) ? fix.slavedVariation! : 0};
    // At airport zoom, the outer ring can be offscreen while its north spoke
    // still crosses the viewport. Use conservative spoke bounds before culling.
    const farthest = Math.max(Math.hypot(x, y), Math.hypot(x - viewport.width, y), Math.hypot(x, y - viewport.height), Math.hypot(x - viewport.width, y - viewport.height));
    if (farthest < radius * (1 - COMPASS_ROSE_TICK_RATIO) - 2) {
      const north = compassRoseTick(rose, 0).outer;
      if (Math.max(x, north.x) < -2 || Math.min(x, north.x) > viewport.width + 2 || Math.max(y, north.y) < -2 || Math.min(y, north.y) > viewport.height + 2) continue;
    }
    roses.push(rose);
  }
  return roses;
}

/** The zero-degree mark reaches the station centre; the other 35 marks are
 * short inward ticks. Positive east variation turns magnetic north clockwise. */
export function compassRoseTick(rose: CompassRose, magneticBearing: number) {
  const angle = (magneticBearing + rose.variation) * Math.PI / 180;
  const dx = Math.sin(angle), dy = -Math.cos(angle), inner = magneticBearing % 360 === 0 ? 0 : rose.radius * (1 - COMPASS_ROSE_TICK_RATIO);
  return {outer: {x: rose.x + dx * rose.radius, y: rose.y + dy * rose.radius}, inner: {x: rose.x + dx * inner, y: rose.y + dy * inner}};
}

export function drawCompassRoses(context: CanvasRenderingContext2D, roses: readonly CompassRose[]) {
  if (!roses.length) return;
  context.save(); context.strokeStyle = COMPASS_ROSE_COLOR; context.lineWidth = 2; context.setLineDash([]);
  context.beginPath();
  for (const rose of roses) {
    context.moveTo(rose.x + rose.radius, rose.y); context.arc(rose.x, rose.y, rose.radius, 0, Math.PI * 2);
    for (const bearing of compassRoseBearings) {
      const tick = compassRoseTick(rose, bearing);
      context.moveTo(tick.outer.x, tick.outer.y); context.lineTo(tick.inner.x, tick.inner.y);
    }
  }
  context.stroke(); context.restore();
}
