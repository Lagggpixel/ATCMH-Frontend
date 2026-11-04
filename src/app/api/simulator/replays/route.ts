import {withSweatboxRuntime} from "@/src/simulator/server/runtime-gateway";
import {replayApi} from "@/src/simulator/server/replay-api";
export const dynamic = "force-dynamic";
export const GET = withSweatboxRuntime(replayApi);
