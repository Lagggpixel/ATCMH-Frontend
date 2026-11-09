import {z} from "zod/v3";
import {messageSpeech} from "./message-speech";
import {requireLocalSession} from "./radar-moved";
import {createReplayApi} from "./replay-api";
import {hasReplayAtAirport} from "./replay-store";
import {authorizeDelegation, requireGateway} from "./runtime-identity";
import {createSessionApi, sessionFailure} from "./session-api";
import {sqlSessionStore} from "./session-store";
import type {SessionWeatherLoader} from "./session-weather";
import {createTrainingApi} from "./training-api";
import {TrainingService} from "./training-service";

export function createRuntimeHandler(key: string, weather?: SessionWeatherLoader) {
  const sessions = createSessionApi(sqlSessionStore, authorizeDelegation, requireLocalSession, weather);
  const training = createTrainingApi(new TrainingService(weather), authorizeDelegation);
  const replays = createReplayApi(authorizeDelegation);
  const operations = new Set(["join", "leave", "commands", "events", "assign", "demo", "shadow", "positions", "position-assignment", "rename"]);
  return async (request: Request): Promise<Response> => {
    try {
      requireGateway(request, key);
      const {pathname, searchParams} = new URL(request.url);
      const method = request.method;
      if (method === "GET" && pathname === "/internal/assignment") {
        const discordId = z.string().min(1).max(64).parse(searchParams.get("discordId"));
        return Response.json(await sqlSessionStore.hasAssignment(discordId));
      }
      if (method === "GET" && pathname === "/internal/replay-airport") {
        const accountId = z.string().min(1).max(256).parse(searchParams.get("accountId"));
        const airport = z.string().regex(/^[A-Z0-9]{4}$/).parse(searchParams.get("airport"));
        return Response.json(await hasReplayAtAirport(accountId, airport));
      }
      if (method === "GET" && pathname === "/internal/message") {
        const actor = await authorizeDelegation(request, false, sqlSessionStore);
        const sessionId = z.string().uuid().parse(searchParams.get("sessionId"));
        const messageId = z.string().min(1).max(256).parse(searchParams.get("messageId"));
        return Response.json(messageSpeech(await sqlSessionStore.read(sessionId), actor, messageId));
      }
      const route = /^\/api\/simulator\/(sessions|training|replays)(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(pathname);
      if (route) {
        const [, resource, id, operation] = route;
        if (resource === "sessions") {
          if (!id && (method === "GET" || method === "POST")) return sessions.sessionCollection(request);
          if (id && !operation && method === "DELETE") return sessions.sessionOperation(request, id, "end");
          if (id && operation && (method === "GET" && operation === "stream" || method === "POST" && operations.has(operation))) {
            // Demonstration still requires an active seat vouched for by its stream.
            if (operation === "demo" || operation === "shadow") await authorizeDelegation(request, false, sqlSessionStore);
            return sessions.sessionOperation(request, id, operation);
          }
        }
        if (resource === "training" && id && (method === "GET" || method === "POST")) return training(request, id, operation);
        if (resource === "replays" && !operation && (method === "GET" || id && method === "POST")) return replays(request, id);
      }
      return new Response(null, {status: 404});
    } catch (error) {return sessionFailure(error);}
  };
}
