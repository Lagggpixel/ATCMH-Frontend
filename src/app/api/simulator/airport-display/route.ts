import {createAirportDisplayApi} from "@/src/simulator/server/airport-display-api";
import {authorizeAirportReference} from "@/src/simulator/server/airport-reference-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createAirportDisplayApi(undefined, undefined, undefined, authorizeAirportReference);
