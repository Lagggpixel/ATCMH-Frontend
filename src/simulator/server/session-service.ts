import {randomUUID} from "node:crypto";
import {advance, applyEnvelope, autoReadbacks, initialExercise, restoreExercise} from "../engine";
import {menteeActionAllowed} from "../protocol";
import type {Envelope, Exercise} from "../model";
import {SESSION_LEASE_MS, SessionError, type SessionRole, type SessionSummary} from "../sessions";
import {advanceScenario, executeScenarioEvent} from "../scenario-engine";
import {scenarioStaffView, type ScenarioRuntime} from "../scenarios";

export interface Actor {accountId: string; staff: boolean; displayName?: string}
export interface Seat {token: string; accountId: string; expiresAt: number; displayName?: string}
export interface SessionRecord {
  id: string; ownerId: string; ownerName?: string; title: string; createdAt: number; updatedAt: number;
  tickAt: number; contentRevision: number; exercise: Exercise;
  staff: Seat | null; mentee: Seat | null;
  scenario?: ScenarioRuntime;
}
export interface SessionStore {
  autoReadback(accountId: string): Promise<boolean | undefined>;
  saveAutoReadback(accountId: string, enabled: boolean, now: number): Promise<void>;
  list(now: number): Promise<SessionSummary[]>;
  create(record: SessionRecord): Promise<void>;
  transaction<T>(id: string, run: (record: SessionRecord) => T | Promise<T>): Promise<T>;
  end(id: string, accountId: string, now: number): Promise<void>;
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
    ...(record.scenario ? {scenario: {title: record.scenario.definition.title, finished: record.scenario.finished}} : {})};
}
export class SessionService {
  constructor(private store: SessionStore, private now = Date.now, private uuid = randomUUID) {}
  private staff(actor: Actor) {if (!actor.staff) throw new SessionError("forbidden", "Moderator access is required.", 403);}
  private seat(record: SessionRecord, actor: Actor, role: SessionRole, token: string, now: number) {
    if (role === "staff") this.staff(actor);
    const seat = record[role];
    if (!seat || seat.token !== token || seat.accountId !== actor.accountId || seat.expiresAt <= now)
      throw new SessionError("seat-lost", "This page no longer holds its seat. Return to the session and join again.", 409);
    seat.expiresAt = now + SESSION_LEASE_MS;
  }
  private view(record: SessionRecord, role: SessionRole, now: number) {
    return {session: summary(record, now), exercise: record.exercise, contentRevision: record.contentRevision,
      ...(record.scenario && role === "staff" ? {scenario: scenarioStaffView(record.scenario)} : {})};
  }
  private tick(record: SessionRecord, now: number) {
    const occupied = [record.staff, record.mentee].some(seat => seat && seat.expiresAt > now);
    const gap = (now - record.tickAt) / 1000;
    // No offline catch-up: the saved scenario resumes where the last page left it.
    if (occupied && gap > 0 && gap <= 2) {
      if (record.scenario) {
        const result = advanceScenario(record.exercise, record.scenario, gap, now);
        record.exercise = result.exercise; if (result.changed) record.contentRevision++;
      } else record.exercise = advance(record.exercise, gap);
      const replied = autoReadbacks(record.exercise, now, this.uuid);
      if (replied !== record.exercise) {record.exercise = replied; record.contentRevision++;}
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
    const record: SessionRecord = {id, ownerId: actor.accountId, ownerName: actor.displayName, title, createdAt: now, updatedAt: now,
      tickAt: now, contentRevision: 0, exercise, staff: null, mentee: null, ...(scenario ? {scenario} : {})};
    await this.store.create(record);
    return summary(record, now);
  }
  join(actor: Actor, id: string, role: SessionRole, token: string) {
    return this.store.transaction(id, record => {
      if (role === "staff") this.staff(actor);
      const now = this.now(), current = record[role];
      if (current && current.expiresAt > now && (current.token !== token || current.accountId !== actor.accountId))
        throw new SessionError("seat-occupied", `The ${role === "staff" ? "control" : "mentee"} page is already open. Close the existing page before joining here.`, 409);
      this.tick(record, now);
      record[role] = {token, accountId: actor.accountId, displayName: actor.displayName, expiresAt: now + SESSION_LEASE_MS};
      record.updatedAt = now;
      return this.view(record, role, now);
    });
  }
  frame(actor: Actor, id: string, role: SessionRole, token: string) {
    return this.store.transaction(id, record => {
      const now = this.now();
      this.seat(record, actor, role, token, now); this.tick(record, now);
      record.updatedAt = now;
      return this.view(record, role, now);
    });
  }
  dispatch(actor: Actor, id: string, role: SessionRole, token: string, envelope: Envelope) {
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
      record.exercise = result.state; record.updatedAt = now;
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
}
