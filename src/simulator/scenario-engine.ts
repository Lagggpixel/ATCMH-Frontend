import {pilotRequestSchema} from "./protocol";
import {reserveCallsigns} from "./callsigns";
import {advance, engineFor, distance} from "./engine";
import {getAirport} from "./airports";
import {catalogFor} from "./catalog";

import type {Exercise, Action} from "./model";
import {materializeAircraft, type ScenarioRuntime, type ScenarioEvent} from "./scenarios";

function conditionMet(event: ScenarioEvent, exercise: Exercise, runtime: ScenarioRuntime): boolean {
  if (event.trigger.type !== "condition") return false;
  const c = event.trigger.condition;
  if (c.type === "event") return runtime.events[c.eventId]?.status === "completed";
  const a = exercise.aircraft.find(a => a.id === runtime.aircraftIds[c.aircraftKey]);
  if (!a) return false;
  switch (c.type) {
    case "altitude": return Math.abs(a.altitude - c.altitude) <= 25;
    case "radar": return c.state === "captured" ? !!a.radar?.captured : c.state === "missed" ? a.radar?.navigation === "missed" : c.state === "transferred" ? !!a.radar?.transferred : !!a.radar && a.flightPlan.length > 0 && a.radar.routeIndex >= a.flightPlan.length;
    case "overhead": return !!exercise.autoReadback && a.mode === "heading" && a.transitionAltitude !== undefined && distance(a.position, {x: 0, y: 0}) <= c.radius;
    case "controller-position": return a.positionId === c.positionId && exercise.messages.some(m => m.aircraftId === a.id && m.positionId === c.positionId && m.sender === "pilot" && m.request?.id === "check-in" && !m.commandId);
    case "frequency": return a.frequency === c.frequency;
    case "hold": return a.holding && ["taxi", "lineup"].includes(a.mode);
    case "leg": return a.mode === "pattern" && a.leg === c.leg;
    case "position": return distance(a.position, c.point) <= c.radius;
  }
}
/** Atomic event batch: either every aircraft/message/action commits or none does. */

export function executeScenarioEvent(exercise: Exercise, runtime: ScenarioRuntime, eventId: string, now: number): Exercise {
  const {validateAssignment, applyEnvelope} = engineFor(exercise);
  const {pilotRequests, pilotRequestText, resolvePilotRequest} = catalogFor(getAirport(exercise), exercise.radarEnvironment, exercise.weather);
  const event = runtime.definition.events.find(e => e.id === eventId), state = runtime.events[eventId];
  if (!event || !state || ["completed", "skipped"].includes(state.status) || runtime.finished) return exercise;
  let next = exercise;
  try {
    for (let i = 0; i < event.actions.length; i++) {
      const spec = event.actions[i];
      let action: Action;
      if (spec.type === "note") continue;
      const aircraftId = runtime.aircraftIds[spec.aircraftKey];
      if (spec.type === "spawn") {
        const aircraft = materializeAircraft(runtime, spec.aircraftKey);
        // Old running attempts predate reservations. Trust only this immutable scenario seed.
        next = structuredClone(next); reserveCallsigns(next, [aircraft]);
        action = {kind: "spawn", aircraft};
      }
      else {
        const aircraft = next.aircraft.find(a => a.id === aircraftId);
        if (!aircraft) throw new Error("Target aircraft is not present. Spawn it first or skip this event.");
        if (spec.type === "remove") action = {kind: "remove", aircraftId};
        else if (spec.type === "maneuver") {
          const error = validateAssignment(aircraft, spec.instruction);
          if (error) throw new Error(error);
          action = {kind: "maneuver", aircraftId, command: spec.instruction};
        } else if (spec.type === "transmission") action = {kind: "pilot", aircraftId, text: `${aircraft.callsign}, ${spec.text}`};
        else {
          const request = resolvePilotRequest(spec);
          const legacyCircuitEntry = request?.id === "pattern-entry" && aircraft.frequency === "tower";
          if (!request || !legacyCircuitEntry && !pilotRequests(aircraft).some(r => r.id === request.id) || !["ground", "tower", "approach", "center","departure","unicom"].includes(aircraft.frequency ?? "")) throw new Error("This pilot request is unavailable on the aircraft's current frequency.");
          const groundRequest = request.phase === "ground";
          if (groundRequest && !["parked", "taxi", "lineup", "rollout"].includes(aircraft.mode)) throw new Error("This request requires ground traffic.");
          if (request.phase === "airborne" && !["heading", "pattern", "go-around"].includes(aircraft.mode)) throw new Error("Inbound requests require airborne traffic.");
          action = {kind: "pilot", aircraftId, text: pilotRequestText(aircraft, request, spec.runway, spec.remainingInPattern, {...spec, exercise: next}), request: pilotRequestSchema.parse({...spec,id:request.id})};
        }
      }
      const result = applyEnvelope(next, {id: `${runtime.generation}:${event.id}:${i}`, time: now, action}, {
        legacyPatternEntry: spec.type === "request" && action.kind === "pilot" && action.request?.id === "pattern-entry",
        suppressSpawnRequest: spec.type === "spawn" && runtime.definition.events.some(other =>
          (other.id === event.id || event.trigger.type === "time" && other.trigger.type === "time" && other.trigger.at === event.trigger.at) &&
          other.actions.some(candidate => (candidate.type === "request" || candidate.type === "transmission") && candidate.aircraftKey === spec.aircraftKey)),
      });
      if (result.error) throw new Error(result.error);
      next = result.state;
    }
    runtime.events[eventId] = {status: "completed", completedAt: exercise.elapsed};
    return next;
  } catch (reason) {
    runtime.events[eventId] = {...state, status: "blocked", error: (reason as Error).message};
    return exercise;
  }
}

