import {z} from "zod";
import {authorizeSessionRequest} from "./session-auth";
import {sessionFailure} from "./session-api";
import {listReplays, readReplay} from "./replay-store";

const pageNumber = z.coerce.number().int().min(0).max(1_000_000);
export function createReplayApi(authorize = authorizeSessionRequest, list = listReplays, read = readReplay) {
  return async (request: Request, id?: string) => {
    try {
      const actor = await authorize(request, true);
      const params = new URL(request.url).searchParams;
      const filters = {
        mentorId: z.enum(["all", "mine"]).parse(params.get("scope") ?? "all") === "mine" ? actor.accountId : undefined,
        search: z.string().trim().max(100).parse(params.get("q") ?? ""),
        recordedOn: params.get("date") ? Date.parse(z.string().date().parse(params.get("date"))) : undefined,
        airport: z.string().regex(/^(?:[A-Z0-9]{4})?$/).parse(params.get("airport") ?? ""),
      };
      const data = id ? await read(z.string().uuid().parse(id), pageNumber.parse(params.get("after") ?? 0)) : await list(pageNumber.parse(params.get("offset") ?? 0), filters);
      return Response.json(data, {headers: {"cache-control": "no-store"}});
    } catch (error) {return sessionFailure(error);}
  };
}
export const replayApi = createReplayApi();
