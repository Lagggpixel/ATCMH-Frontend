import {getAirport} from "../airports";
import {applySessionWeather, requestSessionWeather, type SessionWeatherLoader} from "./session-weather";
import {randomUUID} from "node:crypto";
import {advance, applyEnvelope, autoReadbacks, initialExercise, restoreExercise} from "../engine";
import {menteeActionAllowed} from "../protocol";
import type {Envelope, Exercise} from "../model";
import {SESSION_FRAME_MS, SESSION_LEASE_MS, SessionError, type AssignedSession, type SessionPreview, type SessionRole, type SessionSummary} from "../sessions";
import {advanceScenario, executeScenarioEvent} from "../scenario-engine";
import {scenarioStaffView, type ScenarioRuntime} from "../scenarios";
import {terrainImpacts, type TerrainImpactProvider} from "./terrain-impacts";
import {airportSightings, type SightingProvider} from "./airport-sightings";

/** simulatorAccess is false only for a signed-in user admitted solely as an assigned mentee. */
export interface Actor {accountId: string; staff: boolean; displayName?: string; discordId?: string; simulatorAccess?: boolean; canAssign?: boolean}
export interface Seat {token: string; accountId: string; expiresAt: number; displayName?: string; discordId?: string}
export interface SessionAssignment {discordId: string; name?: string; assignedAt: number; assignedBy: string; assignedByName?: string}
export interface SessionLookup {id: string; title: string; airport: string; ownerName?: string; assignedDiscordId?: string}
export interface SessionRecord {
  id: string; ownerId: string; ownerName?: string; title: string; createdAt: number; updatedAt: number;
  tickAt: number; contentRevision: number; exercise: Exercise;
  staff: Seat | null; mentee: Seat | null;
  scenario?: ScenarioRuntime;
  assignment?: SessionAssignment | null;
}
export interface SessionStore {
  autoReadback(accountId: string): Promise<boolean | undefined>;
  saveAutoReadback(accountId: string, enabled: boolean, now: number): Promise<void>;
  list(now: number): Promise<SessionSummary[]>;
  create(record: SessionRecord): Promise<void>;
  transaction<T>(id: string, run: (record: SessionRecord) => T | Promise<T>): Promise<T>;
  end(id: string, accountId: string, now: number): Promise<void>;
  assigned(discordId: string, now: number): Promise<AssignedSession[]>;
  hasAssignment(discordId: string): Promise<boolean>;
  lookup(entry: {code: string} | {id: string}): Promise<SessionLookup | null>;
}
/** An assignment reserves the mentee seat; without one, only users with Sweatbox access may take it. */
export function menteeAccess(record: Pick<SessionRecord, "assignment">, actor: Actor) {
  const assigned = record.assignment?.discordId;
  if (assigned ? assigned !== actor.discordId : actor.simulatorAccess === false)
    throw new SessionError("not-assigned", assigned ? "This session is assigned to another mentee." : "This session isn't assigned to you. Ask your mentor to assign it to you.", 403);
}
export function availableControl(record: SessionRecord, actor: Actor, now: number) {
  if (record.staff && record.staff.expiresAt > now && record.staff.accountId !== actor.accountId)
    throw new SessionError("seat-occupied", "Another staff member is controlling this session. Wait until they leave before changing the attempt or ending it.", 409);
}
export function summary(record: SessionRecord, now: number): SessionSummary {
  return {id: record.id, airport: record.exercise.airport ?? "EGPH", airportDataVersion: record.exercise.airportDataVersion, trainingStation: record.exercise.trainingStation, ownerId: record.ownerId, ownerName: record.ownerName, title: record.title, createdAt: record.createdAt, updatedAt: record.updatedAt,
    ...(record.staff && record.staff.expiresAt > now ? {staffId: record.staff.accountId, staffName: record.staff.displayName} : {}),
    ...(record.mentee && record.mentee.expiresAt > now ? {menteeId: record.mentee.accountId, menteeName: record.mentee.displayName} : {}),
    staffOccupied: !!record.staff && record.staff.expiresAt > now, menteeOccupied: !!record.mentee && record.mentee.expiresAt > now,
    ...(record.scenario ? {scenario: {title: record.scenario.definition.title, finished: record.scenario.finished}} : {}),
    ...(record.assignment ? {assignedMenteeId: record.assignment.discordId, assignedMenteeName: record.assignment.name} : {})};
}
export class SessionService {
  constructor(private store: SessionStore, private now = Date.now, private uuid = randomUUID, private sightings: SightingProvider = airportSightings, private terrain: TerrainImpactProvider = terrainImpacts, private weather?: SessionWeatherLoader) {}
  private staff(actor: Actor) {if (!actor.staff) throw new SessionError("forbidden", "Moderator access is required.", 403);}
  private seat(record: SessionRecord, actor: Actor, role: SessionRole, token: string, now: number) {
    if (role === "staff") this.staff(actor); else menteeAccess(record, actor);
    const seat = record[role];
    if (!seat || seat.token !== token || seat.accountId !== actor.accountId || seat.expiresAt <= now)
      throw new SessionError("seat-lost", "This page no longer holds its seat. Return to the session and join again.", 409);
    seat.expiresAt = now + SESSION_LEASE_MS;
  }
  private view(record: SessionRecord, role: SessionRole, now: number) {
    const exercise = role === "staff" ? record.exercise : {...record.exercise, aircraft: record.exercise.aircraft.map(a => {
      if (!a.radar?.missedReason) return a;
      const radar = {...a.radar}; delete radar.missedReason; return {...a, radar};
    }), messages: record.exercise.messages.map(message => {
      const visible = {...message};
      delete visible.unableReason;
      return visible;
    })};
    if (role === "mentee") delete exercise.callsignReservations;
    if (role === "mentee") delete exercise.conflicts;
    return {session: summary(record, now), exercise, contentRevision: record.contentRevision,
      ...(record.scenario && role === "staff" ? {scenario: scenarioStaffView(record.scenario)} : {})};
  }
  private tick(record: SessionRecord, now: number) {
    if (this.terrain.apply(record.exercise)) record.contentRevision++;
    const occupied = [record.staff, record.mentee].some(seat => seat && seat.expiresAt > now);
    const gap = (now - record.tickAt) / 1000;
    // Recover delayed connected updates, but never simulate an offline interval.
    if (occupied && gap > 0 && gap <= SESSION_LEASE_MS / 1000) {
      this.sightings.apply(record.exercise);
      const collision = record.exercise.collisions?.at(-1)?.id;
      // Match ordinary stream cadence so engine caps cannot discard time and
      // scenario events/readbacks take effect before later movement is simulated.
      for (let at = record.tickAt; at < now;) {
        const stepAt = Math.min(at + SESSION_FRAME_MS, now), seconds = (stepAt - at) / 1000;
        if (record.scenario) {
          const result = advanceScenario(record.exercise, record.scenario, seconds, stepAt);
          record.exercise = result.exercise; if (result.changed) record.contentRevision++;
        } else record.exercise = advance(record.exercise, seconds);
        const replied = autoReadbacks(record.exercise, stepAt, this.uuid);
        if (replied !== record.exercise) {record.exercise = replied; record.contentRevision++;}
        at = stepAt;
      }
      if (record.exercise.collisions?.at(-1)?.id !== collision) record.contentRevision++;
    }
    record.tickAt = now;
  }
  list(actor: Actor) {this.staff(actor); return this.store.list(this.now());}
  async create(actor: Actor, title: string, imported?: Exercise, scenario?: ScenarioRuntime) {
    this.staff(actor);
    const now = this.now(), id = this.uuid();
    let exercise = imported ? {...restoreExercise(imported), id} : initialExercise(id);
    // Every new session starts automatic, including imported/scenario exercises.
    // Rejoining an existing session still retains its explicit staff choice.
    exercise = applyEnvelope(exercise, {id: this.uuid(), time: now, action: {kind: "auto-readback", enabled: true}}).state;
    exercise = applySessionWeather(exercise, await requestSessionWeather(getAirport(exercise).icao, this.weather));
    const record: SessionRecord = {id, ownerId: actor.accountId, ownerName: actor.displayName, title, createdAt: now, updatedAt: now,
      tickAt: now, contentRevision: 0, exercise, staff: null, mentee: null, ...(scenario ? {scenario} : {})};
    await this.store.create(record);
    return summary(record, now);
  }
  join(actor: Actor, id: string, role: SessionRole, token: string) {
    return this.store.transaction(id, record => {
      if (role === "staff") this.staff(actor); else menteeAccess(record, actor);
      const now = this.now(), current = record[role];
      if (current && current.expiresAt > now && (current.token !== token || current.accountId !== actor.accountId))
        throw new SessionError("seat-occupied", `The ${role === "staff" ? "control" : "mentee"} page is already open. Close the existing page before joining here.`, 409);
      this.tick(record, now);
      record[role] = {token, accountId: actor.accountId, displayName: actor.displayName, expiresAt: now + SESSION_LEASE_MS, ...(actor.discordId ? {discordId: actor.discordId} : {})};
      record.updatedAt = now;
      return this.view(record, role, now);
    });
  }
  async frame(actor: Actor, id: string, role: SessionRole, token: string) {
    const view = await this.store.transaction(id, record => {
      const now = this.now();
      this.seat(record, actor, role, token, now); this.tick(record, now);
      record.updatedAt = now;
      return this.view(record, role, now);
    });
    this.sightings.request(view.exercise);
    this.terrain.request(view.exercise);
    return view;
  }
  async dispatch(actor: Actor, id: string, role: SessionRole, token: string, envelope: Envelope) {
    let report: Awaited<ReturnType<typeof requestSessionWeather>>;
    if (envelope.action.kind === "reset" && this.weather) {
      const airport = await this.store.transaction(id, record => {this.staff(actor); this.seat(record, actor, role, token, this.now()); return getAirport(record.exercise).icao;});
      report = await requestSessionWeather(airport, this.weather);
    }
    return this.store.transaction(id, async record => {
      const now = this.now(); this.seat(record, actor, role, token, now);
      if (role === "mentee" && !menteeActionAllowed(envelope.action, record.exercise)) throw new SessionError("forbidden", "This action is unavailable for this training mode or frequency.", 403);
      if (role === "mentee" && record.exercise.pausedByStaff) throw new SessionError("paused", "Staff has paused this exercise.", 409);
      this.tick(record, now);
      if (record.scenario?.finished) throw new SessionError("attempt-finished", "This attempt is finished. Create a new session from Sessions.", 409);
      if (record.scenario && envelope.action.kind === "reset") throw new SessionError("scenario-reset", "Use Restart attempt to restore the published scenario.", 409);
      const result = applyEnvelope(record.exercise, {...envelope, time: now});
      if (result.error) throw new SessionError("invalid-command", result.error, 422);
      if (result.state !== record.exercise) record.contentRevision++;
      record.exercise = envelope.action.kind === "reset" && result.state !== record.exercise ? applySessionWeather(result.state, report) : result.state; record.updatedAt = now;
      if (record.scenario && envelope.action.kind === "play") {
        const result = advanceScenario(record.exercise, record.scenario, 0, now);
        record.exercise = result.exercise; if (result.changed) record.contentRevision++;
      }
      return {revision: record.exercise.revision};
    });
  }
  event(actor: Actor, id: string, token: string, eventId: string, decision: "run" | "retry" | "skip") {
    return this.store.transaction(id, record => {
      const now = this.now(); this.seat(record, actor, "staff", token, now); this.tick(record, now);
      const runtime = record.scenario, state = runtime?.events[eventId];
      if (!runtime || !state || runtime.finished) throw new SessionError("not-found", "Event unavailable.", 404);
      if (["completed", "skipped"].includes(state.status)) return {revision: record.exercise.revision};
      if (decision === "skip") runtime.events[eventId] = {status: "skipped", completedAt: record.exercise.elapsed};
      else {
        if (!record.exercise.running) throw new SessionError("paused", "Resume the exercise before running events.", 409);
        if (decision === "retry" && state.status !== "blocked") throw new SessionError("invalid-event", "Only blocked events can be retried.", 409);
        if (decision === "run" && runtime.definition.events.find(e => e.id === eventId)?.trigger.type !== "manual") throw new SessionError("invalid-event", "Only manual events can be released early.", 409);
        record.exercise = executeScenarioEvent(record.exercise, runtime, eventId, now);
      }
      record.contentRevision++; return {revision: record.exercise.revision};
    });
  }
  leave(actor: Actor, id: string, role: SessionRole, token: string) {
    return this.store.transaction(id, record => {
      if (record[role]?.token === token && record[role]?.accountId === actor.accountId) {
        this.tick(record, this.now()); record[role] = null;
      }
    });
  }
  end(actor: Actor, id: string) {this.staff(actor); return this.store.end(id, actor.accountId, this.now());}
  async assign(actor: Actor, id: string, mentee: {discordId: string; name?: string} | null) {
    this.staff(actor);
    if (!actor.canAssign) throw new SessionError("forbidden", "Only mentors with Sweatbox access or administrators can assign mentees.", 403);
    return this.store.transaction(id, record => {
      const now = this.now(), previous = record.assignment?.discordId, changed = previous !== mentee?.discordId;
      if (!changed && mentee && record.assignment) record.assignment = {...record.assignment, ...(mentee.name ? {name: mentee.name} : {})};
      else record.assignment = mentee ? {discordId: mentee.discordId, ...(mentee.name ? {name: mentee.name} : {}), assignedAt: now, assignedBy: actor.accountId, ...(actor.displayName ? {assignedByName: actor.displayName} : {})} : null;
      // A held mentee seat belongs to the new assignee or nobody.
      if (changed && record.mentee && (!mentee || record.mentee.discordId !== mentee.discordId)) {this.tick(record, now); record.mentee = null;}
      record.updatedAt = now;
      return {session: summary(record, now), changed};
    });
  }
  assigned(actor: Actor) {return actor.discordId ? this.store.assigned(actor.discordId, this.now()) : Promise.resolve([]);}
  async preview(actor: Actor, entry: {code: string} | {id: string}): Promise<SessionPreview> {
    const found = await this.store.lookup(entry);
    const missing = new SessionError("not-found", "No live session matches that code. Check it with your mentor.", 404);
    if (!found) throw missing;
    // Without Sweatbox access, a session not assigned to you is indistinguishable from no session.
    if (actor.simulatorAccess === false && (!actor.discordId || found.assignedDiscordId !== actor.discordId)) throw missing;
    menteeAccess({assignment: found.assignedDiscordId ? {discordId: found.assignedDiscordId, assignedAt: 0, assignedBy: ""} : null}, actor);
    return {id: found.id, title: found.title, airport: found.airport, ...(found.ownerName ? {trainerName: found.ownerName} : {}), assignedToYou: !!actor.discordId && found.assignedDiscordId === actor.discordId};
  }
}
