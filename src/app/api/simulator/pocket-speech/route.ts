import {createPocketProxy} from "@/src/simulator/server/pocket-proxy";
import {authorizeSessionRequest} from "@/src/simulator/server/session-auth";
import {sessionFailure} from "@/src/simulator/server/session-api";
import {assignedMentee} from "@/src/simulator/server/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const api = createPocketProxy(request => authorizeSessionRequest(request, false, {hasAssignment: assignedMentee.hasAssignment}), sessionFailure, () => process.env.FRONTEND_PUBLIC_ORIGIN ?? "atcmh");
export const GET = api;
export const POST = api;
