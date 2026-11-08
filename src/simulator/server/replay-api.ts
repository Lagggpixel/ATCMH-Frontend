import {participantReplay, type ReplayDetail} from "../replays";
import {z} from "zod/v3";
import {authorizeSessionRequest} from "./session-auth";
import {sessionFailure} from "./session-api";
import {updateReplayFeedback, updatePositionFeedback} from "./replay-feedback";
import {listReplays, readReplay} from "./replay-store";
import {deflateRawSync} from "node:zlib";
import {encodeReplayBody, REPLAY_BINARY_TYPE, wrapReplay} from "../replay-binary";
import {replayAnchors} from "./replay-chunks";

const pageNumber = z.coerce.number().int().min(0).max(1_000_000);
export function createReplayApi(authorize = authorizeSessionRequest, list = listReplays, read = readReplay) {
  return async (request: Request, id?: string) => {
    try {
      const params = new URL(request.url).searchParams;
      const scope = z.enum(["all", "mine", "self"]).parse(params.get("scope") ?? "all");
      // "self" is a Mentee's own history, open to any signed-in account; the other scopes need Sweatbox staff.
      const actor = scope === "self" ? await authorize(request, false, {anySignedIn: true}) : await authorize(request, true);
      if (request.method === "POST") {
        if (!id || scope === "self") throw new Error("Replay ID required");
        const input = z.object({expected: z.string().max(6000), feedback: z.string().trim().max(6000), positionId: z.string().min(1).max(32).optional()}).strict().parse(await request.json());
        return Response.json(await (input.positionId ? updatePositionFeedback(z.string().uuid().parse(id), actor, input.positionId, input.expected, input.feedback) : updateReplayFeedback(z.string().uuid().parse(id), actor, input.expected, input.feedback)), {headers: {"cache-control": "no-store"}});
      }
      const filters = {
        ...(scope === "self" ? {menteeId: actor.accountId} : {mentorId: scope === "mine" ? actor.accountId : undefined}),
        search: z.string().trim().max(100).parse(params.get("q") ?? ""),
        recordedOn: params.get("date") ? Date.parse(z.string().date().parse(params.get("date"))) : undefined,
        airport: z.string().regex(/^(?:[A-Z0-9]{4})?$/).parse(params.get("airport") ?? ""),
      };
      const binary = !!id && params.get("format") === "binary";
      const data = id ? await read(z.string().uuid().parse(id), binary ? 0 : pageNumber.parse(params.get("after") ?? 0), scope === "self" ? actor.accountId : undefined, binary) : await list(pageNumber.parse(params.get("offset") ?? 0), filters);
      const visible = id && scope === "self" ? participantReplay(data as ReplayDetail, actor.accountId) : data;
      if (binary) {
        // One compact download replaces many pages of JSON frames.
        const detail = visible as ReplayDetail, body = encodeReplayBody(detail, detail.initial ? replayAnchors(detail.initial) : []);
        return new Response(wrapReplay(new Uint8Array(deflateRawSync(body, {level: 6}))), {headers: {"cache-control": "no-store", "content-type": REPLAY_BINARY_TYPE}});
      }
      return Response.json(visible, {headers: {"cache-control": "no-store"}});
    } catch (error) {return sessionFailure(error);}
  };
}
export const replayApi = createReplayApi();
