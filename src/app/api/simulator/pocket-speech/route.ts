import {createPocketProxy} from "@/src/simulator/server/pocket-proxy";
import {authorizeSessionRequest} from "@/src/simulator/server/session-auth";
import {sessionFailure} from "@/src/simulator/server/session-api";
import {assignedMentee} from "@/src/simulator/server/session-store";
import {sqlSessionStore} from "@/src/simulator/server/session-store";
import {messageSpeech} from "@/src/simulator/server/message-speech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const api = createPocketProxy(request => authorizeSessionRequest(request, false, {hasAssignment: assignedMentee.hasAssignment}), sessionFailure, () => process.env.FRONTEND_PUBLIC_ORIGIN ?? "atcmh", fetch,
  async (actor, reference) => messageSpeech(await sqlSessionStore.read(reference.sessionId), actor, reference.messageId));
export const GET = api;
export const POST = api;
