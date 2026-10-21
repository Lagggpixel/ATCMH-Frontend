import {randomUUID} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {queryReadOnly, withWriteTransaction} from "../../lib/db";
import {scenarioSchema, normalizeScenario, createScenarioExercise, scenarioFromExercise, type ScenarioRecord, type ScenarioDefinition} from "../scenarios";
import {SessionError} from "../sessions";
import {sqlSessionStore} from "./session-store";
import {availableControl, SessionService, type Actor} from "./session-service";
import {isRadarStation, rejectMovedRadar} from "./radar-moved";

interface ScenarioRow extends RowDataPacket {id: string; owner_id: string; owner_name: string | null; version: number; published_revision: number; updated_at: number; draft: string; published_definition?: string | null}
interface RevisionRow extends RowDataPacket {definition: string}
const unavailable = () => new SessionError("not-found", "This scenario is unavailable.", 404);
function staff(actor: Actor) {if (!actor.staff) throw new SessionError("forbidden", "Moderator access is required.", 403);}
const scenarioRecord = (r: ScenarioRow): ScenarioRecord => {
  const published = r.published_definition ? scenarioSchema.parse(JSON.parse(r.published_definition)) : undefined;
  return {id: r.id, ownerId: r.owner_id, ownerName: r.owner_name ?? undefined, version: r.version, publishedRevision: r.published_revision, updatedAt: Number(r.updated_at), draft: scenarioSchema.parse(JSON.parse(r.draft)), ...(published ? {published: {title: published.title, airport: published.airport, airportDataVersion: published.airportDataVersion, trainingStation: published.trainingStation}} : {})};
};

