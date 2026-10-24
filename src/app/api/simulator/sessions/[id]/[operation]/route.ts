import {sessionOperation} from "@/src/simulator/server/session-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = {params: Promise<{id: string; operation: string}>};
export async function POST(request: Request, context: Context) {
  const {id, operation} = await context.params;
  if (!["join", "leave", "commands", "assign"].includes(operation)) return new Response(null, {status: 404});
  return sessionOperation(request, id, operation);
}
export async function GET(request: Request, context: Context) {
  const {id, operation} = await context.params;
  if (operation !== "stream") return new Response(null, {status: 404});
  return sessionOperation(request, id, operation);
}
