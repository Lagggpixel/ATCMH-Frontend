import {assignmentMatches, hasPositionAssignment, positionsForToken, heldWith, allPositionSeats, positionPresence, type PositionState} from "./position-state";
import {controllerPositionsSchema} from "../protocol";
import type {ControllerPosition} from "../positions";
import type {PositionAssignment} from "./position-state";
import {ownsAircraft} from "../positions";
import {facilities} from "../aviation";
import {getAirport} from "../airports";
import {applySessionWeather, requestSessionWeather, type SessionWeatherLoader} from "./session-weather";
import {randomUUID} from "node:crypto";
import {advance, applyEnvelope, autoReadbacks, initialExercise, restoreExercise} from "../engine";
import {menteeActionAllowed} from "../protocol";
import type {Envelope, Exercise} from "../model";
import {SESSION_FRAME_MS, SESSION_LEASE_MS, SessionError, type AssignedSession, type SessionMode, type SessionPreview, type SessionSummary} from "../sessions";
import {advanceScenario, executeScenarioEvent} from "../scenario-engine";
import {scenarioStaffView, type ScenarioRuntime} from "../scenarios";
import {terrainImpacts, type TerrainImpactProvider} from "./terrain-impacts";
import {airportSightings, type SightingProvider} from "./airport-sightings";
import {demoPresenter} from "../demonstration";
import {prepareSessionSpeech, sessionSpeechTexts} from "./speech-preparation";