/** Authoring and scenario lifecycle mutations share the existing SQL transaction context with sessions. */
export class TrainingService {
  async scenarios(actor: Actor) {
    staff(actor);
    return (await queryReadOnly<ScenarioRow[]>("SELECT s.*,r.definition AS published_definition FROM simulator_scenarios s LEFT JOIN simulator_scenario_revisions r ON r.scenario_id=s.id AND r.revision=s.published_revision ORDER BY s.updated_at DESC")).map(scenarioRecord).filter(record => !isRadarStation(record.draft.trainingStation));
  }
  async scenario(actor: Actor, id: string) {
    staff(actor);
    const rows = await queryReadOnly<ScenarioRow[]>("SELECT * FROM simulator_scenarios WHERE id=?", [id]);
    if (!rows[0]) throw unavailable(); const record = scenarioRecord(rows[0]); rejectMovedRadar(record.draft); return record;
  }
  async save(actor: Actor, draft: ScenarioDefinition, id?: string, version?: number) {
    staff(actor); draft = normalizeScenario(scenarioSchema.parse(draft));
    rejectMovedRadar(draft);
    return withWriteTransaction(async connection => {
      if (id) {
        const [rows] = await connection.execute<ScenarioRow[]>("SELECT * FROM simulator_scenarios WHERE id=? FOR UPDATE", [id]);
        if (!rows[0]) throw unavailable();
        if (rows[0].version !== version) throw new SessionError("revision-conflict", "This draft changed in another page. Reload before saving.", 409);
        const previous = scenarioSchema.parse(JSON.parse(rows[0].draft));
        rejectMovedRadar(previous);
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
      rejectMovedRadar(record.exercise);
      return scenarioFromExercise(record.exercise, title);
    }).then(draft => this.save(actor, draft));
  }
  async publish(actor: Actor, id: string, version: number) {
    staff(actor);
    return withWriteTransaction(async connection => {
      const [rows] = await connection.execute<ScenarioRow[]>("SELECT * FROM simulator_scenarios WHERE id=? FOR UPDATE", [id]);
      if (!rows[0]) throw unavailable();
      const record = scenarioRecord(rows[0]);
      rejectMovedRadar(record.draft);
      if (record.version !== version) throw new SessionError("revision-conflict", "Save and reload the latest draft before publishing.", 409);
      const revision = record.publishedRevision + 1;
      await connection.execute("INSERT INTO simulator_scenario_revisions (scenario_id,revision,created_at,definition) VALUES (?,?,?,?)", [id, revision, Date.now(), JSON.stringify(record.draft)]);
      await connection.execute("UPDATE simulator_scenarios SET published_revision=?,version=version+1,updated_at=? WHERE id=?", [revision, Date.now(), id]);
      return this.scenario(actor, id);
    });
  }
  private async revision(actor: Actor, scenarioId: string, revision: number) {
    await this.scenario(actor, scenarioId);
    const rows = await queryReadOnly<RevisionRow[]>("SELECT definition FROM simulator_scenario_revisions WHERE scenario_id=? AND revision=?", [scenarioId, revision]);
    if (!rows[0]) throw unavailable(); return scenarioSchema.parse(JSON.parse(rows[0].definition));
  }
  private async launch(actor: Actor, definition: ScenarioDefinition, scenarioId: string, revision: number, requestId?: string) {
    rejectMovedRadar(definition);
    const attemptId = requestId ?? randomUUID(), generation = randomUUID();
    const created = createScenarioExercise(definition, "pending", generation);
    Object.assign(created.runtime, {scenarioId, revision, attemptId});
    const session = await new SessionService(sqlSessionStore).create(actor, definition.title, created.exercise, created.runtime);
    await withWriteTransaction(async connection => {
      await connection.execute("INSERT INTO simulator_attempts (id,owner_id,scenario_id,revision,session_id,started_at,status,feedback) VALUES (?,?,?,?,?,?, 'active','')", [attemptId, actor.accountId, scenarioId, revision, session.id, Date.now()]);
    });
    return {sessionId: session.id};
  }
  async launchScenario(actor: Actor, scenarioId: string, revision: number, requestId?: string) {
    staff(actor);
    return withWriteTransaction(async connection => {
      const [rows] = await connection.execute<ScenarioRow[]>("SELECT * FROM simulator_scenarios WHERE id=? FOR UPDATE", [scenarioId]);
      if (!rows[0]) throw unavailable();
      const definition = await this.revision(actor, scenarioId, revision);
      if (requestId) {
        const [attempts] = await connection.execute<(RowDataPacket & {owner_id: string; scenario_id: string; revision: number; session_id: string})[]>("SELECT owner_id,scenario_id,revision,session_id FROM simulator_attempts WHERE id=? FOR UPDATE", [requestId]);
        if (attempts[0]) {
          const previous = attempts[0];
          if (previous.owner_id !== actor.accountId || previous.scenario_id !== scenarioId || previous.revision !== revision)
            throw new SessionError("request-conflict", "This creation request was already used. Close the dialog and try again.", 409);
          return {sessionId: previous.session_id};
        }
      }
      return this.launch(actor, definition, scenarioId, revision, requestId);
    });
  }
  async finish(actor: Actor, sessionId: string, feedback: string, attemptId: string) {
    staff(actor);
    return withWriteTransaction(async connection => {
      return sqlSessionStore.transaction(sessionId, record => {
        if (!record.scenario?.attemptId) throw unavailable();
        rejectMovedRadar(record.exercise);
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
    return withWriteTransaction(async connection => {
      const value = await sqlSessionStore.transaction(sessionId, record => {
        if (!record.scenario?.attemptId) throw unavailable();
        rejectMovedRadar(record.exercise);
        availableControl(record, actor, Date.now());
        if (record.scenario.attemptId !== attemptId) throw new SessionError("stale-attempt", "This attempt has already been restarted. Refresh before continuing.", 409);
        if (record.scenario.finished) throw new SessionError("attempt-finished", "Create a new session from Sessions.", 409);
        const old = record.scenario, elapsed = record.exercise.elapsed, result = JSON.stringify({exercise: record.exercise, events: old.events});
        const created = createScenarioExercise(old.definition, sessionId, randomUUID());
        created.exercise.autoReadback = record.exercise.autoReadback ?? false;
        record.scenario = {...created.runtime, scenarioId: old.scenarioId, revision: old.revision, attemptId: randomUUID()};
        created.exercise.revision = record.exercise.revision + 1;
        record.exercise = created.exercise; record.tickAt = Date.now(); record.contentRevision++;
        return {old, elapsed, result, runtime: record.scenario};
      });
      await connection.execute("UPDATE simulator_attempts SET status='restarted',finished_at=?,elapsed=?,result=? WHERE id=? AND status='active'", [Date.now(), value.elapsed, value.result, value.old.attemptId!]);
      const r = value.runtime;
      await connection.execute("INSERT INTO simulator_attempts (id,owner_id,scenario_id,revision,session_id,started_at,status,feedback) VALUES (?,?,?,?,?,?, 'active','')", [r.attemptId!, actor.accountId, r.scenarioId!, r.revision!, sessionId, Date.now()]);
      return {sessionId};
    });
  }
}
