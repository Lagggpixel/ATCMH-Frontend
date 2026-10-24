import {z} from "zod";
import {getAirport} from "../airports";
import type {NavigationCatalog, NavigationRoute} from "../navigation-data";
import {SessionError} from "../sessions";
import {authorizeSessionRequest} from "./session-auth";
import {sessionFailure} from "./session-api";

const coordinate = z.object({identifier: z.string().min(1).max(100),waypointType:z.string().max(32).optional(), vorType:z.string().max(32).optional(), slavedVariation:z.number().finite().min(-180).max(180).optional(), lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180)});
const upstreamSchema = z.object({version: z.literal(1), icao: z.string().length(4), revision: z.string().min(1).max(100),
  waypoints: z.array(coordinate.extend({id: z.string().min(1).max(100)})).max(5000),
  procedures: z.array(z.object({id: z.string().min(1).max(100), identifier: z.string().min(1).max(100), type: z.enum(["SID", "STAR", "Approach"]), approachType: z.string().max(100).optional(),
    // Common/transition segments can contain one named fix; empty geometry remains invalid.
    routes: z.array(z.object({id: z.string().min(1).max(200), transition: z.string().max(100).nullable(), points: z.array(coordinate).min(1).max(2000)})).max(200)})).max(3000)});
export type NavigationSource = z.infer<typeof upstreamSchema>;
const cache = new Map<string, {until: number; data: Promise<NavigationSource>}>();
export async function fetchNavigationData(airport: string): Promise<NavigationSource> {
  const cached = cache.get(airport); if (cached && cached.until > Date.now()) return cached.data;
  const base = process.env.INFINITE_HORIZON_API_URL, key = process.env.INFINITE_HORIZON_API_KEY;
  if (!base || !key) throw new SessionError("navigation-unavailable", "Navigation data is temporarily unavailable.", 503);
  const data = (async () => {
    try {
      const url = new URL(`/navigation/airports/${airport}/training-data`, base); url.searchParams.set("radiusNm", "100");
      url.searchParams.set("includeApproaches", "1");
      const response = await fetch(url, {headers: {"x-api-key": key}, signal: AbortSignal.timeout(15000), cache: "no-store", redirect: "error"});
      if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 5_000_000) throw new Error("Upstream response unavailable");
      const body = await response.text(); if (body.length > 5_000_000) throw new Error("Upstream response too large");
      const parsed = upstreamSchema.parse(JSON.parse(body)); if (parsed.icao !== airport) throw new Error("Airport mismatch");
      return parsed;
    } catch {cache.delete(airport); throw new SessionError("navigation-unavailable", "Navigation data is temporarily unavailable. Try again shortly.", 503);}
  })();
  cache.set(airport, {until: Date.now() + 300_000, data}); return data;
}
export function createNavigationApi(load = fetchNavigationData, authorize = authorizeSessionRequest) {
  return async (request: Request) => {
    try {
      const query = new URL(request.url).searchParams, code = query.get("airport") ?? "";
      // Learners can display procedure overlays; aircraft route imports remain staff-only.
      await authorize(request, query.has("route"));
      let airport; try {airport = getAirport({airport: code});} catch {throw new SessionError("invalid-airport", "Choose an available training airport.", 400);}
      const source = await load(code);
      const project = (p: z.infer<typeof coordinate>, id?: string) => {
        const x = (p.lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y = (p.lat - airport.origin.lat) * 60;
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 2000 || Math.abs(y) > 2000) throw new SessionError("invalid-navigation", "This route is outside the supported training area.", 422);
        return {x, y, name: p.identifier,...(p.waypointType?{waypointType:p.waypointType}:{}), ...(p.vorType?{vorType:p.vorType}:{}), ...(p.slavedVariation !== undefined ? {slavedVariation:p.slavedVariation} : {}), ...(id ? {fixId: id} : {})};
      };
      const overlay = query.get("overlay"), routeId = query.get("route") ?? overlay; let value: NavigationCatalog | NavigationRoute;
      if (routeId) {
        if (query.get("revision") !== source.revision) throw new SessionError("navigation-changed", "Navigation data changed. Reload the catalogue before selecting a route.", 409);
        const procedure = source.procedures.find(p => p.routes.some(r => r.id === routeId)), route = procedure?.routes.find(r => r.id === routeId);
        if (!procedure || !route) throw new SessionError("not-found", "This procedure route is unavailable.", 404);
        if (!overlay && route.points.length > 200) throw new SessionError("route-too-large", "This complete route exceeds the 200-waypoint exercise limit.", 422);
        value = {airport: code, revision: source.revision, procedureId: procedure.id, routeId, name: procedure.type === "Approach" && procedure.approachType ? `${procedure.approachType} ${procedure.identifier}` : procedure.identifier, type: procedure.type, points: route.points.map(p => project(p))};
      } else value = {airport: code, revision: source.revision,
        fixes: source.waypoints.map(p => ({id: p.id, name: p.identifier, point: project(p, p.id)})),
        procedures: source.procedures.map(p => ({id: p.id, name: p.type === "Approach" && p.approachType ? `${p.approachType} ${p.identifier}` : p.identifier, type: p.type, routes: p.routes.map(r => ({id: r.id, name: r.transition ?? "Common route", pointCount: r.points.length}))}))};
      return Response.json(value, {headers: {"cache-control": "private, no-store"}});
    } catch (error) {return sessionFailure(error);}
  };
}
export const navigationApi = createNavigationApi();