/** simulatorAccess is false only for a signed-in user admitted solely as an assigned mentee; superAdmin may spectate. */
export interface Actor {accountId: string; staff: boolean; displayName?: string; discordId?: string; simulatorAccess?: boolean; canAssign?: boolean; superAdmin?: boolean}
export interface Seat {token: string; accountId: string; expiresAt: number; displayName?: string; discordId?: string}
export interface SessionAssignment {discordId: string; name?: string; assignedAt: number; assignedBy: string; assignedByName?: string}
export interface SessionLookup {id: string; title: string; airport: string; ownerName?: string; assignedDiscordId?: string}
export interface SessionRecord {
  id: string; ownerId: string; ownerName?: string; title: string; createdAt: number; updatedAt: number;
  tickAt: number; contentRevision: number; exercise: Exercise;
  staff: Seat | null; mentee: Seat | null;
  positionState?: Record<string, PositionState>;
  scenario?: ScenarioRuntime;
  assignment?: SessionAssignment | null;
}
export interface SessionStore {
  autoReadback(accountId: string): Promise<boolean | undefined>;
  saveAutoReadback(accountId: string, enabled: boolean, now: number): Promise<void>;
  list(now: number): Promise<SessionSummary[]>;
  create(record: SessionRecord): Promise<void>;
  read(id: string): Promise<SessionRecord>;
  transaction<T>(id: string, run: (record: SessionRecord) => T | Promise<T>): Promise<T>;
  end(id: string, accountId: string, now: number, feedback?: string): Promise<void>;
  assigned(discordId: string, now: number): Promise<AssignedSession[]>;
  hasAssignment(discordId: string): Promise<boolean>;
  lookup(entry: {code: string} | {id: string}): Promise<SessionLookup | null>;
}
/** An assignment reserves the mentee seat; without one, only users with Sweatbox access may take it. */
export function menteeAccess(record: Pick<SessionRecord, "assignment"> & Partial<Pick<SessionRecord, "positionState" | "exercise">>, actor: Actor) {
  if (record.exercise && hasPositionAssignment({...record, exercise: record.exercise}, actor)) return;
  if (record.exercise?.positions?.length && actor.simulatorAccess === false) throw new SessionError("not-assigned", "Ask your mentor to assign a controller position to you.", 403);
  const assigned = record.assignment?.discordId;
  if (assigned ? assigned !== actor.discordId : actor.simulatorAccess === false)
    throw new SessionError("not-assigned", assigned ? "This session is assigned to another mentee." : "This session isn't assigned to you. Ask your mentor to assign it to you.", 403);
}
export function assertSuperAdmin(actor: Actor) {
  if (!actor.staff || !actor.superAdmin) throw new SessionError("forbidden", "Only Superadmins can spectate sessions.", 403);
}
export function availableControl(record: SessionRecord, actor: Actor, now: number) {
  if (record.staff && record.staff.expiresAt > now && record.staff.accountId !== actor.accountId)
    throw new SessionError("seat-occupied", "Another staff member is controlling this session. Wait until they leave before changing the attempt or ending it.", 409);
}
export function summary(record: SessionRecord, now: number): SessionSummary {
  return {...(record.exercise.positions?.length ? {positions: positionPresence(record, now)} : {}), id: record.id, airport: record.exercise.airport ?? "EGPH", airportDataVersion: record.exercise.airportDataVersion, trainingStation: record.exercise.trainingStation, ownerId: record.ownerId, ownerName: record.ownerName, title: record.title, createdAt: record.createdAt, updatedAt: record.updatedAt,
    ...(record.staff && record.staff.expiresAt > now ? {staffId: record.staff.accountId, staffName: record.staff.displayName} : {}),
    ...(record.mentee && record.mentee.expiresAt > now ? {menteeId: record.mentee.accountId, menteeName: record.mentee.displayName} : {}),
    staffOccupied: !!record.staff && record.staff.expiresAt > now, menteeOccupied: !!record.mentee && record.mentee.expiresAt > now || allPositionSeats(record).some(s => s.expiresAt > now),
    ...(record.scenario ? {scenario: {title: record.scenario.definition.title, finished: record.scenario.finished}} : {}),
    ...(record.assignment ? {assignedMenteeId: record.assignment.discordId, assignedMenteeName: record.assignment.name} : {}),
    ...(record.scenario?.feedback ? {hasFeedback: true} : {})};
}
/** A spectator's demonstration is held by renewing `until` from their stream; a mentor's by the control seat. */
function demonstrationLive(record: SessionRecord, now: number) {
  const demonstration = record.exercise.demonstration;
  if (!demonstration) return false;
  return demonstration.spectator ? (demonstration.until ?? 0) > now : !!record.staff && record.staff.expiresAt > now;
}
export function endDemonstration(record: SessionRecord) {
  const exercise = {...record.exercise, revision: record.exercise.revision + 1};
  delete exercise.demonstration;
  record.exercise = exercise; record.contentRevision++;
}
export class SessionService {
  constructor(private store: SessionStore, private now = Date.now, private uuid = randomUUID, private sightings: SightingProvider = airportSightings, private terrain: TerrainImpactProvider = terrainImpacts, private weather?: SessionWeatherLoader, private prepareSpeech = prepareSessionSpeech) {}
  private staff(actor: Actor) {if (!actor.staff) throw new SessionError("forbidden", "Moderator access is required.", 403);}
  private seat(record: SessionRecord, actor: Actor, role: SessionMode, token: string, now: number) {
    if (role === "spectator") {assertSuperAdmin(actor); return;}
    if (role === "staff") this.staff(actor); else menteeAccess(record, actor);
    // A bandboxing seat holds several positions with one token; all of them are renewed together.
    const held = role === "mentee" ? positionsForToken(record, token) : [], positionId = held[0];
    const seat = positionId ? record.positionState?.[positionId].seat : record[role];
    if (!seat || seat.token !== token || seat.accountId !== actor.accountId || seat.expiresAt <= now)
      throw new SessionError("seat-lost", "This page no longer holds its seat. Return to the session and join again.", 409);
    if (held.some(id => record.positionState?.[id].assignment && !assignmentMatches(record.positionState[id].assignment, actor))) throw new SessionError("not-assigned", "This controller position is assigned to another trainee.", 403);
    if (role === "mentee" && record.exercise.positions?.length && !positionId) throw new SessionError("seat-lost", "Choose a controller position and rejoin.", 409);
    for (const id of held) record.positionState![id].seat!.expiresAt = now + SESSION_LEASE_MS;
    seat.expiresAt = now + SESSION_LEASE_MS;
  }
  private view(record: SessionRecord, role: SessionMode, now: number, positionIds: string[] = []) {
    const positionId = positionIds[0];
    const exercise = role !== "mentee" ? record.exercise : {...record.exercise, aircraft: record.exercise.aircraft.map(a => {
      if (!a.radar?.missedReason) return a;
      const radar = {...a.radar}; delete radar.missedReason; return {...a, radar};
    }), messages: record.exercise.messages.map(message => {
      const visible = {...message};
      delete visible.unableReason;
      return visible;
    })};
    if (role === "mentee" && exercise.demonstration) {
      const {byId: _byId, until: _until, ...demonstration} = exercise.demonstration;
      exercise.demonstration = demonstration;
    }
    if (role === "mentee") delete exercise.callsignReservations;
    if (role === "mentee") delete exercise.conflicts;
    const visible = {...exercise, positionPresence: positionPresence(record, now)};
    if (role === "mentee" && positionId) {
      visible.messages = exercise.messages.filter(m => m.positionId && positionIds.includes(m.positionId) || m.frequency === "atis");
      const feedback = Object.entries(exercise.positionFeedback ?? {}).filter(([id]) => positionIds.includes(id));
      visible.positionFeedback = feedback.length ? Object.fromEntries(feedback) : undefined;
    }
    return {session: summary(record, now), exercise: visible, ...(positionId ? {positionId, positionIds} : {}), contentRevision: record.contentRevision,
      ...(record.scenario && role !== "mentee" ? {scenario: scenarioStaffView(record.scenario)} : {})};
  }
  private tick(record: SessionRecord, now: number) {
    if (this.terrain.apply(record.exercise)) record.contentRevision++;
    const occupied = [record.staff, record.mentee, ...allPositionSeats(record)].some(seat => seat && seat.expiresAt > now);
    const lost = allPositionSeats(record).some(s => s.expiresAt <= now && s.expiresAt > record.tickAt);
    if (lost && record.exercise.running) {record.exercise = {...record.exercise, running: false, pausedByStaff: true, pauseVisibility: "visible", revision: record.exercise.revision + 1}; record.contentRevision++;}
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
    // A mentor or spectator who closes the page or loses the connection hands control back on their own.
    if (record.exercise.demonstration && !demonstrationLive(record, now)) endDemonstration(record);
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
  /** `requested` lists the positions a mentor wants to work (comma separated); `takeover` moves this account's own seat from another page. */
  async join(actor: Actor, id: string, role: SessionMode, token: string, requested?: string, takeover = false) {
    if (role === "spectator") return this.frame(actor, id, role, token);
    let speech: string[] = [];
    const view = await this.store.transaction(id, record => {
      if (role === "staff") this.staff(actor); else menteeAccess(record, actor);
      const now = this.now();
      const held = role === "mentee" ? this.chooseHeld(record, actor, token, now, requested) : [];
      const seats = held.length ? held.map(p => record.positionState?.[p]?.seat) : [record[role]];
      const current = seats.find(seat => seat && seat.expiresAt > now && (seat.token !== token || seat.accountId !== actor.accountId));
      if (current && !(takeover && current.accountId === actor.accountId)) {
        const holder = current.accountId === actor.accountId ? undefined : current.displayName;
        throw new SessionError(current.accountId === actor.accountId ? "seat-open-elsewhere" : "seat-occupied", current.accountId === actor.accountId
          ? "Your seat is open on another page. Only one page can hold it at a time."
          : `${holder ?? "Someone else"} has the ${role === "staff" ? "Mentor" : "Mentee"} seat. Only one person can hold a seat at a time.`, 409, undefined, {role, ...(holder ? {holder} : {})});
      }
      this.tick(record, now);
      const joined = {token, accountId: actor.accountId, displayName: actor.displayName, expiresAt: now + SESSION_LEASE_MS, ...(actor.discordId ? {discordId: actor.discordId} : {})};
      if (held.length) {
        record.positionState ??= {};
        // Moving or reshaping a bandbox: positions this account held on another page, or no longer requests, are released.
        for (const [positionId, state] of Object.entries(record.positionState)) if (state.seat?.accountId === actor.accountId && !held.includes(positionId)) state.seat = null;
        for (const positionId of held) record.positionState[positionId] = {...record.positionState[positionId], seat: {...joined}};
      } else record[role] = joined;
      record.updatedAt = now;
      speech = sessionSpeechTexts(record);
      return this.view(record, role, now, held);
    });
    this.prepareSpeech(actor.accountId, speech, process.env.FRONTEND_PUBLIC_ORIGIN ?? "atcmh");
    return view;
  }
  /**
   * The positions a mentee seat takes: every position assigned to this mentee, so an assignment to several is a bandbox.
   * Mentors work the open positions they ask for (several at once to bandbox them), or the first free one.
   */
  private chooseHeld(record: SessionRecord, actor: Actor, token: string, now: number, requested?: string) {
    const choices = record.exercise.positions ?? [];
    if (!choices.length) return [];
    const assigned = choices.filter(p => assignmentMatches(record.positionState?.[p.id]?.assignment, actor)).map(p => p.id);
    const open = choices.filter(p => !record.positionState?.[p.id]?.assignment).map(p => p.id);
    // Mentees always take everything assigned to them; only mentors pick positions.
    const asked = actor.staff ? requested?.split(",").filter(Boolean) ?? [] : [];
    if (asked.length) {
      if (asked.some(p => !assigned.includes(p) && !open.includes(p))) throw new SessionError("not-assigned", "You are not assigned to that controller position.", 403);
      // Asking for one assigned position still takes the whole assigned bandbox.
      return choices.map(p => p.id).filter(p => asked.includes(p) || assigned.includes(p));
    }
    if (assigned.length) return assigned;
    const free = open.find(p => {const seat = record.positionState?.[p]?.seat; return !seat || seat.expiresAt <= now || seat.token === token;});
    if (actor.staff && (free ?? open[0])) return [free ?? open[0]];
    throw new SessionError("not-assigned", "You are not assigned to that controller position.", 403);
  }
  async frame(actor: Actor, id: string, role: SessionMode, token: string) {
    if (role === "spectator") {
      assertSuperAdmin(actor);
      const record = await this.store.read(id), now = this.now();
      const occupied = [record.staff, record.mentee, ...allPositionSeats(record)].some(seat => seat && seat.expiresAt > now);
      // Observation never ticks, renews seats or keeps an idle session moving.
      if (!occupied) record.exercise = {...record.exercise, running: false};
      // A spectator holding the controller seat keeps it while their stream keeps asking.
      const demonstration = record.exercise.demonstration;
      if (demoPresenter(demonstration, role, actor.accountId) && (demonstration?.until ?? 0) - now < SESSION_LEASE_MS / 2)
        await this.store.transaction(id, current => {
          const held = current.exercise.demonstration;
          if (held && demoPresenter(held, role, actor.accountId)) current.exercise.demonstration = {...held, until: now + SESSION_LEASE_MS};
        });
      return this.view(record, role, now, positionsForToken(record, token));
    }
    const view = await this.store.transaction(id, record => {
      const now = this.now();
      this.seat(record, actor, role, token, now); this.tick(record, now);
      record.updatedAt = now;
      return this.view(record, role, now, positionsForToken(record, token));
    });
    this.sightings.request(view.exercise);
    this.terrain.request(view.exercise);
    return view;
  }
  async dispatch(actor: Actor, id: string, role: SessionMode, token: string, envelope: Envelope) {
    let report: Awaited<ReturnType<typeof requestSessionWeather>>;
    if (envelope.action.kind === "reset" && this.weather) {
      const airport = await this.store.transaction(id, record => {this.staff(actor); this.seat(record, actor, role, token, this.now()); return getAirport(record.exercise).icao;});
      report = await requestSessionWeather(airport, this.weather);
    }
    return this.store.transaction(id, async record => {
      const now = this.now(); this.seat(record, actor, role, token, now);
      const {action} = envelope;
      // A bandbox acts for all its positions; a demonstration acts for every position the demonstrated seat holds.
      const demonstrated = record.exercise.demonstration?.positionId;
      const acting = role === "mentee" ? positionsForToken(record, token) : demonstrated ? heldWith(record, demonstrated) : [];
      const actingPosition = acting[0];
      const sharedAtis = ["atis", "publish-atis", "weather"].includes(action.kind) && !!record.exercise.positions?.[0] && acting.includes(record.exercise.positions[0].id);
      if (record.exercise.positions?.length && role === "mentee" && ["atis", "publish-atis", "weather"].includes(action.kind) && !sharedAtis) throw new SessionError("forbidden", "The first controller position publishes the shared ATIS.", 403);
      if (!sharedAtis && record.exercise.positions?.length && (role === "mentee" || record.exercise.demonstration && action.kind === "command")) {
        if (!actingPosition || !("aircraftId" in action) || !(action.kind === "edit" && menteeActionAllowed(action, record.exercise)) && !ownsAircraft(record.exercise, record.exercise.aircraft.find(a => a.id === action.aircraftId) ?? {frequency: null}, acting)) throw new SessionError("forbidden", "This aircraft belongs to another controller position.", 403);
      }
      if (action.kind === "command" && action.command.type === "frequency" && action.command.targetPositionId) {
        const target = record.positionState?.[action.command.targetPositionId]?.seat;
        if (!target || target.expiresAt <= now) throw new SessionError("position-offline", "The receiving controller position is not connected.", 409);
        if (acting.includes(action.command.targetPositionId)) throw new SessionError("forbidden", "That position is already part of your bandbox.", 409);
      }
      if (action.kind === "play" && record.exercise.positions?.some(p => !record.positionState?.[p.id]?.seat || record.positionState[p.id].seat!.expiresAt <= now)) throw new SessionError("position-offline", "Connect every position, or combine positions, before starting.", 409);
      const current = record.exercise.demonstration;
      if (action.kind === "demonstrate") {
        if (role === "mentee") throw new SessionError("forbidden", "Only the mentor or a spectating Superadmin can demonstrate.", 403);
        const presenter = demoPresenter(current, role, actor.accountId);
        // One demonstrator at a time; the mentor can take back a spectator's demonstration, not the reverse.
        if (current && !presenter && (action.enabled || role === "spectator")) throw new SessionError("demonstrating", `${current.by ?? (current.spectator ? "A spectator" : "The mentor")} is demonstrating.`, 409);
        if (action.enabled && record.exercise.positions?.length && (!action.positionId || !record.exercise.positions.some(p => p.id === action.positionId))) throw new SessionError("position-required", "Choose the position to demonstrate.", 409);
        // Demonstrating any position of a bandbox demonstrates the whole bandbox, keyed by its primary position.
        if (action.enabled && action.positionId) envelope.action = {...action, positionId: heldWith(record, action.positionId)[0]};
        if (action.enabled && !current && !([record.mentee, ...allPositionSeats(record)].some(s => s && s.expiresAt > now))) throw new SessionError("no-mentee", "Wait for your mentee to join before demonstrating.", 409);
      }
      if (role === "mentee" && current && (!current.positionId || acting.includes(current.positionId))) throw new SessionError("demonstrating", current.spectator ? `${current.by ?? "A spectator"} is controlling. Your controls return when they hand back.` : "Your mentor is controlling. Your controls return when they hand back.", 409);
      // While demonstrating, the presenter's radio commands follow the mentee's rules so the demonstration is faithful.
      if (demoPresenter(current, role, actor.accountId) && action.kind === "command" && !menteeActionAllowed(action, record.exercise)) throw new SessionError("forbidden", "Mentees cannot send that on this frequency, so it cannot be demonstrated.", 403);
      if (role === "mentee" && !menteeActionAllowed(envelope.action, record.exercise)) throw new SessionError("forbidden", "This action is unavailable for this training mode or frequency.", 403);
      if (role === "mentee" && record.exercise.pausedByStaff) throw new SessionError("paused", "Staff has paused this exercise.", 409);
      this.tick(record, now);
      if (role === "mentee" && record.exercise.pausedByStaff) throw new SessionError("paused", "Staff has paused this exercise.", 409);
      if (record.scenario?.finished) throw new SessionError("attempt-finished", "This attempt is finished. Create a new session from Sessions.", 409);
      if (record.scenario && envelope.action.kind === "reset") throw new SessionError("scenario-reset", "Use Restart attempt to restore the published scenario.", 409);
      if (record.exercise.positions?.length && (role === "mentee" || record.exercise.demonstration && action.kind === "command") && "aircraftId" in action && !(action.kind === "edit" && menteeActionAllowed(action, record.exercise)) && !ownsAircraft(record.exercise, record.exercise.aircraft.find(a => a.id === action.aircraftId) ?? {frequency: null}, acting)) throw new SessionError("forbidden", "This aircraft has transferred to another controller position.", 403);
      const result = applyEnvelope(record.exercise, {...envelope, time: now});
      if (result.error) throw new SessionError("invalid-command", result.error, 422);
      const sent = result.state.messages.find(m => m.id === envelope.id && m.sender === "controller");
      if (sent && result.state !== record.exercise) {
        sent.actorId = actor.accountId; sent.actorName = actor.displayName;
        // Inside a bandbox the message belongs to the position that owns the aircraft, so a later split keeps its history.
        const owner = "aircraftId" in action ? record.exercise.aircraft.find(a => a.id === action.aircraftId)?.positionId : undefined;
        if (actingPosition) sent.positionId = owner && acting.includes(owner) ? owner : actingPosition;
      }
      if (result.state !== record.exercise) record.contentRevision++;
      record.exercise = envelope.action.kind === "reset" && result.state !== record.exercise ? applySessionWeather(result.state, report) : result.state; record.updatedAt = now;
      if (envelope.action.kind === "demonstrate" && record.exercise.demonstration && !current) record.exercise.demonstration = {...record.exercise.demonstration,
        ...(actor.displayName ? {by: actor.displayName.slice(0, 128)} : {}), byId: actor.accountId, ...(role === "spectator" ? {spectator: true, until: now + SESSION_LEASE_MS} : {})};
      if (record.scenario && envelope.action.kind === "play") {
        const result = advanceScenario(record.exercise, record.scenario, 0, now);
        record.exercise = result.exercise; if (result.changed) record.contentRevision++;
      }
      return {revision: record.exercise.revision};
    });
  }
  event(actor: Actor, id: string, token: string, eventId: string, decision: "run" | "retry" | "skip", role: "staff" | "spectator" = "staff") {
    return this.store.transaction(id, record => {
      const now = this.now(); this.seat(record, actor, role, token, now); this.tick(record, now);
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
  leave(actor: Actor, id: string, role: SessionMode, token: string) {
    if (role === "spectator") return this.leaveSpectating(actor, id);
    return this.store.transaction(id, record => {
      const held = role === "mentee" ? positionsForToken(record, token) : [];
      if (held.length && record.positionState?.[held[0]]?.seat?.accountId === actor.accountId) {
        this.tick(record, this.now()); for (const positionId of held) record.positionState[positionId].seat = null;
        if (record.exercise.running) {record.exercise = {...record.exercise, running: false, pausedByStaff: true, pauseVisibility: "visible", revision: record.exercise.revision + 1}; record.contentRevision++;}
        return;
      }
      if (record[role]?.token === token && record[role]?.accountId === actor.accountId) {
        this.tick(record, this.now()); record[role] = null;
        if (role === "staff" && record.exercise.demonstration && !record.exercise.demonstration.spectator) endDemonstration(record);
      }
    });
  }
  /** Spectators hold no seat; leaving only hands back a demonstration they were giving. */
  private async leaveSpectating(actor: Actor, id: string) {
    assertSuperAdmin(actor);
    if (!demoPresenter((await this.store.read(id)).exercise.demonstration, "spectator", actor.accountId)) return;
    await this.store.transaction(id, record => {if (demoPresenter(record.exercise.demonstration, "spectator", actor.accountId)) endDemonstration(record);});
  }
  end(actor: Actor, id: string, feedback?: string) {this.staff(actor); return this.store.end(id, actor.accountId, this.now(), feedback);}
  async assign(actor: Actor, id: string, mentee: {discordId: string; name?: string} | null) {
    this.staff(actor);
    if (!actor.canAssign) throw new SessionError("forbidden", "Only mentors with Sweatbox access or administrators can assign mentees.", 403);
    return this.store.transaction(id, record => {
      const now = this.now(), previous = record.assignment?.discordId, changed = previous !== mentee?.discordId;
      if (!changed && mentee && record.assignment) record.assignment = {...record.assignment, ...(mentee.name ? {name: mentee.name} : {})};
      else record.assignment = mentee ? {discordId: mentee.discordId, ...(mentee.name ? {name: mentee.name} : {}), assignedAt: now, assignedBy: actor.accountId, ...(actor.displayName ? {assignedByName: actor.displayName} : {})} : null;
      // A held mentee seat belongs to the new assignee or nobody.
      if (record.exercise.positions?.[0]) {record.positionState ??= {}; const id = record.exercise.positions[0].id; record.positionState[id] = {...record.positionState[id], assignment: record.assignment ?? undefined, seat: null}; record.assignment = undefined;}
      if (changed && record.mentee && (!mentee || record.mentee.discordId !== mentee.discordId)) {this.tick(record, now); record.mentee = null;}
      record.updatedAt = now;
      return {session: summary(record, now), changed};
    });
  }
  async configurePositions(actor: Actor, id: string, positions: ControllerPosition[]) {
    this.staff(actor);
    const parsed = controllerPositionsSchema.parse(positions);
    return this.store.transaction(id, record => {
      availableControl(record, actor, this.now());
      if (!record.exercise.trainingStation?.endsWith(":approach")) throw new SessionError("invalid-mode", "Splits currently require Approach training.", 409);
      if (record.exercise.running) throw new SessionError("paused", "Pause before changing controller positions.", 409);
      const channels = (record.exercise.radarEnvironment?.facilities ?? facilities).filter(f => f.airport === getAirport(record.exercise).icao && f.type === "approach");
      if (parsed.some(p => !channels.some(f => f.id === p.facilityId && f.mhz === p.mhz))) throw new SessionError("invalid-frequency", "Choose an Approach frequency at this airport.", 422);
      if (record.exercise.demonstration) throw new SessionError("demonstrating", "End the demonstration before changing positions.", 409);
      if (record.scenario) record.scenario.positionLayout = structuredClone(parsed);
      const keep = new Set(parsed.map(p => p.id));
      record.positionState = Object.fromEntries(parsed.map(p => [p.id, record.positionState?.[p.id] ?? {}]));
      record.exercise = {...record.exercise, positions: parsed, messages: record.exercise.messages.map(m => m.frequency === "approach" && !m.positionId ? {...m, positionId: parsed[0].id} : m), aircraft: record.exercise.aircraft.map(a => ({...a, ...(a.frequency === "approach" ? {positionId: a.positionId && keep.has(a.positionId) ? a.positionId : parsed[0].id} : {})})), revision: record.exercise.revision + 1};
      // The first position inherits a pre-existing single-trainee assignment.
      if (record.assignment && !record.positionState[parsed[0].id].assignment) record.positionState[parsed[0].id].assignment = record.assignment;
      record.exercise.messages = record.exercise.messages.map(m => {
        const aircraft = record.exercise.aircraft.find(a => a.id === m.aircraftId);
        const instruction = m.instruction;
        const invalidTarget = instruction?.type === "frequency" && instruction.targetPositionId && !parsed.some(p => p.id === instruction.targetPositionId && p.facilityId === instruction.facilityId && p.mhz === instruction.mhz);
        if (m.sender !== "controller" || !invalidTarget && (!m.positionId || m.positionId === aircraft?.positionId)) return m;
        const retired = {...m, acknowledged: true}; delete retired.autoReadbackAt; return retired;
      });
      if (record.exercise.radarEnvironment) record.exercise.radarEnvironment = {...record.exercise.radarEnvironment, facilityActivity: {...record.exercise.radarEnvironment.facilityActivity, ...Object.fromEntries(channels.map(f => [f.id, parsed.some(p => p.facilityId === f.id)]))}};
      record.assignment = undefined; record.mentee = null; record.contentRevision++; record.updatedAt = this.now();
      return summary(record, this.now());
    });
  }
  async assignPosition(actor: Actor, id: string, positionId: string, assignment: PositionAssignment | null, feedback?: string) {
    this.staff(actor);
    if (!actor.canAssign) throw new SessionError("forbidden", "Only mentors with Sweatbox access or administrators can assign positions.", 403);
    return this.store.transaction(id, record => {
      availableControl(record, actor, this.now());
      if (!record.exercise.positions?.some(p => p.id === positionId)) throw new SessionError("not-found", "Controller position is unavailable.", 404);
      record.positionState ??= {}; const previous = record.positionState[positionId] ?? {};
      const changed = previous.assignment?.accountId !== assignment?.accountId || previous.assignment?.discordId !== assignment?.discordId || previous.assignment?.name !== assignment?.name;
      // Assigning someone who is already connected adds the position to their bandbox at once, even mid-session.
      const now = this.now();
      const joined = assignment && Object.entries(record.positionState).find(([id, state]) => id !== positionId && state.seat && state.seat.expiresAt > now && assignmentMatches(assignment, state.seat))?.[1].seat;
      record.positionState[positionId] = {...previous, ...(feedback !== undefined ? {feedback} : {}), assignment: assignment ?? undefined, ...(changed ? {seat: joined ? {...joined} : null} : {})};
      if (changed && !joined && record.exercise.running) {record.exercise = {...record.exercise, running: false, pausedByStaff: true, pauseVisibility: "visible", revision: record.exercise.revision + 1}; record.contentRevision++;}
      if (feedback !== undefined) {record.exercise = {...record.exercise, positionFeedback: {...record.exercise.positionFeedback, [positionId]: feedback}, revision: record.exercise.revision + 1}; record.contentRevision++;}
      record.updatedAt = this.now(); return summary(record, this.now());
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
