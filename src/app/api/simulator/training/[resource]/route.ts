import {trainingApi} from "@/src/simulator/server/training-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = {params: Promise<{resource: string}>};
export async function GET(request: Request, {params}: Context) {return trainingApi(request, (await params).resource);}
export const POST = GET;
