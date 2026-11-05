import {createScopeDataApi} from "@/src/simulator/server/scope-data-api";
import {authorizeAirportReference} from "@/src/simulator/server/airport-reference-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createScopeDataApi(undefined, undefined, authorizeAirportReference);