function fireDue(exercise: Exercise, runtime: ScenarioRuntime, now: number): Exercise {
  // Multiple passes allow same-time dependencies without changing authored ordering.
  for (let pass = 0; pass <= runtime.definition.events.length; pass++) {
    let fired = false;
    for (const event of runtime.definition.events) {
      const state = runtime.events[event.id];
      if (!state || !["scheduled", "waiting"].includes(state.status)) continue;
      let due = event.trigger.type === "time" && exercise.elapsed + 1e-8 >= event.trigger.at;
      if (event.trigger.type === "condition") {
        if (state.conditionAt === undefined && conditionMet(event, exercise, runtime)) state.conditionAt = exercise.elapsed;
        due = state.conditionAt !== undefined && exercise.elapsed + 1e-8 >= state.conditionAt + event.trigger.delay;
      }
      if (due) {exercise = executeScenarioEvent(exercise, runtime, event.id, now); fired = true;}
    }
    if (!fired) break;
  }
  return exercise;
}
/** Simulation-time scheduling only. No browser timers and no offline catch-up. */

export function advanceScenario(exercise: Exercise, runtime: ScenarioRuntime, seconds: number, now: number): {exercise: Exercise; changed: boolean} {
  if (!exercise.running || runtime.finished) return {exercise, changed: false};
  const before = JSON.stringify(runtime.events);
  runtime.started = true;
  exercise = fireDue(exercise, runtime, now);
  let remaining = Math.max(0, Math.min(Number.isFinite(seconds) ? seconds : 0, 5));
  while (remaining > 1e-8) {
    let dt = Math.min(remaining, .1);
    for (const e of runtime.definition.events) if (["scheduled", "waiting"].includes(runtime.events[e.id].status)) {
      const at = e.trigger.type === "time" ? e.trigger.at : e.trigger.type === "condition" && runtime.events[e.id].conditionAt !== undefined ? runtime.events[e.id].conditionAt! + e.trigger.delay : Infinity;
      if (at > exercise.elapsed + 1e-8) dt = Math.min(dt, at - exercise.elapsed);
    }
    // Session weather can differ from the immutable template after METAR loading
    // or a staff edit. Use the same live context as Scope's motion prediction.
    exercise = advance(exercise, dt); remaining -= dt;
    exercise = fireDue(exercise, runtime, now);
  }
  return {exercise, changed: JSON.stringify(runtime.events) !== before};
}
