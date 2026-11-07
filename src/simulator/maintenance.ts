import {sqliteEnabled, vacuumSimulatorStorage, withWriteTransaction} from "../lib/simulator-db";
import mysql from "mysql2/promise";
import {databaseUrlFromEnvironment} from "../lib/db";
import {eraseSimulatorLearner, maintainSimulatorRecords} from "./server/retention";
import {compactStoredReplays, deleteCompactedJsonFrames, installCompactReplays} from "./server/replay-compaction";
import type {RetentionConnection} from "./server/retention";

/** Replay storage tasks run separately from daily retention, each in its own transaction. */
const replayTasks = {
  "--install-compact-replays": async (connection: RetentionConnection) => {await installCompactReplays(connection); return {installed: true};},
  "--compact-replays": (connection: RetentionConnection, apply: boolean) => compactStoredReplays(connection, Date.now(), apply),
  "--delete-compacted-frames": (connection: RetentionConnection, apply: boolean) => deleteCompactedJsonFrames(connection, Date.now(), apply),
} as const;
type ReplayTask = keyof typeof replayTasks;

async function main() {
  const args = process.argv.slice(2);
  const eraseIndex = args.indexOf("--erase-learner");
  const learner = eraseIndex >= 0 ? args[eraseIndex + 1] : undefined;
  const allowed = new Set(["--apply", "--dry-run", "--erase-learner", "--vacuum", ...Object.keys(replayTasks), learner].filter(Boolean));
  const tasks = args.filter((a): a is ReplayTask => a in replayTasks);
  if (args.some(a => !allowed.has(a)) || (eraseIndex >= 0 && (!learner || learner.startsWith("--"))) || (args.includes("--apply") && args.includes("--dry-run"))
    || tasks.length + (learner ? 1 : 0) + (args.includes("--vacuum") ? 1 : 0) > 1) throw new Error("Invalid arguments");
  if (args.includes("--vacuum")) {
    // Returns space freed by deleted JSON frames. Run in a quiet window: it waits for other writers.
    if (!sqliteEnabled()) throw new Error("Invalid arguments");
    await vacuumSimulatorStorage();
    console.log(JSON.stringify({vacuumed: true}));
    return;
  }
  if (tasks.length) {
    // Installing the table is itself the change, so it needs no --apply.
    const task = tasks[0], apply = task === "--install-compact-replays" || args.includes("--apply");
    const rollback = new Error("dry-run");
    let report: unknown;
    if (sqliteEnabled()) {
      try {await withWriteTransaction(async connection => {report = await replayTasks[task](connection, apply); if (!apply) throw rollback;});}
      catch (error) {if (error !== rollback) throw error;}
    } else {
      if (task === "--install-compact-replays") throw new Error("Apply migrations/2026-11-07-simulator-compact-replays.sql to MariaDB instead.");
      const connection = await mysql.createConnection(databaseUrlFromEnvironment());
      try {
        await connection.beginTransaction();
        report = await replayTasks[task](connection as unknown as RetentionConnection, apply);
        if (apply) await connection.commit(); else await connection.rollback();
      } catch (error) {await connection.rollback(); throw error;}
      finally {await connection.end();}
    }
    console.log(JSON.stringify(report));
    return;
  }
  if (sqliteEnabled()) {
    const apply = args.includes("--apply");
    const rollback = new Error("dry-run");
    let report: unknown;
    try {
      await withWriteTransaction(async connection => {
        report = learner ? await eraseSimulatorLearner(connection, learner!, apply) : await maintainSimulatorRecords(connection, Date.now(), apply);
        if (!apply) throw rollback;
      });
    } catch (error) {if (error !== rollback) throw error;}
    console.log(JSON.stringify(report));
    return;
  }
  const connection = await mysql.createConnection(databaseUrlFromEnvironment());
  try {
    await connection.beginTransaction();
    const report = learner ? await eraseSimulatorLearner(connection, learner, args.includes("--apply")) : await maintainSimulatorRecords(connection, Date.now(), args.includes("--apply"));
    if (args.includes("--apply")) await connection.commit(); else await connection.rollback();
    console.log(JSON.stringify(report));
  } catch (error) {await connection.rollback(); throw error;}
  finally {await connection.end();}
}
main().catch(() => {console.error("Simulator maintenance failed; transaction rolled back. Check arguments, required simulator schema and database access privately."); process.exitCode = 1;});
