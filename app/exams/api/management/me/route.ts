import { requireManagementCapability } from "@/src/lib/discord-auth";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";

export async function GET(request: Request) {
  const actor = await requireManagementCapability(request, "manage-exams");
  return withManagementCors(request, actor instanceof Response ? actor : Response.json(actor));
}
export function OPTIONS(request: Request) { return corsPreflight(request); }
