import type {Aircraft, Airport} from "./model";
/** Explicit state wins; old stationary taxiway snapshots retain their usable taxi menu. */
export function groundReady(a: Aircraft, airport: Airport): boolean {
  if (a.groundReady !== undefined) return a.groundReady;
  if (a.mode === "pushback") return false;
  if (a.mode !== "parked") return true;
  return airport.features.some(f => ["taxiway", "taxilane"].includes(f.kind) && f.points.some((end, i) => {
    const start = f.points[i - 1]; if (!start) return false;
    const dx = end.x - start.x, dy = end.y - start.y, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((a.position.x - start.x) * dx + (a.position.y - start.y) * dy) / length)) : 0;
    return Math.hypot(a.position.x - start.x - t * dx, a.position.y - start.y - t * dy) < .012;
  }));
}
