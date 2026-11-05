import {isAbsolute} from "node:path";
import {queryReadOnly, closeSimulatorStorage} from "../src/lib/simulator-db";
import {createRuntimeHandler} from "../src/simulator/server/runtime-handler";
import {createRuntimeServer} from "../src/simulator/server/runtime-http";

async function main() {
  const key = process.env.SWEATBOX_RUNTIME_KEY ?? "";
  const path = process.env.SIMULATOR_SQLITE_PATH ?? "";
  const port = Number(process.env.SWEATBOX_RUNTIME_PORT ?? 4317);
  if (key.length < 32 || !isAbsolute(path) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Set SWEATBOX_RUNTIME_KEY (at least 32 characters), an absolute SIMULATOR_SQLITE_PATH and a valid SWEATBOX_RUNTIME_PORT.");
  // This entry point is for local rehearsals. The service does not deliver real notifications or prepare remote speech.
  delete process.env.EXAMS_AUTH_KEY;
  delete process.env.SPEECH_SERVICE_URL;
  await queryReadOnly("SELECT id FROM simulator_sessions LIMIT 0");
  const server = createRuntimeServer(createRuntimeHandler(key));
  server.listen(port, "127.0.0.1", () => console.log(`Sweatbox runtime listening on http://127.0.0.1:${port}`));
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
    server.close(async () => {await closeSimulatorStorage();});
    server.closeAllConnections();
  });
}

void main().catch(error => {console.error(error instanceof Error ? error.message : "Sweatbox runtime startup failed."); process.exitCode = 1;});
