
import {randomInt, randomUUID} from "node:crypto";
import {z} from "zod/v3";
import {AIRPORT_IDS, getAirport, runwayEnds} from "../airports";
import {compileEndless, endlessSectors} from "../endless/compile";
import {endlessDefinition, endlessPresets} from "../endless/definition";
import {initializeEndless} from "../endless/runtime";
import {SessionError} from "../sessions";
import {assertEndlessAccess} from "./endless-access";
import {listEndless, readEndlessReview, saveEndlessDefinition} from "./endless-store";
import {fetchNavigationData} from "./navigation-api";
import {readBody, sessionFailure} from "./session-api";
import {authorizeSessionRequest} from "./session-auth";
import {SessionService, type SessionRecord} from "./session-service";
import {sqlSessionStore} from "./session-store";

const id = z.string().uuid();
const requestSchema = z.discriminatedUnion("action", [
  z.object({action: z.literal("save"), id: id.optional(), version: z.number().int().nonnegative(), definition: endlessDefinition}),
  z.object({action: z.literal("launch"), id, definition: endlessDefinition}),
  z.object({action: z.enum(["drain", "end"]), id}),
]);
const noStore = {headers: {"cache-control": "private, no-store"}};
const service = new SessionService(sqlSessionStore);
const airportList = () => AIRPORT_IDS.map(icao => {
  const airport = getAirport({airport: icao});
  return {icao, runways: [...new Set(runwayEnds(airport).map(end => end.id))], sectors: endlessSectors(airport).map(({id, name}) => ({id, name}))};
});

export function createEndlessApi(authorize = authorizeSessionRequest, loadNavigation = fetchNavigationData) {
  return async (request: Request) => {
    try {
      const actor = await authorize(request, true);
      if (request.method === "GET") {
        const params = new URL(request.url).searchParams;
        const replay = params.get("replay");
        if (replay) {
          const at = params.has("at") ? z.coerce.number().finite().nonnegative().parse(params.get("at")) : undefined;
          return Response.json(await readEndlessReview(actor.accountId, id.parse(replay), at), noStore);
        }
        return Response.json({presets: endlessPresets, airports: airportList(), ...await listEndless(actor.accountId)}, noStore);
      }
      const input = requestSchema.parse(await readBody(request, 100_000, "This Endless scenario is too large."));
      if (input.action === "save" || input.action === "launch") {
        const repeat = async () => {
          if (input.action !== "launch") return false;
          const previous = await sqlSessionStore.read(input.id).catch(error => {
            if (error instanceof SessionError && error.code === "not-found") return null;
            throw error;
          });
          if (!previous) return false;
          if (!previous.endless) throw new SessionError("not-found", "This Endless run is unavailable.", 404);
          assertEndlessAccess(previous, actor, "staff", true);
          return true;
        };
        if (await repeat()) return Response.json({id: input.id}, noStore);
        const prepared = await compileEndless(input.definition, loadNavigation).catch(error => {
          if (error instanceof SessionError) throw error;
          throw new SessionError("invalid-endless", error instanceof Error ? error.message : "Check the traffic streams.", 422);
        });
        if (input.action === "save")
          return Response.json(await saveEndlessDefinition(actor.accountId, input.id ?? randomUUID(), input.version, prepared.definition), noStore);
        const now = Date.now(), {exercise, runtime} = initializeEndless(prepared, randomInt(0, 0x100000000));
        const record: SessionRecord = {id: input.id, title: prepared.definition.title, ownerId: actor.accountId, ownerName: actor.displayName,
          createdAt: now, updatedAt: now, tickAt: now, contentRevision: 0, exercise: {...exercise, id: input.id}, endless: runtime, staff: null, mentee: null};
        try {await sqlSessionStore.create(record);}
        catch (error) {if (!await repeat()) throw error;}
        return Response.json({id: record.id}, noStore);
      }
      return Response.json(await service.controlEndless(actor, input.id, input.action), noStore);
    } catch (error) {return sessionFailure(error);}
  };
}

export const endlessApi = createEndlessApi();
