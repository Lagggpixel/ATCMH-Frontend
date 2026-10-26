import {fetchWeatherReport} from "./weather-provider";
import type {SessionWeatherLoader} from "./session-weather";
import {z} from "zod/v3";
import {envelopeSchema} from "../protocol";
import {invalidRequestMessage} from "../request-validation";
import {SESSION_FRAME_MS, SessionError, parseSessionEntry} from "../sessions";
import {notifyAssignment, type AssignmentNotice} from "./assignment-notifications";
import {authorizeSessionRequest} from "./session-auth";
import {SessionService, type SessionStore} from "./session-service";
import {sqlSessionStore} from "./session-store";
import {requireLocalSession} from "./radar-moved";
import {demoBatchSchema, demoControllerSchema} from "../demonstration";
import {demoHub as sharedDemoHub, type DemoHub} from "./demo-hub";

const idSchema = z.string().uuid();
const seatSchema = z.object({role: z.enum(["staff", "mentee"]), token: z.string().uuid()});
const assignSchema = z.object({mentee: z.object({discordId: z.string().regex(/^\d{15,20}$/), name: z.string().trim().min(1).max(128).optional()}).strict().nullable()}).strict();
const endSchema = z.object({feedback: z.string().trim().max(6000).optional()}).strict();
const LOOKUPS_PER_MINUTE = 20;
const noStore = {"cache-control": "no-store"};
export function sessionFailure(error: unknown) {
  if (error instanceof SessionError) return Response.json({code: error.code, error: error.message}, {status: error.status, headers: noStore});
  if (error instanceof z.ZodError) return Response.json({code: "invalid-request", error: invalidRequestMessage(error)}, {status: 400, headers: noStore});
  if (error instanceof SyntaxError) return Response.json({code: "invalid-request", error: "The request body must contain valid JSON."}, {status: 400, headers: noStore});
  console.error("Simulator session request failed", error instanceof Error ? error.name : "Unknown error");
  return Response.json({code: "unavailable", error: "Sessions are temporarily unavailable. Your saved scenarios have not been removed."}, {status: 503, headers: noStore});
}
async function body(request: Request) {
  const text = await request.text();
  if (text.length > 2_000_000) throw new SessionError("too-large", "This exercise is too large to save.", 413);
  return JSON.parse(text) as unknown;
}
export function createSessionApi(store: SessionStore, authorize = authorizeSessionRequest, requireLocal = async (_id: string) => {}, weather: SessionWeatherLoader = fetchWeatherReport,
  notify: (notice: AssignmentNotice) => Promise<boolean> = notifyAssignment, hub: DemoHub = sharedDemoHub) {
const service = new SessionService(store, undefined, undefined, undefined, undefined, weather);
const mentee = {hasAssignment: (discordId: string) => store.hasAssignment(discordId)};
const lookups = new Map<string, number[]>();
function limitLookups(accountId: string) {
  const now = Date.now(), recent = (lookups.get(accountId) ?? []).filter(time => now - time < 60_000);
  if (recent.length >= LOOKUPS_PER_MINUTE) throw new SessionError("rate-limited", "Too many session codes tried. Wait a minute and try again.", 429);
  recent.push(now); lookups.set(accountId, recent);
  if (lookups.size > 5000) for (const [key, times] of lookups) if (times.every(time => now - time >= 60_000)) lookups.delete(key);
}
async function sessionCollection(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if (request.method === "GET" && params.has("mine")) {
      const actor = await authorize(request, false, {anySignedIn: true});
      return Response.json({sessions: await service.assigned(actor)}, {headers: noStore});
    }
    if (request.method === "GET" && (params.has("code") || params.has("session"))) {
      const actor = await authorize(request, false, {anySignedIn: true});
      const entry = params.has("session") ? {id: idSchema.parse(params.get("session"))} : parseSessionEntry(params.get("code") ?? "");
      if (!entry) throw new SessionError("invalid-code", "Enter a session code like EGPH-0123456789AB, or paste the link from your mentor.", 400);
      limitLookups(actor.accountId);
      return Response.json({session: await service.preview(actor, entry)}, {headers: noStore});
    }
    const actor = await authorize(request, true);
    if (request.method === "GET") return Response.json({sessions: (await service.list(actor)).filter(s => !/:(approach|center)$/.test(s.trainingStation ?? ""))}, {headers: noStore});
    throw new SessionError("scenario-required", "Choose a published scenario to create a training session.", 409);
  } catch (error) {return sessionFailure(error);}
}
async function sessionOperation(request: Request, id: string, operation: string) {
  try {
    idSchema.parse(id);
    if (operation === "end") {
      const actor = await authorize(request, true);
      // An optional body carries feedback written while archiving.
      const text = await request.text();
      const value = text ? endSchema.parse(JSON.parse(text)) : {};
      await requireLocal(id);
      await service.end(actor, id, value.feedback || undefined);
      return Response.json({ended: true}, {headers: noStore});
    }
    if (operation === "stream") return await stream(request, id);
    if (operation === "assign") {
      const actor = await authorize(request, true);
      const value = assignSchema.parse(await body(request));
      const result = await service.assign(actor, id, value.mentee ?? null);
      if (result.changed && value.mentee) void notify({discordId: value.mentee.discordId, title: result.session.title, airport: result.session.airport ?? "EGPH", trainer: actor.displayName ?? "Your mentor"});
      return Response.json({session: result.session}, {headers: noStore});
    }
    if (operation === "demo") return await demonstration(request, id);
    const raw = await body(request), seat = seatSchema.parse(raw);
    const actor = await authorize(request, seat.role === "staff" && operation !== "leave", mentee);
    await requireLocal(id);
    if (operation === "join") return Response.json(await service.join(actor, id, seat.role, seat.token), {headers: noStore});
    if (operation === "leave") {await service.leave(actor, id, seat.role, seat.token); return Response.json({left: true}, {headers: noStore});}
    if (operation === "events") {
      if (seat.role !== "staff") throw new SessionError("forbidden", "Only staff can manage scenario events.", 403);
      const value = z.object({eventId: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/), decision: z.enum(["run", "retry", "skip"])}).parse(raw);
      return Response.json(await service.event(actor, id, seat.token, value.eventId, value.decision), {headers: noStore});
    }
    const envelope = envelopeSchema.parse(z.object({envelope: z.unknown()}).parse(raw).envelope);
    return Response.json(await service.dispatch(actor, id, seat.role, seat.token, envelope), {headers: noStore});
  } catch (error) {return sessionFailure(error);}
}
/** The mirror channel trusts only seat tokens its own authorised streams vouched for in the last few seconds. */
async function demonstration(request: Request, id: string) {
  const text = await request.text();
  if (text.length > 64_000) throw new SessionError("too-large", "Demonstration update is too large.", 413);
  const raw = JSON.parse(text) as unknown, seat = seatSchema.parse(raw);
  if (!hub.allowed(id, seat.role, seat.token)) throw new SessionError("demo-closed", "The demonstration is not running.", 409);
  if (seat.role === "staff") hub.publish(id, demoBatchSchema.parse(z.object({batch: z.unknown()}).parse(raw).batch));
  else hub.seed(id, demoControllerSchema.parse(z.object({controller: z.unknown()}).parse(raw).controller));
  return Response.json({ok: true}, {headers: noStore});
}
async function stream(request: Request, id: string) {
  const seat = seatSchema.parse({role: request.headers.get("x-simulator-role"), token: request.headers.get("x-simulator-seat")});
  let actor = await authorize(request, seat.role === "staff", mentee);
  await requireLocal(id);
  const initial = await service.frame(actor, id, seat.role, seat.token);
  const encoder = new TextEncoder();
  let cancelled = false, wake: (() => void) | undefined;
  const unsubscribe = hub.subscribe(id, () => wake?.());
  const response = new ReadableStream<Uint8Array>({
    async start(controller) {
      let contentRevision = -1, revision = -1, authorizedAt = Date.now();
      const send = (value: unknown) => {if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));};
      // Demonstration mirrors go out as soon as they arrive, between the regular state frames.
      let demoSeq = 0;
      const flushDemo = () => {
        if (seat.role === "mentee") {
          const update = hub.read(id, demoSeq);
          if (update) {send({type: "demo", ...update}); demoSeq = update.seq;}
        } else {
          const seed = hub.readSeed(id, demoSeq);
          if (seed) send({type: "demo-seed", controller: seed.controller});
          demoSeq = Math.max(demoSeq, hub.read(id, 0)?.seq ?? demoSeq);
        }
      };
      try {
        let frame = initial;
        while (!cancelled && !request.signal.aborted) {
          hub.trust(id, seat.role, seat.token, !!frame.exercise.demonstration);
          if (frame.contentRevision !== contentRevision) {
            send({type: "snapshot", exercise: frame.exercise, session: frame.session, scenario: frame.scenario}); contentRevision = frame.contentRevision;
          } else if (revision !== frame.exercise.revision) {
            const {id, revision, elapsed, aircraft, running, conflicts, collisions, terrainStatus} = frame.exercise;
            send({type: "motion", state: {id, revision, elapsed, aircraft, running, conflicts, collisions, terrainStatus}, session: frame.session});
          } else send({type: "presence", session: frame.session});
          revision = frame.exercise.revision;
          for (const deadline = Date.now() + SESSION_FRAME_MS; !cancelled && !request.signal.aborted;) {
            flushDemo();
            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            await new Promise<void>(resolve => {const timer = setTimeout(resolve, remaining); wake = () => {clearTimeout(timer); resolve();};});
          }
          if (cancelled || request.signal.aborted) break;
          if (Date.now() - authorizedAt >= 60_000) {actor = await authorize(request, seat.role === "staff", mentee); authorizedAt = Date.now();}
          frame = await service.frame(actor, id, seat.role, seat.token);
        }
      } catch (error) {
        const failure = error instanceof SessionError ? error : new SessionError("unavailable", "Connection interrupted. Reconnecting…", 503);
        send({type: "failure", code: failure.code, error: failure.message, status: failure.status});
      } finally {unsubscribe(); if (!cancelled) controller.close();}
    },
    cancel() {cancelled = true; wake?.();},
  });
  return new Response(response, {headers: {...noStore, "content-type": "text/event-stream", "x-accel-buffering": "no", "connection": "keep-alive"}});
}

return {sessionCollection, sessionOperation};
}
const api = createSessionApi(sqlSessionStore, authorizeSessionRequest, requireLocalSession);
export const sessionCollection = api.sessionCollection;
export const sessionOperation = api.sessionOperation;
