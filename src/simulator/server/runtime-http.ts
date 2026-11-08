import {createServer} from "node:http";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";

export function createRuntimeServer(handle: (request: Request) => Promise<Response>) {
  return createServer(async (incoming, outgoing) => {
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
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        outgoing.flushHeaders();
        await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), outgoing, {signal: controller.signal});
      } else outgoing.end();
    } catch {
      if (controller.signal.aborted) return;
      if (outgoing.headersSent) outgoing.destroy();
      else outgoing.writeHead(503, {"cache-control": "no-store"}).end();
    }
  });
}
