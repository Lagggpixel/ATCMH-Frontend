import {z} from "zod";
import {envelopeSchema} from "../protocol";
import {invalidRequestMessage} from "../request-validation";
import {SESSION_FRAME_MS, SessionError} from "../sessions";
import {authorizeSessionRequest} from "./session-auth";
import {SessionService, type SessionStore} from "./session-service";
import {sqlSessionStore} from "./session-store";
import {requireLocalSession} from "./radar-moved";

const idSchema = z.string().uuid();
const seatSchema = z.object({role: z.enum(["staff", "mentee"]), token: z.string().uuid()});
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
export function createSessionApi(store: SessionStore, authorize = authorizeSessionRequest, requireLocal = async (_id: string) => {}) {
const service = new SessionService(store);
async function sessionCollection(request: Request) {
  try {
    const actor = await authorize(request, true);
    if (new URL(request.url).searchParams.has("code")) throw new SessionError("not-found", "Joining by code is no longer available. Open the session link from Sessions.", 404);
    if (request.method === "GET") return Response.json({sessions: (await service.list(actor)).filter(s => !/:(approach|center)$/.test(s.trainingStation ?? ""))}, {headers: noStore});
    throw new SessionError("scenario-required", "Choose a published scenario to create a training session.", 409);
  } catch (error) {return sessionFailure(error);}
}
async function sessionOperation(request: Request, id: string, operation: string) {
  try {
    idSchema.parse(id);
    if (operation === "end") {
      const actor = await authorize(request, true);
      await requireLocal(id);
      await service.end(actor, id);
      return Response.json({ended: true}, {headers: noStore});
    }
    if (operation === "stream") return await stream(request, id);
    const raw = await body(request), seat = seatSchema.parse(raw);
    const actor = await authorize(request, seat.role === "staff" && operation !== "leave");
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
async function stream(request: Request, id: string) {
  const seat = seatSchema.parse({role: request.headers.get("x-simulator-role"), token: request.headers.get("x-simulator-seat")});
  let actor = await authorize(request, seat.role === "staff");
  await requireLocal(id);
  const initial = await service.frame(actor, id, seat.role, seat.token);
  const encoder = new TextEncoder();
  let cancelled = false, wake: (() => void) | undefined;
  const response = new ReadableStream<Uint8Array>({
    async start(controller) {
      let contentRevision = -1, revision = -1, authorizedAt = Date.now();
      const send = (value: unknown) => {if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));};
      try {
        let frame = initial;
        while (!cancelled && !request.signal.aborted) {
          if (frame.contentRevision !== contentRevision) {
            send({type: "snapshot", exercise: frame.exercise, session: frame.session, scenario: frame.scenario}); contentRevision = frame.contentRevision;
          } else if (revision !== frame.exercise.revision) {
            const {id, revision, elapsed, aircraft, running, conflicts, collisions, terrainStatus} = frame.exercise;
            send({type: "motion", state: {id, revision, elapsed, aircraft, running, conflicts, collisions, terrainStatus}, session: frame.session});
          } else send({type: "presence", session: frame.session});
          revision = frame.exercise.revision;
          await new Promise<void>(resolve => {const timer = setTimeout(resolve, SESSION_FRAME_MS); wake = () => {clearTimeout(timer); resolve();};});
          if (cancelled || request.signal.aborted) break;
          if (Date.now() - authorizedAt >= 60_000) {actor = await authorize(request, seat.role === "staff"); authorizedAt = Date.now();}
          frame = await service.frame(actor, id, seat.role, seat.token);
        }
      } catch (error) {
        const failure = error instanceof SessionError ? error : new SessionError("unavailable", "Connection interrupted. Reconnecting…", 503);
        send({type: "failure", code: failure.code, error: failure.message, status: failure.status});
      } finally {if (!cancelled) controller.close();}
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
