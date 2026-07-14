import { requireManagementCapability } from "@/src/lib/discord-auth";
import { csvTemplate } from "@/src/lib/import-service";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";

export async function GET(request: Request) {
  const actor = await requireManagementCapability(request, "import-exams");
  return withManagementCors(request, actor instanceof Response ? actor : new Response(`${csvTemplate}\nExample quiz,Existing category,Example question,Correct answer,true,1,1\nExample quiz,Existing category,Example question,Other answer,false,1,2\n`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=atcmh-quiz-import-template.csv" } }));
}
export function OPTIONS(request: Request) { return corsPreflight(request); }
