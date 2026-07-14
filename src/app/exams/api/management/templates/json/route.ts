import { requireManagementCapability } from "@/src/lib/discord-auth";
import { importJsonSchema } from "@/src/lib/import-schema";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";

export async function GET(request: Request) {
  const actor = await requireManagementCapability(request, "import-exams");
  return withManagementCors(request, actor instanceof Response ? actor : Response.json(importJsonSchema, { headers: { "content-disposition": "attachment; filename=atcmh-quiz-import-schema.json" } }));
}
export function OPTIONS(request: Request) { return corsPreflight(request); }
