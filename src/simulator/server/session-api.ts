import {fetchWeatherReport} from "./weather-provider";
import type {SessionWeatherLoader} from "./session-weather";
import {z} from "zod/v3";
import {controllerPositionsSchema, envelopeSchema} from "../protocol";
import {invalidRequestMessage} from "../request-validation";
import {SESSION_NAME_MAX_LENGTH, SESSION_FRAME_MS, SessionError, parseSessionEntry} from "../sessions";
import {notifyAssignment, notifyFeedback, type AssignmentNotice} from "./assignment-notifications";
import {authorizeSessionRequest} from "./session-auth";
import {SessionService, type Actor, type SessionStore} from "./session-service";
import {endedReplay, recordedSessionState} from "./replay-store";
import {sqlSessionStore} from "./session-store";
import {requireLocalSession} from "./radar-moved";
import {demoBatchSchema, demoControllerSchema, demoPresenter, shadowKey} from "../demonstration";
import {demoHub as sharedDemoHub, shadowHub as sharedShadowHub, type DemoHub} from "./demo-hub";
import {BODY_BINARY_TYPE, decodeBody, STREAM_BINARY_TYPE, STREAM_FORMAT, STREAM_HEADER, StreamEncoder} from "../stream-codec";

const idSchema = z.string().uuid();
// positionId may list several positions, comma separated, when a mentor bandboxes them.
const seatSchema = z.object({role: z.enum(["staff", "mentee", "spectator"]), token: z.string().uuid(), positionId: z.string().regex(/^[a-zA-Z0-9_-]{1,32}(,[a-zA-Z0-9_-]{1,32}){0,11}$/).optional(), takeover: z.boolean().optional()});
const assignSchema = z.object({mentee: z.object({discordId: z.string().regex(/^\d{15,20}$/), name: z.string().trim().min(1).max(128).optional()}).strict().nullable()}).strict();
const endSchema = z.object({feedback: z.string().trim().max(6000).optional()}).strict();
const LOOKUPS_PER_MINUTE = 20;
const shadowPositionSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/).optional();
const noStore = {"cache-control": "no-store"};
export function sessionFailure(error: unknown) {
  if (error instanceof SessionError) return Response.json({code: error.code, error: error.message, ...(error.detail ? {detail: error.detail} : {})}, {status: error.status, headers: noStore});
  if (error instanceof z.ZodError) return Response.json({code: "invalid-request", error: invalidRequestMessage(error)}, {status: 400, headers: noStore});
  if (error instanceof SyntaxError) return Response.json({code: "invalid-request", error: "The request body must contain valid JSON."}, {status: 400, headers: noStore});
  console.error("Simulator session request failed", error instanceof Error ? error.name : "Unknown error");
  return Response.json({code: "unavailable", error: "Sessions are temporarily unavailable. Your saved scenarios have not been removed."}, {status: 503, headers: noStore});
}
/** JSON, or the compact binary body pages send once their stream is binary. */
export async function readBody(request: Request, limit: number, message: string) {
  if (request.headers.get("content-type")?.startsWith(BODY_BINARY_TYPE)) {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > limit) throw new SessionError("too-large", message, 413);
    try {return decodeBody(bytes);} catch {throw new SessionError("invalid-request", "The request body could not be read.", 400);}
  }
  const text = await request.text();
  if (text.length > limit) throw new SessionError("too-large", message, 413);
  return JSON.parse(text) as unknown;
}
const body = (request: Request) => readBody(request, 2_000_000, "This exercise is too large to save.");
export const sessionNameSchema = z.string().trim().min(1, "Enter a session name.").max(SESSION_NAME_MAX_LENGTH);
export function createSessionApi(store: SessionStore, authorize = authorizeSessionRequest, requireLocal = async (_id: string) => {}, weather: SessionWeatherLoader = fetchWeatherReport,
  notify: (notice: AssignmentNotice) => Promise<boolean> = notifyAssignment, hub: DemoHub = sharedDemoHub, shadow: DemoHub = sharedShadowHub) {
const service = new SessionService(store, undefined, undefined, undefined, undefined, weather, recordedSessionState);
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
      const previous = value.feedback ? await store.read(id) : undefined;
      await service.end(actor, id, value.feedback || undefined);
      if (value.feedback && !previous?.scenario?.feedback) {const replay = await endedReplay(id).catch(() => null); if (replay && replay.feedback === value.feedback) for (const accountId of new Set(replay.participants.filter(p => p.role === "mentee").map(p => p.accountId))) void notifyFeedback({accountId, title: replay.title, airport: replay.airport ?? "EGPH", trainer: actor.displayName ?? "Your mentor", replayId: replay.id});}
      return Response.json({ended: true}, {headers: noStore});
    }
    if (operation === "stream") return await stream(request, id);
    if (operation === "rename") {
      const actor = await authorize(request, true);
      const value = z.object({sessionName: sessionNameSchema.nullable()}).strict().parse(await body(request));
      await requireLocal(id);
      return Response.json({session: await service.rename(actor, id, value.sessionName)}, {headers: noStore});
    }
    if (operation === "positions") {
      const actor = await authorize(request, true), value = z.object({positions: controllerPositionsSchema}).strict().parse(await body(request));
      await requireLocal(id);
      return Response.json({session: await service.configurePositions(actor, id, value.positions)}, {headers: noStore});
    }
    if (operation === "position-assignment") {
      const actor = await authorize(request, true), value = z.object({positionId: z.string().min(1).max(32), mentee: z.object({discordId: z.string().regex(/^\d{15,20}$/), name: z.string().max(128).optional()}).strict().nullable(), feedback: z.string().max(6000).optional()}).strict().parse(await body(request));
      await requireLocal(id);
      const assignment = value.mentee ? {...value.mentee, assignedAt: Date.now(), assignedBy: actor.accountId, assignedByName: actor.displayName} : null;
      const before = await store.read(id), prior = before.positionState?.[value.positionId];
      const result = await service.assignPosition(actor, id, value.positionId, assignment, value.feedback);
      if (assignment && prior?.assignment?.discordId !== assignment.discordId) void notify({discordId: assignment.discordId!, title: result.title, airport: result.airport ?? "EGPH", trainer: actor.displayName ?? "Your mentor"});
      if (value.feedback !== undefined && value.feedback !== (prior?.feedback ?? "")) {const discordId = prior?.assignment?.discordId; const accountId = prior?.seat?.accountId; if (discordId || accountId) void notifyFeedback({...(discordId ? {discordId} : {accountId}), title: result.title, airport: result.airport ?? "EGPH", trainer: actor.displayName ?? "Your mentor"});}
      return Response.json({session: result}, {headers: noStore});
    }
    if (operation === "assign") {
      const actor = await authorize(request, true);
      const value = assignSchema.parse(await body(request));
      const result = await service.assign(actor, id, value.mentee ?? null);
      if (result.changed && value.mentee) void notify({discordId: value.mentee.discordId, title: result.session.title, airport: result.session.airport ?? "EGPH", trainer: actor.displayName ?? "Your mentor"});
      return Response.json({session: result.session}, {headers: noStore});
    }
    if (operation === "demo") return await demonstration(request, id);
    if (operation === "shadow") return await menteeShadow(request, id);
    const raw = await body(request), seat = seatSchema.parse(raw);
    const actor = await authorize(request, seat.role === "spectator" || seat.role === "staff" && operation !== "leave", mentee);
    await requireLocal(id);
    if (operation === "join") return Response.json(await service.join(actor, id, seat.role, seat.token, seat.positionId, seat.takeover).catch(error => ended(error, id, actor)), {headers: noStore});
    if (operation === "leave") {await service.leave(actor, id, seat.role, seat.token); return Response.json({left: true}, {headers: noStore});}
    if (operation === "events") {
      if (seat.role === "mentee") throw new SessionError("forbidden", "Only staff can manage scenario events.", 403);
      const value = z.object({eventId: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/), decision: z.enum(["run", "retry", "skip"])}).parse(raw);
      return Response.json(await service.event(actor, id, seat.token, value.eventId, value.decision, seat.role), {headers: noStore});
    }
    const envelope = envelopeSchema.parse(z.object({envelope: z.unknown()}).parse(raw).envelope);
    return Response.json(await service.dispatch(actor, id, seat.role, seat.token, envelope), {headers: noStore});
  } catch (error) {return sessionFailure(error);}
}
/** An archived session is gone from the live table; say it ended and point at its replay instead of "unavailable". */
async function ended(error: unknown, id: string, actor: Actor): Promise<never> {
  if (!(error instanceof SessionError) || error.code !== "not-found") throw error;
  const replay = await endedReplay(id).catch(() => null);
  if (!replay) throw error;
  if (!actor.staff && !replay.participants.some(p => p.accountId === actor.accountId)) throw error;
  throw new SessionError("ended", "This session has ended. Everything in it was saved.", 410, undefined, {replayId: replay.id, title: replay.title, endedAt: replay.endedAt, duration: replay.duration,
    ...(replay.ownerName ? {trainer: replay.ownerName} : {}), ...(replay.feedback ? {feedback: replay.feedback} : {}), staff: actor.staff});
}
/** The mirror channel trusts only seat tokens its own authorised streams vouched for in the last few seconds. */
async function demonstration(request: Request, id: string) {
  const raw = await readBody(request, 64_000, "Demonstration update is too large."), seat = seatSchema.parse(raw);
  // Streams vouch for each token as the presenter, the mentee, or a watcher; only the first two may post.
  if (hub.allowed(id, "presenter", seat.token)) hub.publish(id, demoBatchSchema.parse(z.object({batch: z.unknown()}).parse(raw).batch));
  else if (seat.role === "mentee" && hub.allowed(id, "mentee", seat.token)) hub.seed(id, demoControllerSchema.parse(z.object({controller: z.unknown()}).parse(raw).controller));
  else throw new SessionError("demo-closed", "The demonstration is not running.", 409);
  return Response.json({ok: true}, {headers: noStore});
}
/** The mentee's own controller state, for staff overlays and replays. Only a seated mentee token its
 * stream vouched for in the last few seconds may post, and only for the position that stream holds. */
