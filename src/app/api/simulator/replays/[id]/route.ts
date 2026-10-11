import {replayApi} from "@/src/simulator/server/replay-api";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {return replayApi(request, (await context.params).id);}
