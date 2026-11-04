import {withSweatboxRuntime} from "@/src/simulator/server/runtime-gateway";
import {trainingApi} from "@/src/simulator/server/training-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const dispatch = withSweatboxRuntime(trainingApi);
type Context = {params: Promise<{resource: string; id: string}>};
export async function GET(request: Request, {params}: Context) {const {resource, id} = await params; return dispatch(request, resource, id);}
export const POST = GET;