async function menteeShadow(request: Request, id: string) {
  const raw = await readBody(request, 64_000, "Controller update is too large."), seat = seatSchema.parse(raw);
  const key = shadowKey(id, seat.positionId?.split(",")[0]);
  if (seat.role !== "mentee" || !shadow.allowed(key, "trainee", seat.token)) throw new SessionError("shadow-closed", "Reconnect to the session first.", 409);
  shadow.publish(key, demoBatchSchema.parse(z.object({batch: z.unknown()}).parse(raw).batch), shadow.seatAccount(key, seat.token));
  return Response.json({watched: shadow.watchers(key) > 0}, {headers: noStore});
}
/** How long an open stream keeps its last confirmed access while the sign-in service is unreachable. */
const STREAM_ACCESS_GRACE_MS = 5 * 60_000;
async function stream(request: Request, id: string) {
  const seat = seatSchema.parse({role: request.headers.get("x-simulator-role"), token: request.headers.get("x-simulator-seat")});
  let actor = await authorize(request, seat.role !== "mentee", mentee);
  await requireLocal(id);
  const initial = await service.frame(actor, id, seat.role, seat.token).catch(error => ended(error, id, actor));
  const encoder = new TextEncoder();
  // Pages that ask for it get compact binary packets carrying only what changed since the last one.
  const compact = request.headers.get(STREAM_HEADER) === STREAM_FORMAT ? new StreamEncoder() : null;
  let cancelled = false, wake: (() => void) | undefined;
  const unsubscribe = hub.subscribe(id, () => wake?.());
  // Staff and spectator pages may ask for one mentee position's controller state, for overlays.
  const watched = seat.role === "mentee" ? null : shadowPositionSchema.safeParse(new URL(request.url).searchParams.get("shadow") ?? undefined).data ?? null;
  const watchedKey = watched ? shadowKey(id, watched) : null;
  const unwatch = watchedKey ? shadow.subscribe(watchedKey, () => wake?.()) : () => {};
  const response = new ReadableStream<Uint8Array>({
    async start(controller) {
      let contentRevision = -1, revision = -1, authorizedAt = Date.now(), recheckAt = authorizedAt + 60_000;
      const send = (value: {type: string; [key: string]: unknown}) => {if (!cancelled) controller.enqueue(compact ? compact.packet(value) : encoder.encode(`data: ${JSON.stringify(value)}\n\n`));};
      // Demonstration mirrors go out as soon as they arrive, between the regular state frames.
      let demoSeq = 0, presenter = false, shadowSeq = 0;
      const flushDemo = () => {
        if (!presenter) {
          const update = hub.read(id, demoSeq);
          if (update) {send({type: "demo", ...update}); demoSeq = update.seq;}
        } else {
          const seed = hub.readSeed(id, demoSeq);
          if (seed) send({type: "demo-seed", controller: seed.controller});
          demoSeq = Math.max(demoSeq, hub.read(id, 0)?.seq ?? demoSeq);
        }
        if (watchedKey) {
          const update = shadow.read(watchedKey, shadowSeq);
          if (update) {send({type: "shadow", positionId: watched, ...update}); shadowSeq = update.seq;}
        }
      };
      try {
        let frame = initial;
        while (!cancelled && !request.signal.aborted) {
          presenter = demoPresenter(frame.exercise.demonstration, seat.role, actor.accountId);
          if (seat.role === "mentee") shadow.trust(shadowKey(id, frame.positionId), "trainee", seat.token, true, actor.accountId);
          hub.trust(id, presenter ? "presenter" : seat.role === "mentee" && (!frame.exercise.demonstration?.positionId || frame.exercise.demonstration.positionId === frame.positionId) ? "mentee" : "watcher", seat.token, seat.role === "spectator" ? undefined : !!frame.exercise.demonstration);
          if (frame.contentRevision !== contentRevision) {
            send({type: "snapshot", positionId: frame.positionId, positionIds: frame.positionIds, exercise: frame.exercise, session: frame.session, scenario: frame.scenario}); contentRevision = frame.contentRevision;
          } else if (revision !== frame.exercise.revision) {
            const {id, revision, elapsed, aircraft, running, conflicts, collisions, terrainStatus, interceptFeedback} = frame.exercise;
            send({type: "motion", state: {id, revision, elapsed, aircraft, running, conflicts, collisions, terrainStatus, interceptFeedback}, session: frame.session});
          } else send({type: "presence", session: frame.session});
          revision = frame.exercise.revision;
          for (const deadline = Date.now() + SESSION_FRAME_MS; !cancelled && !request.signal.aborted;) {
            flushDemo();
            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            await new Promise<void>(resolve => {const timer = setTimeout(resolve, remaining); wake = () => {clearTimeout(timer); resolve();};});
          }
          if (cancelled || request.signal.aborted) break;
          if (Date.now() >= recheckAt) {
            try {actor = await authorize(request, seat.role !== "mentee", mentee); authorizedAt = Date.now(); recheckAt = authorizedAt + 60_000;}
            catch (error) {
              // A short sign-in outage keeps the open stream on its last confirmed access, retried every
              // ten seconds, instead of ending the session for everyone. A clear denial still ends it.
              if (!(error instanceof SessionError) || error.status < 500 || Date.now() - authorizedAt >= STREAM_ACCESS_GRACE_MS) throw error;
              recheckAt = Date.now() + 10_000;
            }
          }
          frame = await service.frame(actor, id, seat.role, seat.token);
        }
      } catch (error) {
        const failure = error instanceof SessionError ? error : new SessionError("unavailable", "Connection interrupted. Reconnecting…", 503);
        send({type: "failure", code: failure.code, error: failure.message, status: failure.status});
      } finally {unsubscribe(); unwatch(); if (!cancelled) controller.close();}
    },
    cancel() {cancelled = true; wake?.();},
  });
  return new Response(response, {headers: {...noStore, "content-type": compact ? STREAM_BINARY_TYPE : "text/event-stream", "x-accel-buffering": "no", "connection": "keep-alive"}});
}

return {sessionCollection, sessionOperation};
}
const api = createSessionApi(sqlSessionStore, authorizeSessionRequest, requireLocalSession);
export const sessionCollection = api.sessionCollection;
export const sessionOperation = api.sessionOperation;
