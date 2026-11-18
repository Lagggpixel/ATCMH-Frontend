
import type {Point} from "../model";

export const nmBetween = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const mixPoint = (a: Point, b: Point, t: number): Point => ({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t});
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const offset = (a: Point, b: Point): Point => ({x: a.x - b.x, y: a.y - b.y});

export function insideSector(ring: readonly Point[], point: Point) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(p: Point, a: Point, b: Point) {
  const d = offset(b, a), lengthSquared = d.x * d.x + d.y * d.y;
  const t = lengthSquared ? ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / lengthSquared : 0;
  return nmBetween(p, mixPoint(a, b, Math.max(0, Math.min(1, t))));
}

export function distanceToSector(ring: readonly Point[], point: Point) {
  return Math.min(...ring.map((a, i) => distanceToSegment(point, a, ring[(i + 1) % ring.length])));
}

export function sectorEntry(ring: readonly Point[], route: readonly Point[], buffer = 25) {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], ab = offset(b, a);
    const crossings = ring.flatMap((c, n) => {
      const cd = offset(ring[(n + 1) % ring.length], c), ac = offset(c, a);
      const divisor = cross(ab, cd);
      if (Math.abs(divisor) < 1e-9) return [];
      const t = cross(ac, cd) / divisor, u = cross(ac, ab) / divisor;
      return t > 0 && t < 1 && u >= 0 && u <= 1 ? [t] : [];
    }).sort((x, y) => x - y);
    for (const t of crossings) {
      if (insideSector(ring, mixPoint(a, b, Math.min(1, t + .00001))) === insideSector(ring, mixPoint(a, b, Math.max(0, t - .00001)))) continue;
      if (!insideSector(ring, mixPoint(a, b, Math.min(1, t + .00001)))) continue;
      // Walk backwards on the inbound route, then bisect the first 25 NM offset crossing.
      let near = mixPoint(a, b, t);
      for (let cursor = i - 1; cursor >= 0; cursor--) {
        const far = route[cursor];
        const count = Math.ceil(nmBetween(near, far));
        const start = near;
        for (let step = 1; step <= count; step++) {
          const point = mixPoint(start, far, step / count);
          if (insideSector(ring, point)) break;
          if (distanceToSector(ring, point) >= buffer) {
            let lo = 0, hi = 1;
            for (let pass = 0; pass < 24; pass++) {
              const mid = (lo + hi) / 2;
              if (distanceToSector(ring, mixPoint(near, point, mid)) < buffer) lo = mid;
              else hi = mid;
            }
            return {position: mixPoint(near, point, hi), index: cursor + 1};
          }
          near = point;
        }
        if (nmBetween(near, far) > .001) break;
      }
    }
  }
}

export function approachEntry(route: readonly Point[], destination: Point, radius: number) {
  for (let i = route.length - 1; i > 0; i--) {
    const a = route[i - 1], b = route[i];
    if (nmBetween(a, destination) < radius || nmBetween(b, destination) >= radius) continue;
    let lo = 0, hi = 1;
    for (let pass = 0; pass < 28; pass++) {
      const mid = (lo + hi) / 2;
      if (nmBetween(mixPoint(a, b, mid), destination) >= radius) lo = mid;
      else hi = mid;
    }
    return {position: mixPoint(a, b, lo), index: i};
  }
}
