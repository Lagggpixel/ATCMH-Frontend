import {withSweatboxRuntime} from "@/src/simulator/server/runtime-gateway";
import {trainingApi} from "@/src/simulator/server/training-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const dispatch = withSweatboxRuntime(trainingApi);
type Context = {params: Promise<{resource: string}>};
export async function GET(request: Request, {params}: Context) {return dispatch(request, (await params).resource);}
export const POST = GET;
