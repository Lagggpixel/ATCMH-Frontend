import {z} from "zod/v3";
import {notifyAssignment, notifyFeedback} from "@/src/simulator/server/assignment-notifications";
import {requireGateway} from "@/src/simulator/server/runtime-identity";
import {sessionFailure} from "@/src/simulator/server/session-api";

export const runtime = "nodejs";
const id = z.string().min(1).max(256);
const details = z.object({title: z.string().min(1).max(256), airport: z.string().regex(/^[A-Z0-9]{4}$/), trainer: z.string().max(128)});
const message = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("assignment"), notice: details.extend({discordId: id}).strict()}).strict(),
  z.object({kind: z.literal("feedback"), notice: details.extend({accountId: id.optional(), discordId: id.optional(), replayId: z.string().uuid().optional()}).strict()}).strict(),
]);

export async function POST(request: Request) {
  const key = process.env.SWEATBOX_NOTIFICATION_KEY ?? "";
  if (!key) return new Response(null, {status: 404});
  try {
    requireGateway(request, key);
    const body = await request.text();
    if (body.length > 4096) return new Response(null, {status: 413});
    const {kind, notice} = message.parse(JSON.parse(body));
    if (kind === "assignment") await notifyAssignment(notice);
    else {
      if (!notice.accountId && !notice.discordId) return new Response(null, {status: 400});
      await notifyFeedback(notice);
    }
    return new Response(null, {status: 204});
  } catch (error) {return sessionFailure(error);}
}
