import type {RowDataPacket} from "mysql2/promise";
import {withWriteTransaction, afterWriteCommit} from "../../lib/simulator-db";
import {exerciseSchema} from "../protocol";
import type {ReplayParticipant} from "../replays";
import {SessionError} from "../sessions";
import type {Actor} from "./session-service";
import {notifyFeedback} from "./assignment-notifications";
import {rejectMovedRadar} from "./radar-moved";
interface ReplayRow extends RowDataPacket {id: string; attempt_id: string | null; owner_id: string; title: string; feedback?: string; last_state: string; participants: string}
interface LegacyRow extends RowDataPacket {owner_id: string; learner_id: string | null; feedback: string | null; result: string | null}

/** Changes only the current written feedback, leaving recorded aircraft and radio history intact. */
export async function updateReplayFeedback(id: string, actor: Actor, expected: string, feedback: string, notify = notifyFeedback) {
  if (!actor.staff) throw new SessionError("forbidden", "Trainer access is required.", 403);
  return withWriteTransaction(async connection => {
    const [rows] = await connection.execute<ReplayRow[]>("SELECT * FROM simulator_replays WHERE id=? AND ended_at IS NOT NULL FOR UPDATE", [id]);
    const row = rows[0];
    if (row) {
      rejectMovedRadar(exerciseSchema.parse(JSON.parse(row.last_state)));
      if ((row.feedback ?? "") !== expected) throw new SessionError("feedback-conflict", "Feedback changed in another window. Reload before saving.", 409);
      if ((row.feedback ?? "") === feedback) return {feedback};
      await connection.execute("UPDATE simulator_replays SET feedback=? WHERE id=?", [feedback, id]);
      if (row.attempt_id) await connection.execute("UPDATE simulator_attempts SET feedback=? WHERE id=?", [feedback, row.attempt_id]);
      {const ids = (JSON.parse(row.participants) as ReplayParticipant[]).filter(p => p.role === "mentee").map(p => p.accountId); afterWriteCommit(() => {for (const accountId of new Set(ids)) void notify({accountId, title: row.title, airport: "EGPH", trainer: actor.displayName ?? "Your mentor", replayId: id});});}
      return {feedback};
    }
    const [old] = await connection.execute<LegacyRow[]>("SELECT * FROM simulator_attempts WHERE id=? AND status<>'active' FOR UPDATE", [id]);
    if (!old[0]) throw new SessionError("not-found", "This replay is unavailable.", 404);
    if (old[0].result) rejectMovedRadar(exerciseSchema.parse(JSON.parse(old[0].result).exercise));
    if ((old[0].feedback ?? "") !== expected) throw new SessionError("feedback-conflict", "Feedback changed in another window. Reload before saving.", 409);
    if ((old[0].feedback ?? "") !== feedback) {
      await connection.execute("UPDATE simulator_attempts SET feedback=? WHERE id=?", [feedback, id]);
      if (old[0].learner_id) {const learner = old[0].learner_id; afterWriteCommit(() => {void notify({accountId: learner, title: "Your training session", airport: "EGPH", trainer: actor.displayName ?? "Your mentor", replayId: id});});}
    }
    return {feedback};
  });
}

export async function updatePositionFeedback(id: string, actor: Actor, positionId: string, expected: string, feedback: string, notify = notifyFeedback) {
  if (!actor.staff) throw new SessionError("forbidden", "Trainer access is required.", 403);
  return withWriteTransaction(async connection => {
    const [rows] = await connection.execute<ReplayRow[]>("SELECT * FROM simulator_replays WHERE id=? AND ended_at IS NOT NULL FOR UPDATE", [id]);
    const row = rows[0];
    if (!row) throw new SessionError("not-found", "This replay is unavailable.", 404);
    const state = exerciseSchema.parse(JSON.parse(row.last_state)); rejectMovedRadar(state);
    if (!state.positions?.some(position => position.id === positionId)) throw new SessionError("not-found", "This position is unavailable.", 404);
    const [old] = await connection.execute<(RowDataPacket & {feedback: string})[]>("SELECT feedback FROM simulator_replay_position_feedback WHERE replay_id=? AND position_id=? FOR UPDATE", [id, positionId]);
    const previous = old[0]?.feedback ?? state.positionFeedback?.[positionId] ?? "";
    if (previous !== expected) throw new SessionError("feedback-conflict", "Feedback changed in another window. Reload before saving.", 409);
    if (previous !== feedback) {
      await connection.execute("INSERT INTO simulator_replay_position_feedback (replay_id,position_id,feedback) VALUES (?,?,?) ON DUPLICATE KEY UPDATE feedback=VALUES(feedback)", [id, positionId, feedback]);
      {const ids = (JSON.parse(row.participants) as ReplayParticipant[]).filter(p => p.role === "mentee" && p.positionId === positionId).map(p => p.accountId); afterWriteCommit(() => {for (const accountId of new Set(ids)) void notify({accountId, title: row.title, airport: "EGPH", trainer: actor.displayName ?? "Your mentor", replayId: id});});}
    }
    return {feedback};
  });
}
