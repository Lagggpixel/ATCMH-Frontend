import {sessionOperation} from "@/src/simulator/server/session-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function DELETE(request: Request, context: {params: Promise<{id: string}>}) {
  return sessionOperation(request, (await context.params).id, "end");
}
