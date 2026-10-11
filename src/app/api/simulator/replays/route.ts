import {replayApi} from "@/src/simulator/server/replay-api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {return replayApi(request);}
