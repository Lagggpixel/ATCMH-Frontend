import {radarArrivalFrequency} from "../model";
import {randomUUID} from "node:crypto";
import {airportRunways, getAirport, trainingMode} from "../airports";
import type {Aircraft, Airport, Exercise, Point} from "../model";
import {rawTerrainElevation, terrainCoordinates} from "../terrain";
import {radarEnvironmentFor} from "../radar";

type Position = {point: Point; altitude: number; elapsed: number};
type Track = {generation: number; started: number; observed: Position; checked?: Position; pending: boolean; unavailable: boolean; touched: number};
type Job = {key: string; generation: number; from: Position; to: Position; aircraft: Aircraft; airport: Airport; landingRunway?: string};
type Impact = {generation: number; position: Point; elapsed: number};
export interface TerrainImpactProvider {apply(exercise: Exercise): boolean; request(exercise: Exercise): void}
const eligible = (a: Aircraft) => a.active && !!a.radar && !a.radar.arrival && a.radar.departure?.phase !== "roll"
  && !["parked", "pushback", "taxi", "lineup", "rollout"].includes(a.mode);

/** Authoritative impacts use sampled flight segments. Network work stays outside
 * session locks; stale results cannot affect reset or repositioned aircraft. */
export class TerrainImpacts implements TerrainImpactProvider {
  private tracks = new Map<string, Track>();
  private impacts = new Map<string, Impact>();
  private queue: Job[] = [];
  private workers = 0;
  private heights = new Map<string, number>();
  constructor(private height = rawTerrainElevation, private now = Date.now) {}
  private key(exercise: Exercise, id: string) {return `${exercise.id}:${id}`;}
  apply(exercise: Exercise) {
    if (trainingMode(exercise) === "local") return false;
    let changed = false;
    for (const aircraft of exercise.aircraft) {
      const key = this.key(exercise, aircraft.id), impact = this.impacts.get(key), track = this.tracks.get(key);
      if (!impact) continue;
      this.impacts.delete(key);
      if (!track || impact.generation !== track.generation || impact.elapsed > exercise.elapsed || !eligible(aircraft)) continue;
      const since = Math.max(0, exercise.elapsed - track.observed.elapsed);
      if (Math.hypot(aircraft.position.x - track.observed.point.x, aircraft.position.y - track.observed.point.y) > Math.max(aircraft.speed, aircraft.groundSpeed ?? 0) * since / 3600 * 1.5 + .02) continue;
      exercise.collisions = [...(exercise.collisions ?? []), {id: randomUUID(), kind: "terrain" as const, elapsed: impact.elapsed,
        aircraft: [{id: aircraft.id, callsign: aircraft.callsign}], position: impact.position}].slice(-300);
      exercise.aircraft = exercise.aircraft.filter(a => a.id !== aircraft.id);
      this.tracks.delete(key); changed = true;
    }
    const flying = exercise.aircraft.filter(eligible);
    const tracks = flying.map(a => this.tracks.get(this.key(exercise, a.id)));
    const status = !flying.length ? "available" : tracks.some(t => t?.unavailable || t && t.observed.elapsed - (t.checked?.elapsed ?? t.started) > 8)
      ? "unavailable" : tracks.some(t => !t?.checked) ? "checking" : "available";
    if (exercise.terrainStatus !== status) {exercise.terrainStatus = status; changed = true;}
    if (changed) exercise.revision++;
    return changed;
  }
  request(exercise: Exercise) {
    if (!exercise.running || trainingMode(exercise) === "local") return;
    const airport = getAirport(exercise), time = this.now();
    const environment = exercise.radarEnvironment ?? radarEnvironmentFor(airport);
    for (const a of exercise.aircraft.filter(eligible)) {
      const key = this.key(exercise, a.id);
      const position = {point: {...a.position}, altitude: a.altitude, elapsed: exercise.elapsed};
      let track = this.tracks.get(key);
      if (track) {
        const dt = position.elapsed - track.observed.elapsed;
        const jump = Math.hypot(position.point.x - track.observed.point.x, position.point.y - track.observed.point.y);
        if (dt < 0 || dt > 5 || jump > Math.max(a.speed, a.groundSpeed ?? 0) * Math.max(0, dt) / 3600 * 1.5 + .02
          || Math.abs(position.altitude - track.observed.altitude) > Math.max(100, Math.abs(a.verticalSpeed ?? 0) * Math.max(0, dt) / 60 + 100)) {
          track.generation++; track.started = position.elapsed; track.checked = undefined; track.pending = false; this.impacts.delete(key);
        }
        track.observed = position; track.touched = time;
      } else {
        track = {generation: 0, started: position.elapsed, observed: position, pending: false, unavailable: false, touched: time};
        this.tracks.set(key, track);
      }
      if (track.pending || track.checked && position.elapsed - track.checked.elapsed < .5) continue;
      if (this.queue.length >= 200) {track.unavailable = true; continue;}
      const from = track.checked ?? position;
      // After a long outage do not extrapolate across an unobserved interval.
      if (position.elapsed - from.elapsed > 20) {track.checked = undefined; track.unavailable = true;}
      track.pending = true;
      // Saved arrivals may have an empty/stale physical runway until touchdown.
      // Only their cleared local approach can identify the landing surface.
      const approach = environment.approaches.find(p => p.id === a.radar?.cleared);
      const landingRunway = approach && (!approach.airportIcao || approach.airportIcao === airport.icao) ? approach.runway : undefined;
      this.queue.push({key, generation: track.generation, from: track.checked ?? position, to: position, aircraft: structuredClone(a), airport, landingRunway});
    }
    for (const [key, track] of this.tracks) if (time - track.touched > 120_000) {this.tracks.delete(key); this.impacts.delete(key);}
    queueMicrotask(() => this.drain());
  }
  private drain() {
    while (this.workers < 4 && this.queue.length) {
      const job = this.queue.shift()!; this.workers++;
      void this.sample(job).finally(() => {this.workers--; this.drain();});
    }
  }
  private landingSurface(a: Aircraft, airport: Airport, point: Point, altitude: number, runway: string | undefined) {
    if (!a.radar?.captured || !a.radar.transferred || !radarArrivalFrequency(a.frequency) || a.radar.navigation !== "approach") return false;
    const pair = airportRunways(airport).find(p => p.ends.some(end => end.id === runway));
    const start = pair?.ends.find(end => end.id === runway)?.point, end = pair?.ends.find(end => end.id !== runway)?.point;
    if (!start || !end) return false;
    const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
    const along = ((point.x - start.x) * dx + (point.y - start.y) * dy) / length;
    const lateral = Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx) / length;
    return along >= -.1 && along <= length && lateral <= Math.max(.012, (pair?.widthFeet ?? 100) / 12152) && altitude >= airport.elevation - 5;
  }
  private async sample(job: Job) {
    const {from, to, key, generation, airport, aircraft, landingRunway} = job;
    const length = Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y);
    const steps = Math.max(1, Math.ceil(length / .025));
    const signal = AbortSignal.timeout(6000);
    let unavailable = false, hit: Impact | undefined;
    try {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, point = {x: from.point.x + (to.point.x - from.point.x) * t, y: from.point.y + (to.point.y - from.point.y) * t};
        const altitude = from.altitude + (to.altitude - from.altitude) * t, location = terrainCoordinates(airport, point);
        const cacheKey = `${location.latitude},${location.longitude}`;
        const elevation = this.heights.get(cacheKey) ?? await this.height(location.latitude, location.longitude, signal);
        if (!Number.isFinite(elevation)) throw new Error("Terrain unavailable");
        if (this.heights.size >= 5000) this.heights.delete(this.heights.keys().next().value!);
        this.heights.set(cacheKey, elevation);
        if (altitude <= elevation && !this.landingSurface(aircraft, airport, point, altitude, landingRunway)) {
          hit = {generation, position: point, elapsed: from.elapsed + (to.elapsed - from.elapsed) * t}; break;
        }
      }
    } catch {unavailable = true;}
    const track = this.tracks.get(key);
    if (!track || track.generation !== generation) return;
    track.pending = false; track.unavailable = unavailable;
    if (!unavailable) track.checked = to;
    if (hit) this.impacts.set(key, hit);
  }
}
export const terrainImpacts = new TerrainImpacts();
