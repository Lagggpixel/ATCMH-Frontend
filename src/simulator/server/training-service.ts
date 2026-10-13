import {randomUUID} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {queryReadOnly, withWriteTransaction} from "../../lib/db";
import {scenarioSchema, normalizeScenario, createScenarioExercise, scenarioFromExercise, type ScenarioRecord, type AssignmentSummary, type AttemptSummary, type ScenarioDefinition} from "../scenarios";
import {SessionError} from "../sessions";
import {sqlSessionStore} from "./session-store";
import {availableControl, SessionService, type Actor} from "./session-service";

interface ScenarioRow extends RowDataPacket {id: string; owner_id: string; owner_name: string | null; version: number; published_revision: number; updated_at: number; draft: string; published_definition?: string | null}
interface RevisionRow extends RowDataPacket {definition: string}
interface AssignmentRow extends RowDataPacket {id: string; owner_id: string; owner_name: string | null; learner_id: string; scenario_id: string; revision: number; due_at: number | null; max_attempts: number; definition: string}
interface AttemptRow extends RowDataPacket {id: string; session_id: string; started_at: number; finished_at: number | null; status: AttemptSummary["status"]; feedback: string; elapsed: number}
const unavailable = () => new SessionError("not-found", "This scenario or assignment is unavailable.", 404);
function staff(actor: Actor) {if (!actor.staff) throw new SessionError("forbidden", "Moderator access is required.", 403);}
const scenarioRecord = (r: ScenarioRow): ScenarioRecord => {
  const published = r.published_definition ? scenarioSchema.parse(JSON.parse(r.published_definition)) : undefined;
  return {id: r.id, ownerId: r.owner_id, ownerName: r.owner_name ?? undefined, version: r.version, publishedRevision: r.published_revision, updatedAt: Number(r.updated_at), draft: scenarioSchema.parse(JSON.parse(r.draft)), ...(published ? {published: {title: published.title, airport: published.airport, airportDataVersion: published.airportDataVersion, trainingStation: published.trainingStation}} : {})};
};
const attemptSummary = (r: AttemptRow): AttemptSummary => ({id: r.id, sessionId: r.session_id, startedAt: Number(r.started_at), finishedAt: r.finished_at === null ? null : Number(r.finished_at), status: r.status, feedback: r.feedback, elapsed: Number(r.elapsed)});

