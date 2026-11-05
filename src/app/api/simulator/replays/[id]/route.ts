import {withSweatboxRuntime} from "@/src/simulator/server/runtime-gateway";
import {replayApi} from "@/src/simulator/server/replay-api";
export const dynamic = "force-dynamic";
const dispatch = withSweatboxRuntime(replayApi);
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {return dispatch(request, (await context.params).id);}

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {return dispatch(request, (await context.params).id);}
