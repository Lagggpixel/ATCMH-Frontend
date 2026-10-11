import mysql from "mysql2/promise";
import {databaseUrlFromEnvironment} from "../lib/db";
import {eraseSimulatorLearner, maintainSimulatorRecords} from "./server/retention";

async function main() {
  const args = process.argv.slice(2);
  const eraseIndex = args.indexOf("--erase-learner");
  const learner = eraseIndex >= 0 ? args[eraseIndex + 1] : undefined;
  const allowed = new Set(["--apply", "--dry-run", "--erase-learner", learner].filter(Boolean));
  if (args.some(a => !allowed.has(a)) || (eraseIndex >= 0 && (!learner || learner.startsWith("--"))) || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("Invalid arguments");
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
