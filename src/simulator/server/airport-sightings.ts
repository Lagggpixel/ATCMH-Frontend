import type {Aircraft, Airport, Exercise} from "../model";
import {getAirport} from "../airports";
import {rawTerrainElevation, terrainCoordinates} from "../terrain";
import {SIGHTING_SAMPLE_SECONDS, sightingGeometry, sightingSampleCurrent, sightingTarget, sightingTargetKey, terrainSightLine} from "../airport-sighting";

type Sample = NonNullable<NonNullable<Aircraft["airportSighting"]>["terrain"]>;
type Job = {key: string; aircraft: Aircraft; airport: Airport; elapsed: number};
export interface SightingProvider {apply(exercise: Exercise): void; request(exercise: Exercise): void}

/** Background requests never await network I/O inside a session transaction or motion tick. */
export class AirportSightings implements SightingProvider {
  private samples = new Map<string, {target: string; sample: Sample; time: number}>();
  private pending = new Set<string>();
  private queue: Job[] = [];
  private workers = 0;
  constructor(private height = rawTerrainElevation, private now = Date.now) {}
  private key(exercise: Exercise, a: Aircraft) {return `${exercise.id}:${a.id}`;}
  apply(exercise: Exercise) {
    const airport = getAirport(exercise);
    for (const a of exercise.aircraft) {
      if (!a.reportAirportInSight) continue;
      const saved = this.samples.get(this.key(exercise, a));
      if (!saved || this.now() - saved.time > SIGHTING_SAMPLE_SECONDS * 1000 || saved.target !== sightingTargetKey(a, airport)) continue;
      const candidate = {...a, airportSighting: {target: saved.target, seconds: a.airportSighting?.target === saved.target ? a.airportSighting.seconds : 0, terrain: saved.sample}};
      if (sightingSampleCurrent(candidate, airport, exercise.elapsed)) a.airportSighting = candidate.airportSighting;
    }
  }
  request(exercise: Exercise) {
    if (!exercise.running || !exercise.autoReadback) return;
    const airport = getAirport(exercise);
    for (const a of exercise.aircraft) {
      if (!a.active || !a.reportAirportInSight || !sightingGeometry(a, airport)) continue;
      const key = this.key(exercise, a), saved = this.samples.get(key);
      const fresh = saved && this.now() - saved.time < 2000 && sightingSampleCurrent({...a, airportSighting: {target: saved.target, seconds: 0, terrain: saved.sample}}, airport, exercise.elapsed);
      if (fresh || this.pending.has(key) || this.pending.size >= 100) continue;
      this.pending.add(key); this.queue.push({key, aircraft: structuredClone(a), airport, elapsed: exercise.elapsed});
    }
    // Start on the next microtask, after the caller has finished its transaction.
    queueMicrotask(() => this.drain());
  }
  private drain() {
    while (this.workers < 2 && this.queue.length) {
      const job = this.queue.shift()!; this.workers++;
      void this.sample(job).finally(() => {this.pending.delete(job.key); this.workers--; this.drain();});
    }
  }
  private async sample({key, aircraft: a, airport, elapsed}: Job) {
    const started = this.now(), target = sightingTarget(a, airport).point;
    const steps = Math.max(2, Math.ceil(Math.hypot(target.x - a.position.x, target.y - a.position.y) / .25));
    const elevations = new Array<number>(steps + 1);
    const signal = AbortSignal.timeout(6000);
    let index = 0, status: Sample["status"] = "unavailable";
    try {
      await Promise.allSettled(Array.from({length: 6}, async () => {
        while (index <= steps) {
          const i = index++, fraction = i / steps;
          const point = terrainCoordinates(airport, {x: a.position.x + (target.x - a.position.x) * fraction, y: a.position.y + (target.y - a.position.y) * fraction});
          elevations[i] = await this.height(point.latitude, point.longitude, signal);
        }
      }));
      status = terrainSightLine(a.altitude, elevations);
    } catch { /* A missing profile leaves manual pilot reporting available. */ }
    this.samples.delete(key);
    this.samples.set(key, {target: sightingTargetKey(a, airport), time: started,
      sample: {position: {...a.position}, altitude: a.altitude, checkedAt: elapsed, ...(Number.isFinite(elevations.at(-1)) ? {targetElevation: elevations.at(-1)!} : {}), status}});
    if (this.samples.size > 500) this.samples.delete(this.samples.keys().next().value!);
  }
}
export const airportSightings = new AirportSightings();
