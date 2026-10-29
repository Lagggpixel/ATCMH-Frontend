import {createHmac} from "node:crypto";
import {z} from "zod/v3";
import {MAX_SPEECH_BYTES, MAX_SPEECH_TEXT} from "../sentence-audio";
import {decodeRecording} from "../recorded-output";
import {SessionError} from "../sessions";
import {authorizeSessionRequest} from "./session-auth";
import {sessionFailure} from "./session-api";
import {assignedMentee} from "./session-store";

const input = z.object({
  text: z.string().trim().min(1).max(MAX_SPEECH_TEXT),
  voice: z.enum(["af_heart", "bf_emma", "bm_george"]),
  filter: z.boolean().default(false),
  priority: z.enum(["play", "prepare"]).default("play"),
}).strict();
const headers = {"cache-control": "private, no-store", "x-content-type-options": "nosniff"};
const unavailable = () => new SessionError("speech-unavailable", "Radio voice is temporarily unavailable. Your text messages are unaffected.", 503);

/** Preserve the frontend's authorization boundary when proxying to a private speech service. */
export function createSpeechApi(authorize = authorizeSessionRequest, requestSpeech = fetch) {
  return async (request: Request) => {
    try {
      const actor = await authorize(request, false, {hasAssignment: assignedMentee.hasAssignment});
      if (request.method !== "GET" && request.method !== "POST") return new Response(null, {status: 405, headers: {...headers, allow: "GET, POST"}});
      const url = process.env.SPEECH_SERVICE_URL, token = process.env.SPEECH_SERVICE_TOKEN;
      if (!url || !token || token.length < 32) throw unavailable();
      const endpoint = new URL(url);
      if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw unavailable();
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
        const accountId = createHmac("sha256", token).update(JSON.stringify([process.env.FRONTEND_PUBLIC_ORIGIN ?? "atcmh", actor.accountId])).digest("hex");
        body = JSON.stringify({...value, accountId});
      }
      const response = await requestSpeech(target, {method: request.method, headers: {authorization: `Bearer ${token}`, ...(body ? {"content-type": "application/json"} : {})}, body,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]), cache: "no-store", redirect: "error"});
      if (response.status === 429) {await response.body?.cancel(); throw new SessionError("speech-busy", "Radio voice is busy. Try again shortly.", 429);}
      if (!response.ok) {await response.body?.cancel(); throw unavailable();}
      if (request.method === "GET") {
        const state = await response.json() as {ready?: unknown};
        return Response.json({ready: state.ready === true}, {headers});
      }
      if (response.headers.get("content-type") !== "audio/wav" || Number(response.headers.get("content-length") ?? 0) > MAX_SPEECH_BYTES) {await response.body?.cancel(); throw unavailable();}
      const reader = response.body?.getReader(); if (!reader) throw unavailable();
      const chunks: Uint8Array[] = []; let length = 0;
      try {for (;;) {const {value, done} = await reader.read(); if (done) break; length += value.length; if (length > MAX_SPEECH_BYTES) throw unavailable(); chunks.push(value);}}
      catch (error) {await reader.cancel(); throw error;}
      const audio = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) {audio.set(chunk, offset); offset += chunk.length;}
      try {if (!decodeRecording(audio.buffer).length) throw unavailable();}
      catch {throw unavailable();}
      return new Response(audio, {headers: {...headers, "content-type": "audio/wav", "content-length": String(length)}});
    } catch (error) {return sessionFailure(error);}
  };
}
export const speechApi = createSpeechApi();
