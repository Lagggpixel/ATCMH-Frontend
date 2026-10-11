import {z} from "zod";
import {authorizeSessionRequest} from "./session-auth";
import {sessionFailure} from "./session-api";
import {listReplays, readReplay} from "./replay-store";

const pageNumber = z.coerce.number().int().min(0).max(1_000_000);
export function createReplayApi(authorize = authorizeSessionRequest, list = listReplays, read = readReplay) {
  return async (request: Request, id?: string) => {
    try {
      await authorize(request, true);
      const params = new URL(request.url).searchParams;
      const data = id ? await read(z.string().uuid().parse(id), pageNumber.parse(params.get("after") ?? 0)) : await list(pageNumber.parse(params.get("offset") ?? 0));
      return Response.json(data, {headers: {"cache-control": "no-store"}});
    } catch (error) {return sessionFailure(error);}
  };
}
export const replayApi = createReplayApi();
