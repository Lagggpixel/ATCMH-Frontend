import {z} from "zod";
import {SessionError} from "../sessions";
import {authorizeSessionRequest} from "./session-auth";
import {sessionFailure} from "./session-api";

export interface Person {id: string; name: string}
type Fetch = (input: URL, init: RequestInit) => Promise<Response>;
const directorySchema = z.array(z.object({id: z.string().regex(/^\d{15,20}$/), username: z.string().nullish()}).passthrough());
const CACHE_MS = 60_000;

/** Narrow a member directory to the best matches for a trainer's search. Names first, then exact Discord IDs. */
export function searchPeople(people: Person[], query: string, limit = 20): Person[] {
  const value = query.trim().toLowerCase();
  if (!value) return [];
  if (/^\d{15,20}$/.test(value)) return people.filter(person => person.id === value).slice(0, 1);
  const starts = people.filter(person => person.name.toLowerCase().startsWith(value));
  const contains = people.filter(person => !person.name.toLowerCase().startsWith(value) && person.name.toLowerCase().includes(value));
  return [...starts, ...contains].slice(0, limit);
}

export function createPeopleApi(authorize = authorizeSessionRequest, fetchImpl: Fetch = fetch, env: Record<string, string | undefined> = process.env) {
  let cached: {at: number; people: Person[]} | undefined;
  async function directory() {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.people;
    const api = env.DASHBOARD_API_URL, origin = env.FRONTEND_PUBLIC_ORIGIN;
    if (!api || !origin) throw new SessionError("unavailable", "The member directory is unavailable.", 503);
    const response = await fetchImpl(new URL("/users", api), {headers: {origin}, cache: "no-store", signal: AbortSignal.timeout(8000)}).catch(() => null);
    if (!response?.ok) throw new SessionError("unavailable", "The member directory is temporarily unavailable. Try again.", 503);
    const people = directorySchema.parse(await response.json()).map(user => ({id: String(user.id), name: user.username?.trim() || String(user.id)}));
    cached = {at: Date.now(), people};
    return people;
  }
  return async function people(request: Request) {
    try {
      const actor = await authorize(request, true);
      if (!actor.canAssign) throw new SessionError("forbidden", "Only trainers with Sweatbox access or administrators can assign mentees.", 403);
      const query = z.string().max(80).parse(new URL(request.url).searchParams.get("q") ?? "");
      return Response.json({people: searchPeople(await directory(), query)}, {headers: {"cache-control": "no-store"}});
    } catch (error) {return sessionFailure(error);}
  };
}
export const people = createPeopleApi();
