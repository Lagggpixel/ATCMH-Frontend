import {trainingApi} from "@/src/simulator/server/training-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = {params: Promise<{resource: string; id: string}>};
export async function GET(request: Request, {params}: Context) {const {resource, id} = await params; return trainingApi(request, resource, id);}
export const POST = GET;
