
import {advance, applyEnvelope, engineFor, trimMessages} from "../engine";
import {airportRunways, defaultRunway, getAirport} from "../airports";
import {freshFacilityEnvironment, insideAirspace} from "../aviation";
import {profileForType} from "../aircraft-performance";
import {availableLocalGate, createLocalAircraft} from "../local-aircraft";
import {MAX_AIRCRAFT, type Aircraft, type Exercise} from "../model";
import {airborne, radarAircraft, radarEnvironmentFor, radarHeading} from "../radar";
import {runwayOccupied} from "../runway-safety";
import {standPlacement, gatesFor} from "../scenarios";
import type {CompiledEndless, CompiledStream, RouteVariant} from "./compile";
import {endlessIssues, separationFor, type EndlessIssue} from "./definition";
import {distanceToSector, insideSector, nmBetween} from "./geometry";

export interface EndlessCounts {
  released: number; completed: number; skipped: number; separation: number; runway: number;
  collisions: number; terrain: number; unresolved: number;
}
export interface EndlessReport extends EndlessCounts {
  score: number | null; unfinished: number; duration: number; definition: CompiledEndless["definition"];
}
export interface EndlessEvent {
  ordinal: number;
  at: number;
  kind: "release" | "skipped" | "transfer" | "complete" | "unresolved" | "separation" | "runway" | "collision" | "terrain";
  label: string;
  aircraftId?: string;
  issue?: EndlessIssue;
}
type EndlessIncident = Pick<EndlessEvent, "ordinal" | "at" | "label"> & {kind: "separation" | "runway" | "collision" | "terrain"};
export interface EndlessRunSummary extends EndlessCounts {
  draining: boolean;
  incident?: EndlessIncident;
}
interface Traffic {
  stream: number;
  entered: boolean;
  release: number;
  issue?: EndlessIssue;
  transfer?: string;
  completedAt?: number;
}
export interface EndlessRuntime {
  version: 1;
  scenario: CompiledEndless;
  seed: number;
  started: boolean;
  draining: boolean;
  ended: boolean;
  serial: number;
  cursors: number[];
  eligible: number;
  counts: EndlessCounts;
  traffic: Record<string, Traffic>;
  incidents: string[];
  collisionIds: string[];
  events: EndlessEvent[];
  ordinal: number;
}

export function initializeEndless(scenario: CompiledEndless, seed: number) {
  const exercise = engineFor(scenario.selection).initialExercise();
  exercise.aircraft = [];
  exercise.running = false;
  exercise.autoReadback = true;
  exercise.atis = {...exercise.atis};
  if (scenario.definition.mode !== "local") {
    const airport = getAirport(scenario.selection);
    const base = radarEnvironmentFor(airport);
    exercise.radarEnvironment = freshFacilityEnvironment(airport, scenario.definition.mode, {
      ...base, range: scenario.range, ...(scenario.boundary ? {boundary: scenario.boundary} : {}),
      facilities: scenario.neighbours,
      ...(scenario.definition.sector ? {facilityActivity: {[scenario.definition.sector]: true}} : {}),
      handoffFacilityIds: scenario.neighbours.map(f => f.id),
    });
  }
  const runtime: EndlessRuntime = {
    version: 1, scenario, seed, started: false, draining: false, ended: false,
    serial: 0, cursors: scenario.streams.map(s => s.firstAt), eligible: 0, traffic: {}, incidents: [], collisionIds: [], ordinal: 0, events: [],
    counts: {released: 0, completed: 0, skipped: 0, separation: 0, runway: 0, collisions: 0, terrain: 0, unresolved: 0},
  };
  return {exercise, runtime};
}

export function endlessRunSummary(runtime: EndlessRuntime): EndlessRunSummary {
  const incident = runtime.events.findLast((event): event is EndlessIncident =>
    event.kind === "separation" || event.kind === "runway" || event.kind === "collision" || event.kind === "terrain");
  return {...runtime.counts, draining: runtime.draining, ...(incident ? {incident: {
    ordinal: incident.ordinal, at: incident.at, kind: incident.kind, label: incident.label,
  }} : {})};
}

