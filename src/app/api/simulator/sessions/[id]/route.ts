import {withSweatboxRuntime} from "@/src/simulator/server/runtime-gateway";
import {sessionOperation} from "@/src/simulator/server/session-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const dispatch = withSweatboxRuntime(sessionOperation);
export async function DELETE(request: Request, context: {params: Promise<{id: string}>}) {
  return dispatch(request, (await context.params).id, "end");
}
