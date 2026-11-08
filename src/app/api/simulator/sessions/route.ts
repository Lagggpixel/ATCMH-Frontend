import {withSweatboxRuntime} from "@/src/simulator/server/runtime-gateway";
import {sessionCollection} from "@/src/simulator/server/session-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withSweatboxRuntime(sessionCollection);
export const POST = GET;
