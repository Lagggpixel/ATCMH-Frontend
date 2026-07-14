import { requireManagementCapability } from "@/src/lib/discord-auth";
import { managedQuizDto, managedQuizSummaryDto } from "@/src/lib/management-dto";
import { assertManagementWritesEnabled, listManagedQuizzes, saveManagedQuiz } from "@/src/lib/management-service";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { managementAuthorizationError, managementError, parseManagementJson } from "@/src/lib/management-route";

export async function GET(request: Request) {
  const actor = await requireManagementCapability(request, "manage-exams");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try { return withManagementCors(request, Response.json({ quizzes: (await listManagedQuizzes(actor)).map(managedQuizSummaryDto) })); }
  catch (error) { return withManagementCors(request, managementError(error)); }
}

export async function POST(request: Request) {
  const actor = await requireManagementCapability(request, "manage-exams");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    assertManagementWritesEnabled();
    const body = await parseManagementJson(request);
    if (body.id !== undefined) throw new Error("New quizzes must not include an id");
    const quiz = await saveManagedQuiz(body as never, actor);
    return withManagementCors(request, Response.json({ valid: true, quiz: managedQuizDto(quiz) }, { status: 201 }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}
export function OPTIONS(request: Request) { return corsPreflight(request); }
