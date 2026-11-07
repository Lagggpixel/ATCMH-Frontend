import {z} from "zod/v3";
import {SessionError} from "../sessions";
import {messageSpeech} from "./message-speech";
import {internalResult, runtimeConfig, send} from "./runtime-client";
import {delegationHeaders} from "./runtime-identity";
import {sessionFailure} from "./session-api";
import {authorizeSessionRequest} from "./session-auth";
import type {Actor} from "./session-service";
import {sqlSessionStore} from "./session-store";
import {BODY_BINARY_TYPE, STREAM_HEADER} from "../stream-codec";

export function withSweatboxRuntime<Args extends unknown[]>(
  local: (request: Request, ...args: Args) => Promise<Response>, authorize = authorizeSessionRequest,
) {
  return async (request: Request, ...args: Args) => {
    try {
      const config = runtimeConfig();
      if (!config) return await local(request, ...args);
      const actor = await authorize(request, false, {anySignedIn: true});
      const headers = new Headers(delegationHeaders(actor));
      for (const name of ["x-simulator-role", "x-simulator-seat", "content-type", STREAM_HEADER]) {
        const value = request.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      const url = new URL(request.url);
      // Compact binary bodies pass through unchanged.
      const binary = request.headers.get("content-type")?.startsWith(BODY_BINARY_TYPE);
      const body = request.body ? binary ? new Uint8Array(await request.arrayBuffer()) : await request.text() : undefined;
      if (body && body.length > 2_000_000) throw new SessionError("too-large", "This exercise is too large to save.", 413);
      const response = await send(config, url.pathname + url.search, {method: request.method, headers, body, signal: request.signal});
      return new Response(response.body, {status: response.status, headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      }});
    } catch (error) {return sessionFailure(error);}
  };
}

export async function resolveSimulatorMessage(actor: Actor, reference: {sessionId: string; messageId: string}, request: Request) {
  const config = runtimeConfig();
  if (!config) return messageSpeech(await sqlSessionStore.read(reference.sessionId), actor, reference.messageId);
  return internalResult(await send(config, `/internal/message?${new URLSearchParams(reference)}`, {
    headers: delegationHeaders(actor), signal: request.signal,
  }), z.string());
}
