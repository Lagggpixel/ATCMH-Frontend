import {withSweatboxRuntime} from "@/src/simulator/server/runtime-gateway";
import {replayApi} from "@/src/simulator/server/replay-api";
export const dynamic = "force-dynamic";
const dispatch = withSweatboxRuntime(replayApi);
export async function GET(request: Request) {return dispatch(request);}
