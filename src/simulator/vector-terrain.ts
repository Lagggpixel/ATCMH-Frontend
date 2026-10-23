import {terrainElevation} from "./terrain";

export interface TerrainPoint {latitude: number; longitude: number}
export interface VectorTerrainSample extends TerrainPoint {feet: number | null}
type Lookup = typeof terrainElevation;
const samePoint = (a: TerrainPoint | undefined, b: TerrainPoint) => a?.latitude === b.latitude && a.longitude === b.longitude;

/** Sample the latest endpoint without cancelling useful work on every pointer move. */
export function vectorTerrainSampler(onSample: (sample: VectorTerrainSample) => void, lookup: Lookup = terrainElevation) {
  let latest: TerrainPoint | undefined, requested: TerrainPoint | undefined;
  let stopped = false, busy = false;
  let nextStart = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const sample = async () => {
    timer = undefined;
    if (stopped || busy || !latest || samePoint(requested, latest)) return;
    if (Date.now() < nextStart) {
      timer = setTimeout(() => {void sample();}, nextStart - Date.now());
      return;
    }
    const point = latest;
    requested = point; busy = true; nextStart = Date.now() + 300;
    controller = new AbortController();
    const signal = controller.signal;
    timeout = setTimeout(() => controller?.abort(), 5000);
    try {
      const feet = await lookup(point.latitude, point.longitude, signal);
      if (!stopped && !signal.aborted) onSample({...point, feet});
    } catch {
      if (!stopped) onSample({...point, feet: null});
    } finally {
      clearTimeout(timeout); busy = false;
      if (!stopped && latest && !samePoint(requested, latest)) void sample();
    }
  };
  return {
    update(point: TerrainPoint) {
      latest = {...point};
      if (!busy && timer === undefined) void sample();
    },
    stop() {
      stopped = true; clearTimeout(timer); clearTimeout(timeout); controller?.abort();
    },
  };
}
