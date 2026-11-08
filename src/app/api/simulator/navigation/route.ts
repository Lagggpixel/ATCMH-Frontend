import {createNavigationApi} from "@/src/simulator/server/navigation-api";
import {authorizeAirportReference} from "@/src/simulator/server/airport-reference-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createNavigationApi(undefined, authorizeAirportReference);
