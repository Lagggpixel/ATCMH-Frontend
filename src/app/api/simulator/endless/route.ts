
import {endlessApi} from "@/src/simulator/server/endless-api";
import {withSweatboxRuntime} from "@/src/simulator/server/runtime-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withSweatboxRuntime(endlessApi);
export const POST = GET;
