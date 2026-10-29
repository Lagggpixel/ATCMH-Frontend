import {createHmac} from "node:crypto";
import {z} from "zod/v3";
import {SessionError} from "../sessions";

const input = z.object({
  text: z.string().trim().min(1).max(6000),
  voice: z.enum(["alba", "george", "jane"]),
  priority: z.enum(["play", "prepare"]).default("play"),
}).strict();
const noStore = {"cache-control": "private, no-store", "x-content-type-options": "nosniff"};
const unavailable = () => new SessionError("speech-unavailable", "Radio voice is temporarily unavailable. Your text messages are unaffected.", 503);

/** Proxy a framed PCM stream without exposing the private token or retaining speech text. */
export function createPocketProxy(authorize: (request: Request) => Promise<{accountId: string}>, failure: (error: unknown) => Response, namespace: () => string, requestSpeech: typeof fetch = fetch) {
  return async (request: Request) => {
    try {
      const actor = await authorize(request);
      if (request.method !== "GET" && request.method !== "POST") return new Response(null, {status: 405, headers: {...noStore, allow: "GET, POST"}});
      const url = process.env.SPEECH_SERVICE_URL, token = process.env.SPEECH_SERVICE_TOKEN;
      if (!url || !token || token.length < 32) throw unavailable();
      const endpoint = new URL(url);
      if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw unavailable();
      const target = new URL("speech", url.endsWith("/") ? url : `${url}/`);
      let body: string | undefined;
      if (request.method === "POST") {
        if (!request.headers.get("content-type")?.startsWith("application/json")) throw new SessionError("invalid-request", "Send a JSON radio message.", 415);
        if (Number(request.headers.get("content-length") ?? 0) > 32768) throw new SessionError("too-large", "This radio message is too long.", 413);
        const reader = request.body?.getReader(); if (!reader) throw new SyntaxError();
        const decoder = new TextDecoder(); let text = "", length = 0;
        try {
          for (;;) {const {value, done} = await reader.read(); if (done) break; length += value.length; if (length > 32768) throw new SessionError("too-large", "This radio message is too long.", 413); text += decoder.decode(value, {stream: true});}
          text += decoder.decode();
        } catch (error) {await reader.cancel(); throw error;}
        const value = input.parse(JSON.parse(text));
        const accountId = createHmac("sha256", token).update(JSON.stringify([namespace(), actor.accountId])).digest("hex");
        body = JSON.stringify({...value, accountId});
      }
      const controller = new AbortController();
      const upstream = await requestSpeech(target, {method: request.method, headers: {authorization: `Bearer ${token}`, ...(body ? {"content-type": "application/json"} : {})}, body,
        signal: AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(120_000)]), cache: "no-store", redirect: "error"});
      if (upstream.status === 429) {await upstream.body?.cancel(); throw new SessionError("speech-busy", "Radio voice is busy. Try again shortly.", 429);}
      if (!upstream.ok) {await upstream.body?.cancel(); throw unavailable();}
      if (request.method === "GET") {
        const result = await upstream.json() as {ready?: unknown};
        return Response.json({ready: result.ready === true}, {headers: noStore});
      }
      if (upstream.headers.get("content-type") !== "application/vnd.atcmh.pcm-stream" || !upstream.body) {await upstream.body?.cancel(); throw unavailable();}
      const reader = upstream.body.getReader(); let bytes = 0;
      const stream = new ReadableStream<Uint8Array>({
        async pull(output) {
          try {
            const {value, done} = await reader.read();
            if (done) {output.close(); return;}
            bytes += value.length;
            if (bytes > 17 * 1024 * 1024) throw new Error("Speech stream too large");
            output.enqueue(value);
          } catch (error) {controller.abort(); void reader.cancel().catch(() => {}); output.error(error);}
        },
        async cancel() {controller.abort(); await reader.cancel().catch(() => {});},
      });
      return new Response(stream, {headers: {...noStore, "content-type": "application/vnd.atcmh.pcm-stream"}});
    } catch (error) {return failure(error);}
  };
}
