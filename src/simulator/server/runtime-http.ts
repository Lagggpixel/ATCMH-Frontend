import {createServer} from "node:http";
import type {IncomingMessage, ServerResponse} from "node:http";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";

export function createRuntimeServer(handle: (request: Request) => Promise<Response>) {
  const active = new Set<Promise<void>>();
  const streams = new Set<ServerResponse>();
  let draining = false;
  async function respond(incoming: IncomingMessage, outgoing: ServerResponse) {
    const controller = new AbortController();
    outgoing.once("close", () => controller.abort());
    try {
      const method = incoming.method ?? "GET";
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      const init: RequestInit & {duplex?: "half"} = {method, headers, signal: controller.signal};
      if (method !== "GET" && method !== "HEAD") {
        init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
        init.duplex = "half";
      }
      const request = new Request(`http://127.0.0.1${incoming.url ?? "/"}`, init);
      const response = await handle(request);
      if (controller.signal.aborted) {await response.body?.cancel(); return;}
      if (response.headers.get("content-type")?.startsWith("text/event-stream")) {
        if (draining) {outgoing.destroy(); await response.body?.cancel(); return;}
        streams.add(outgoing);
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        outgoing.flushHeaders();
        await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), outgoing, {signal: controller.signal});
      } else outgoing.end();
    } catch {
      if (controller.signal.aborted) return;
      if (outgoing.headersSent) outgoing.destroy();
      else outgoing.writeHead(503, {"cache-control": "no-store"}).end();
    } finally {streams.delete(outgoing);}
  }
  const server = createServer((incoming, outgoing) => {
    if (draining) {outgoing.writeHead(503, {connection: "close"}).end(); return;}
    const response = respond(incoming, outgoing);
    active.add(response);
    void response.finally(() => active.delete(response));
  });
  return Object.assign(server, {async drain() {
    draining = true;
    const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const stream of streams) stream.destroy();
    await closed;
    await Promise.all(active);
  }});
}