export function endlessReport(runtime: EndlessRuntime, duration: number): EndlessReport {
  const counts = runtime.counts;
  const safety = Math.max(0, 75 - 10 * counts.separation - 15 * counts.runway);
  const score = counts.released
    ? Math.min(counts.terrain || counts.collisions ? 49 : 100, Math.round(safety + 25 * counts.completed / counts.released))
    : null;
  return {...counts, score, duration, unfinished: counts.released - counts.completed - counts.unresolved, definition: runtime.scenario.definition};
}

function mark(runtime: EndlessRuntime, exercise: Exercise, event: Omit<EndlessEvent, "at" | "ordinal">) {
  runtime.events.push({...event, ordinal: ++runtime.ordinal, at: exercise.elapsed});
  if (runtime.events.length > 500) runtime.events.splice(0, runtime.events.length - 500);
}

function hash(seed: number, seq: number) {
  let value = (seed ^ Math.imul(seq + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x21f0aaad);
  return (value ^ value >>> 15) >>> 0;
}

function pickIssue(runtime: EndlessRuntime, opening: number | undefined) {
  const percent = runtime.scenario.definition.issuePercent;
  if (!percent) return undefined;
  if (opening !== undefined) return opening === 1 ? endlessIssues[1] : undefined;
  const index = ++runtime.eligible;
  if (Math.floor(index * percent / 100) === Math.floor((index - 1) * percent / 100)) return undefined;
  return endlessIssues[(Math.floor(index * percent / 100) - 1) % endlessIssues.length];
}

function localAircraft(exercise: Exercise, stream: CompiledStream, id: string, callsign: string, model: string) {
  const departure = stream.definition.kind === "departure", pattern = stream.definition.kind === "pattern";
  const gate = departure ? availableLocalGate(exercise, exercise.aircraft) : undefined;
  if (departure && !gate) return undefined;
  return createLocalAircraft(exercise, id, {
    placement: departure ? "gate" : pattern ? "circuit" : "final", gateId: gate?.id,
    callsign, type: pattern ? "C172" : model, runway: stream.definition.runway, hand: "left",
    leg: pattern ? "downwind" : "final", distance: 10, height: pattern ? 1000 : 3200,
    landing: pattern ? "touch-and-go" : "full-stop", flight: departure ? "departure" : "pattern",
    frequency: departure ? "ground" : "tower", speed: "auto", heading: 0,
  });
}

function radarTraffic(exercise: Exercise, runtime: EndlessRuntime, stream: CompiledStream, variant: RouteVariant, id: string,
  callsign: string, type: string, issue: EndlessIssue | undefined, opening: number | undefined) {
  const airport = getAirport(exercise), station = runtime.scenario.definition.mode === "center" ? "center" : "approach";
  const inbound = stream.definition.kind === "arrival", radar = radarAircraft(engineFor(exercise).newAircraft(id, true), station, airport);
  const route = structuredClone(variant.points);
  const altitude = inbound ? (issue === "High profile" ? 31000 : station === "approach" ? 25000 : 25000 + 2000 * (opening ?? 0))
    : (stream.departureElevation ?? airport.elevation) + 3000;
  const speed = inbound ? 285 : 210;
  const heading = radarHeading(variant.spawn.position, route[variant.spawn.index]);
  const broken = issue === "No flight plan";
  const wrong = issue === "Unsuitable route or STAR";
  const wrongPlan = wrong ? variant.alternate?.points ?? route.slice(0, Math.max(variant.spawn.index + 1, route.findIndex(p => p.procedure?.type === "STAR"))) : route;
  const runway = stream.definition.destination === airport.icao && inbound ? stream.definition.arrivalRunway ?? stream.definition.runway : defaultRunway(airport);
  return {
    ...radar, callsign, type, performanceProfile: profileForType(type), position: variant.spawn.position,
    runway, altitude, heading, targetHeading: heading, speed, targetSpeed: speed,
    cruiseAltitude: inbound ? altitude : stream.definition.kind === "intra-sector" ? 9000 : 25000,
    flightPlan: broken ? [] : wrongPlan,
    arrivalProcedure: wrong ? variant.alternate?.name : broken ? undefined : variant.star,
    destination: {point: stream.destination, name: stream.definition.destination}, followRouteAltitudes: !broken && issue !== "High profile",
    radar: {...radar.radar!, navigation: broken ? "heading" as const : "route" as const,
      routeIndex: broken ? 0 : Math.min(variant.spawn.index, wrongPlan.length - 1), flight: inbound ? undefined : "departure" as const, report: "check-in" as const},
  } satisfies Aircraft;
}

function release(exercise: Exercise, runtime: EndlessRuntime, index: number, now: number, opening?: number): Exercise {
  const stream = runtime.scenario.streams[index], serial = ++runtime.serial, entropy = hash(runtime.seed, serial);
  const type = ["A320", "A321", "B738", "B789"][entropy % 4];
  const id = `${exercise.id}-e${serial}`, callsign = `${["Speedbird", "Shamrock", "Easy", "KLM"][entropy % 4]} ${300 + serial}`;
  const local = runtime.scenario.definition.mode === "local";
  const inbound = stream.definition.kind === "arrival";
  const issue = !local && inbound ? pickIssue(runtime, opening) : undefined;
  const minimum = separationFor(runtime.scenario.definition.mode);
  const insufficientSpace = (aircraft: Aircraft) => exercise.aircraft.some(other => other.active
    && nmBetween(aircraft.position, other.position) < (minimum?.nm ?? 1)
    && Math.abs(aircraft.altitude - other.altitude) < (minimum?.feet ?? 500));
  let reason = "Aircraft limit reached";
  if (exercise.aircraft.length < MAX_AIRCRAFT) {
    const choices = local ? [localAircraft(exercise, stream, id, callsign, type)]
      : stream.variants.map((_, i, items) => radarTraffic(exercise, runtime, stream, items[(entropy + i) % items.length], id, callsign, type, issue, opening));
    const aircraft = choices.find(choice => choice && (choice.frequency === "ground" || !insufficientSpace(choice)));
    reason = choices.some(Boolean) ? "Entry spacing unavailable" : "All stands occupied";
    if (aircraft) {
      const result = applyEnvelope(exercise, {id: `${id}:spawn`, time: now, action: {kind: "spawn", aircraft}}, {suppressSpawnRequest: !local});
      if (!result.error) {
        runtime.traffic[id] = {stream: index, release: exercise.elapsed, entered: !runtime.scenario.boundary || !inbound, ...(issue ? {issue} : {})};
        runtime.counts.released++;
        mark(runtime, result.state, {kind: "release", label: `${callsign} · ${stream.definition.name}`, aircraftId: id, ...(issue ? {issue} : {})});
        return result.state;
      }
      reason = result.error;
    }
  }
  runtime.counts.skipped++;
  mark(runtime, exercise, {kind: "skipped", label: `${stream.definition.name} · ${reason}`});
  return exercise;
}

export function startEndless(exercise: Exercise, runtime: EndlessRuntime, now: number) {
  if (runtime.started) return exercise;
  runtime.started = true;
  if (runtime.scenario.definition.mode === "local") return exercise;
  const arrivals = runtime.scenario.streams.flatMap((s, i) => s.definition.kind === "arrival" ? [i] : []);
  for (let slot = 0; slot < 3; slot++) exercise = release(exercise, runtime, arrivals[slot % arrivals.length], now, slot);
  return exercise;
}

function incidentKeys(exercise: Exercise, runtime: EndlessRuntime) {
  const airport = getAirport(exercise), minimum = separationFor(runtime.scenario.definition.mode), risks = new Map<string, Omit<EndlessEvent, "ordinal" | "at">>();
  const flying = minimum ? exercise.aircraft.filter(a => airborne(a, airport)) : [];
  for (let i = 0; minimum && i < flying.length; i++) for (let j = i + 1; j < flying.length; j++) {
    const a = flying[i], b = flying[j];
    if (!runtime.traffic[a.id] || !runtime.traffic[b.id] || runtime.traffic[a.id].transfer && runtime.traffic[b.id].transfer) continue;
    if (Math.abs(a.altitude - b.altitude) < minimum.feet && nmBetween(a.position, b.position) < minimum.nm) {
      risks.set([a.id, b.id].sort().join("|"), {kind: "separation", aircraftId: a.id, label: `Loss of separation · ${a.callsign} / ${b.callsign}`});
    }
  }
  if (runtime.scenario.definition.mode !== "center") for (const runway of airportRunways(airport)) {
    const id = runway.ends[0].id;
    for (const a of exercise.aircraft) {
      if (!a.active || !["takeoff", "rollout"].includes(a.mode) || !runway.ends.some(end => end.id === a.runway)) continue;
      if (runwayOccupied(airport, id, [a], "") && runwayOccupied(airport, id, exercise.aircraft, a.id)) {
        risks.set(`runway:${id}`, {kind: "runway", aircraftId: a.id, label: `Runway occupancy conflict · ${id}`});
      }
    }
  }
  return risks;
}

function observe(exercise: Exercise, previous: Exercise, runtime: EndlessRuntime, now: number) {
  const risks = incidentKeys(exercise, runtime);
  const known = new Set(runtime.incidents);
  for (const [key, event] of risks) if (!known.has(key)) {
    if (event.kind === "separation") runtime.counts.separation++;
    else runtime.counts.runway++;
    mark(runtime, exercise, event);
  }
  runtime.incidents = [...risks.keys()];
  const prior = new Set(runtime.collisionIds);
  const impacted = new Set<string>();
  for (const event of exercise.collisions ?? []) if (!prior.has(event.id)) {
    for (const a of event.aircraft) impacted.add(a.id);
    if (event.kind === "terrain") runtime.counts.terrain++;
    else runtime.counts.collisions++;
    mark(runtime, exercise, {kind: event.kind === "terrain" ? "terrain" : "collision",
      aircraftId: event.aircraft[0]?.id, label: event.aircraft.map(a => a.callsign).join(" / ")});
  }

  runtime.collisionIds = exercise.collisions?.map(event => event.id) ?? [];
  const {scenario} = runtime, airport = getAirport(exercise), mode = scenario.definition.mode;
  // Rollout can remove radar arrivals directly in the engine. Preserve their pre-tick identity for completion accounting.
  const live = new Map(exercise.aircraft.map(a => [a.id, a]));
  const parking = mode === "local" ? gatesFor(airport).map(g => standPlacement(g.id, false, airport)!.position) : [];
  for (const old of previous.aircraft) {
    const track = runtime.traffic[old.id];
    if (!track) continue;
    const a = live.get(old.id), stream = scenario.streams[track.stream];
    const complete = (label: string) => {
      runtime.counts.completed++;
      mark(runtime, exercise, {kind: "complete", aircraftId: old.id, label: `${old.callsign} · ${label}`});
      track.completedAt = exercise.elapsed;
    };
    if (impacted.has(old.id)) {
      runtime.counts.unresolved++;
      live.delete(old.id);
      delete runtime.traffic[old.id];
      continue;
    }
    if (track.completedAt !== undefined) {
      if (!a || exercise.elapsed - track.completedAt >= 8) {
        live.delete(old.id);
        delete runtime.traffic[old.id];
      }
      continue;
    }

    if (mode === "local") {
      if (a && stream.definition.kind === "pattern" && (a.circuit ?? 0) >= 2 && a.landing === "touch-and-go" && !a.clearedToLand) {
        a.landing = "full-stop";
        a.automaticRequest = "inbound-land";
      }
      if (a && stream.definition.kind === "departure" && a.leavingCircuit && a.altitude > airport.elevation + 300 && nmBetween(a.position, {x: 0, y: 0}) >= 5) complete("Departed");
      if (a?.mode === "parked" && stream.definition.kind !== "departure" && parking.some(stand => nmBetween(a.position, stand) < .015)) complete("Parked");
    } else if (a) {
      if (scenario.boundary && insideSector(scenario.boundary, a.position)) track.entered = true;
      const neighbour = scenario.neighbours.find(f => f.id === a.facilityId && f.type === a.frequency);
      const validTerminal = neighbour && neighbour.airport === stream.definition.destination;
      const outbound = stream.definition.kind === "departure";
      let accepted = false;
      const correctCenter = neighbour && insideAirspace(neighbour.boundary, airport.origin.lat + stream.destination.y / 60,
        airport.origin.lon + stream.destination.x / (60 * Math.cos(airport.origin.lat * Math.PI / 180)));
      if (neighbour && outbound && neighbour.type === "center")
        accepted = scenario.boundary ? !!correctCenter && track.entered && distanceToSector(scenario.boundary, a.position) <= 25
          : nmBetween(a.position, {x: 0, y: 0}) >= 20 && a.altitude >= 5000;
      if (mode === "approach" && neighbour?.type === "tower" && validTerminal && !outbound)
        accepted = !!a.radar?.cleared && (!!a.radar.captured || a.radar.patternJoin?.status === "established");
      if (mode === "center" && neighbour?.type === "approach" && validTerminal && !outbound)
        accepted = track.entered && nmBetween(a.position, stream.destination) <= (stream.definition.kind === "intra-sector" ? 30 : 60) && a.altitude <= 20000;
      if (accepted && !track.transfer) {
        track.transfer = neighbour!.id;
        mark(runtime, exercise, {kind: "transfer", aircraftId: a.id, label: `${a.callsign} · ${neighbour!.name}`});
        if (mode === "center" || outbound) complete("Handoff accepted");
      }
      if (track.transfer && mode === "approach" && !outbound && (a.radar?.arrival?.phase === "vacated" || !a.active && a.radar?.arrival)) complete("Runway vacated");
      if (track.transfer && a.radar?.navigation === "missed" && !a.radar.arrival) {
        a.frequency = "approach";
        delete a.facilityId;
        a.radar.transferred = false;
        a.radar.report = "missed";
        delete track.transfer;
      }
      if (neighbour && !accepted && !track.transfer) {
        a.frequency = mode;
        delete a.facilityId;
        if (a.radar) a.radar.transferred = false;
        exercise.messages.push({id: `${a.id}:return:${exercise.revision}`, aircraftId: a.id, time: now,
          frequency: mode, sender: "pilot", text: `${a.callsign}, unable handoff at this position or altitude, back with you.`, read: false});
        exercise.messages = trimMessages(exercise);
      }
    } else if (mode === "approach" && track.transfer && old.radar?.arrival) complete("Runway vacated");
    if (track.completedAt !== undefined) continue;
    const outside = a && (nmBetween(a.position, {x: 0, y: 0}) > (mode === "local" ? 25 : scenario.range + 10)
      || scenario.boundary && track.entered && !insideSector(scenario.boundary, a.position) && distanceToSector(scenario.boundary, a.position) > 40);
    if (!a || !a.active || outside) {
      runtime.counts.unresolved++;
      mark(runtime, exercise, {kind: "unresolved", aircraftId: old.id, label: `${old.callsign} · Left the exercise unresolved`});
      live.delete(old.id);
      delete runtime.traffic[old.id];
    }
  }
  exercise.aircraft = [...live.values()];
  if (exercise.callsignReservations && exercise.callsignReservations.length > 300) exercise.callsignReservations = exercise.callsignReservations.slice(-300);
  return exercise;
}

export function advanceEndless(exercise: Exercise, runtime: EndlessRuntime, seconds: number, now: number) {
  if (!exercise.running || runtime.ended || !runtime.started || seconds <= 0) return exercise;
  const target = exercise.elapsed + seconds;
  while (target - exercise.elapsed > 1e-8) {
    const nextRelease = runtime.draining ? Infinity : Math.min(...runtime.cursors);
    const step = Math.max(0, Math.min(.25, target - exercise.elapsed, nextRelease - exercise.elapsed));
    if (step > 1e-8) {
      const previous = exercise;
      exercise = observe(advance(exercise, step), previous, runtime, now);
    }
    if (nextRelease <= exercise.elapsed + 1e-8) {
      runtime.cursors.forEach((due, index) => {
        if (due > exercise.elapsed + 1e-8) return;
        exercise = release(exercise, runtime, index, now);
        runtime.cursors[index] += runtime.scenario.streams[index].interval;
      });
    } else if (step <= 1e-8) break;
  }
  return exercise;
}