/** Authoring/assignment mutations share the existing SQL transaction context with sessions. */
export class TrainingService {
  async scenarios(actor: Actor) {
    staff(actor);
    return (await queryReadOnly<ScenarioRow[]>("SELECT s.*,r.definition AS published_definition FROM simulator_scenarios s LEFT JOIN simulator_scenario_revisions r ON r.scenario_id=s.id AND r.revision=s.published_revision ORDER BY s.updated_at DESC")).map(scenarioRecord);
  }
  async scenario(actor: Actor, id: string) {
    staff(actor);
    const rows = await queryReadOnly<ScenarioRow[]>("SELECT * FROM simulator_scenarios WHERE id=?", [id]);
    if (!rows[0]) throw unavailable(); return scenarioRecord(rows[0]);
  }
  async save(actor: Actor, draft: ScenarioDefinition, id?: string, version?: number) {
    staff(actor); draft = normalizeScenario(scenarioSchema.parse(draft));
    return withWriteTransaction(async connection => {
      if (id) {
        const [rows] = await connection.execute<ScenarioRow[]>("SELECT * FROM simulator_scenarios WHERE id=? FOR UPDATE", [id]);
        if (!rows[0]) throw unavailable();
        if (rows[0].version !== version) throw new SessionError("revision-conflict", "This draft changed in another page. Reload before saving.", 409);
        const previous = scenarioSchema.parse(JSON.parse(rows[0].draft));
        if (previous.airport !== draft.airport && (previous.aircraft.length || previous.events.length || draft.aircraft.length || draft.events.length)) throw new SessionError("invalid-scenario", "Clear traffic and events before changing the airport, or create a new scenario.", 400);
        await connection.execute("UPDATE simulator_scenarios SET draft=?,version=version+1,updated_at=? WHERE id=?", [JSON.stringify(draft), Date.now(), id]);
      } else {
        id = randomUUID();
        await connection.execute("INSERT INTO simulator_scenarios (id,owner_id,version,published_revision,updated_at,draft,owner_name) VALUES (?,?,1,0,?,?,?)", [id, actor.accountId, Date.now(), JSON.stringify(draft), actor.displayName ?? null]);
      }
      return this.scenario(actor, id);
    });
  }
  async capture(actor: Actor, sessionId: string, title: string) {
    staff(actor);
    return sqlSessionStore.transaction(sessionId, record => {
      return scenarioFromExercise(record.exercise, title);
    }).then(draft => this.save(actor, draft));
  }
  async publish(actor: Actor, id: string, version: number) {
    staff(actor);
    return withWriteTransaction(async connection => {
      const [rows] = await connection.execute<ScenarioRow[]>("SELECT * FROM simulator_scenarios WHERE id=? FOR UPDATE", [id]);
      if (!rows[0]) throw unavailable();
      const record = scenarioRecord(rows[0]);
      if (record.version !== version) throw new SessionError("revision-conflict", "Save and reload the latest draft before publishing.", 409);
      const revision = record.publishedRevision + 1;
      await connection.execute("INSERT INTO simulator_scenario_revisions (scenario_id,revision,created_at,definition) VALUES (?,?,?,?)", [id, revision, Date.now(), JSON.stringify(record.draft)]);
      await connection.execute("UPDATE simulator_scenarios SET published_revision=?,version=version+1,updated_at=? WHERE id=?", [revision, Date.now(), id]);
      return this.scenario(actor, id);
    });
  }
  async assignments(actor: Actor) {
    const rows = await queryReadOnly<AssignmentRow[]>(`SELECT a.*,r.definition FROM simulator_assignments a JOIN simulator_scenario_revisions r ON r.scenario_id=a.scenario_id AND r.revision=a.revision ${actor.staff ? "" : "WHERE a.learner_id=?"} ORDER BY a.created_at DESC`, actor.staff ? [] : [actor.accountId]);
    const result: AssignmentSummary[] = [];
    // One batched attempts query avoids a database round-trip per assignment.
    const attempts = rows.length ? await queryReadOnly<(AttemptRow & {assignment_id: string})[]>(`SELECT t.* FROM simulator_attempts t JOIN simulator_assignments a ON a.id=t.assignment_id ${actor.staff ? "" : "WHERE a.learner_id=?"} ORDER BY t.started_at`, actor.staff ? [] : [actor.accountId]) : [];
    for (const row of rows) {
      const definition = scenarioSchema.parse(JSON.parse(row.definition));
      result.push({airport: definition.airport, airportDataVersion: definition.airportDataVersion, trainingStation: definition.trainingStation, id: row.id, ownerId: row.owner_id, ownerName: row.owner_name ?? undefined, learnerId: row.learner_id, scenarioId: row.scenario_id, revision: row.revision, title: definition.title, briefing: definition.briefing, dueAt: row.due_at === null ? null : Number(row.due_at), maxAttempts: row.max_attempts, attempts: attempts.filter(t => t.assignment_id === row.id).map(attemptSummary)});
    }
    return result;
  }
  async assign(actor: Actor, value: {scenarioId: string; revision: number; learnerId: string; dueAt: number | null; maxAttempts: number}) {
    staff(actor);
    const scenario = await this.scenario(actor, value.scenarioId);
    if (value.revision < 1 || value.revision > scenario.publishedRevision) throw unavailable();
    const id = randomUUID();
    await withWriteTransaction(async connection => {
      await connection.execute("INSERT INTO simulator_assignments (id,owner_id,learner_id,scenario_id,revision,due_at,max_attempts,created_at,owner_name) VALUES (?,?,?,?,?,?,?,?,?)", [id, actor.accountId, value.learnerId, value.scenarioId, value.revision, value.dueAt, value.maxAttempts, Date.now(), actor.displayName ?? null]);
    });
    return {id};
  }
  private async revision(actor: Actor, scenarioId: string, revision: number) {
    await this.scenario(actor, scenarioId);
    const rows = await queryReadOnly<RevisionRow[]>("SELECT definition FROM simulator_scenario_revisions WHERE scenario_id=? AND revision=?", [scenarioId, revision]);
    if (!rows[0]) throw unavailable(); return scenarioSchema.parse(JSON.parse(rows[0].definition));
  }
  private async launch(actor: Actor, definition: ScenarioDefinition, scenarioId: string, revision: number, assignmentId?: string, learnerId?: string) {
    const attemptId = randomUUID(), generation = randomUUID();
    const created = createScenarioExercise(definition, "pending", generation);
    Object.assign(created.runtime, {scenarioId, revision, attemptId, assignmentId, learnerId});
    const session = await new SessionService(sqlSessionStore).create(actor, definition.title, created.exercise, created.runtime);
    await withWriteTransaction(async connection => {
      await connection.execute("INSERT INTO simulator_attempts (id,assignment_id,owner_id,learner_id,scenario_id,revision,session_id,started_at,status,feedback) VALUES (?,?,?,?,?,?,?,?, 'active','')", [attemptId, assignmentId ?? null, actor.accountId, learnerId ?? null, scenarioId, revision, session.id, Date.now()]);
    });
    return {sessionId: session.id};
  }
  async launchScenario(actor: Actor, scenarioId: string, revision: number, learnerId?: string) {
    staff(actor);
    const definition = await this.revision(actor, scenarioId, revision);
    return withWriteTransaction(() => this.launch(actor, definition, scenarioId, revision, undefined, learnerId));
  }
  async startAssignment(actor: Actor, id: string) {
    staff(actor);
    return withWriteTransaction(async connection => {
      const [rows] = await connection.execute<AssignmentRow[]>("SELECT a.*,r.definition FROM simulator_assignments a JOIN simulator_scenario_revisions r ON r.scenario_id=a.scenario_id AND r.revision=a.revision WHERE a.id=? FOR UPDATE", [id]);
      const a = rows[0]; if (!a) throw unavailable();
      const [attempts] = await connection.execute<AttemptRow[]>("SELECT * FROM simulator_attempts WHERE assignment_id=? ORDER BY started_at", [id]);
      const active = attempts.find(t => t.status === "active");
      if (active) return {sessionId: active.session_id};
      if (attempts.length >= a.max_attempts) throw new SessionError("attempt-limit", "This assignment has used all permitted attempts.", 409);
      return this.launch(actor, scenarioSchema.parse(JSON.parse(a.definition)), a.scenario_id, a.revision, id, a.learner_id);
    });
  }
  async finish(actor: Actor, sessionId: string, feedback: string, attemptId: string) {
    staff(actor);
    return withWriteTransaction(async connection => {
      return sqlSessionStore.transaction(sessionId, record => {
        if (!record.scenario?.attemptId) throw unavailable();
        availableControl(record, actor, Date.now());
        if (record.scenario.attemptId !== attemptId) throw new SessionError("stale-attempt", "This attempt has already been restarted. Refresh before continuing.", 409);
        if (record.scenario.finished) return {finished: true};
        record.scenario.finished = true; record.scenario.feedback = feedback;
        record.exercise = {...record.exercise, running: false, pausedByStaff: true, revision: record.exercise.revision + 1};
        record.contentRevision++; record.updatedAt = Date.now();
        return {finished: true, attemptId: record.scenario.attemptId, elapsed: record.exercise.elapsed, result: JSON.stringify({exercise: record.exercise, events: record.scenario.events})};
      }).then(async value => {
        if (value.attemptId) await connection.execute("UPDATE simulator_attempts SET status='finished',finished_at=?,feedback=?,elapsed=?,result=? WHERE id=? AND status='active'", [Date.now(), feedback, value.elapsed!, value.result!, value.attemptId]);
        return {finished: true};
      });
    });
  }
  async restart(actor: Actor, sessionId: string, attemptId: string) {
    staff(actor);
    // Lock assignment first (same order as Start) to serialize the attempt allowance.
    const metadata = await queryReadOnly<(RowDataPacket & {scenario_runtime: string | null})[]>("SELECT scenario_runtime FROM simulator_sessions WHERE id=?", [sessionId]);
    if (!metadata[0]?.scenario_runtime) throw unavailable();
    const assignmentId = JSON.parse(metadata[0].scenario_runtime).assignmentId as string | undefined;
    return withWriteTransaction(async connection => {
      if (assignmentId) {
        const [rows] = await connection.execute<AssignmentRow[]>("SELECT * FROM simulator_assignments WHERE id=? FOR UPDATE", [assignmentId]);
        if (!rows[0]) throw unavailable();
        const [attempts] = await connection.execute<AttemptRow[]>("SELECT * FROM simulator_attempts WHERE assignment_id=?", [assignmentId]);
        if (attempts.length >= rows[0].max_attempts) throw new SessionError("attempt-limit", "This assignment has used all permitted attempts.", 409);
      }
      const value = await sqlSessionStore.transaction(sessionId, record => {
        if (!record.scenario?.attemptId) throw unavailable();
        availableControl(record, actor, Date.now());
        if (record.scenario.attemptId !== attemptId) throw new SessionError("stale-attempt", "This attempt has already been restarted. Refresh before continuing.", 409);
        if (record.scenario.finished) throw new SessionError("attempt-finished", "Start a new attempt from assignments.", 409);
        const old = record.scenario, elapsed = record.exercise.elapsed, result = JSON.stringify({exercise: record.exercise, events: old.events});
        const created = createScenarioExercise(old.definition, sessionId, randomUUID());
        created.exercise.autoReadback = record.exercise.autoReadback ?? false;
        record.scenario = {...created.runtime, assignmentId: old.assignmentId, learnerId: old.learnerId, scenarioId: old.scenarioId, revision: old.revision, attemptId: randomUUID()};
        created.exercise.revision = record.exercise.revision + 1;
        record.exercise = created.exercise; record.tickAt = Date.now(); record.contentRevision++;
        return {old, elapsed, result, runtime: record.scenario};
      });
      await connection.execute("UPDATE simulator_attempts SET status='restarted',finished_at=?,elapsed=?,result=? WHERE id=? AND status='active'", [Date.now(), value.elapsed, value.result, value.old.attemptId!]);
      const r = value.runtime;
      await connection.execute("INSERT INTO simulator_attempts (id,assignment_id,owner_id,learner_id,scenario_id,revision,session_id,started_at,status,feedback) VALUES (?,?,?,?,?,?,?,?, 'active','')", [r.attemptId!, r.assignmentId ?? null, actor.accountId, r.learnerId ?? null, r.scenarioId!, r.revision!, sessionId, Date.now()]);
      return {sessionId};
    });
  }
}
