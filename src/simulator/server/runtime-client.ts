import {z} from "zod/v3";
import {SessionError} from "../sessions";

const unavailable = () => new SessionError("unavailable", "The local Sweatbox runtime is unavailable. Try again.", 503);

export function runtimeConfig() {
  const address = process.env.SWEATBOX_RUNTIME_URL;
  if (!address) return;
  const key = process.env.SWEATBOX_RUNTIME_KEY;
  // This first runtime is for native local testing and binds only to IPv4 loopback.
  if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/?$/.test(address) || !key || key.length < 32) throw unavailable();
  try {return {origin: new URL(address).origin, key};}
  catch {throw unavailable();}
}

export async function send(config: NonNullable<ReturnType<typeof runtimeConfig>>, path: string, options: RequestInit) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 8000);
  try {
    const headers = new Headers(options.headers);
    headers.set("authorization", `Bearer ${config.key}`);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
    return await fetch(config.origin + path, {...options, headers, signal, redirect: "error", cache: "no-store"});
  } catch {throw unavailable();}
  finally {clearTimeout(timer);}
}

export async function internalResult<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    const error = z.object({code: z.string(), error: z.string()}).safeParse(await response.json().catch(() => null));
    if (!error.success || response.status >= 500) throw unavailable();
    throw new SessionError(error.data.code, error.data.error, response.status);
  }
  return schema.parse(await response.json());
}

export async function remoteAssignment(discordId: string): Promise<boolean | undefined> {
  const config = runtimeConfig();
  if (!config) return undefined;
  return internalResult(await send(config, `/internal/assignment?${new URLSearchParams({discordId})}`, {}), z.boolean());
}
