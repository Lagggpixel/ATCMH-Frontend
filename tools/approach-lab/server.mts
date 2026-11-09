import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {catalog, simulate, type LabInput} from "./simulate.ts";

const files: Record<string, {name: string; type: string}> = {
  "/": {name: "index.html", type: "text/html; charset=utf-8"},
  "/app.js": {name: "app.js", type: "text/javascript; charset=utf-8"},
  "/style.css": {name: "style.css", type: "text/css; charset=utf-8"},
};
const port = Number(process.env.APPROACH_LAB_PORT ?? 4179);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("APPROACH_LAB_PORT must be a valid TCP port.");

createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  try {
    if (request.method === "GET" && path === "/api/catalog") {
      response.writeHead(200, {"content-type": "application/json; charset=utf-8"}); response.end(JSON.stringify(catalog())); return;
    }
    if (request.method === "POST" && path === "/api/simulate") {
      let body = "";
      for await (const chunk of request) {body += chunk; if (body.length > 32768) throw new Error("Request is too large.");}
      const result = simulate(JSON.parse(body) as LabInput);
      response.writeHead(200, {"content-type": "application/json; charset=utf-8"}); response.end(JSON.stringify(result)); return;
    }
    const file = request.method === "GET" ? files[path] : undefined;
    if (!file) {response.writeHead(404); response.end("Not found"); return;}
    const contents = await readFile(fileURLToPath(new URL(file.name, import.meta.url)));
    response.writeHead(200, {"content-type": file.type, "cache-control": "no-store"}); response.end(contents);
  } catch (error) {
    response.writeHead(400, {"content-type": "application/json; charset=utf-8"});
    response.end(JSON.stringify({error: error instanceof Error ? error.message : "Simulation failed."}));
  }
}).listen(port, "127.0.0.1", () => console.log(`Approach Lab: http://127.0.0.1:${port}`));
