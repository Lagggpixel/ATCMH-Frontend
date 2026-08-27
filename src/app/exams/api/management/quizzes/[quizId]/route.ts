import { requireManagementCapability } from "@/src/lib/discord-auth";
import { managedQuizDto } from "@/src/lib/management-dto";
import { assertManagementWritesEnabled, getManagedQuiz, saveManagedQuiz } from "@/src/lib/management-service";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { managementAuthorizationError, managementError, ManagementValidationError, parseManagementJson } from "@/src/lib/management-route";
import { emitDashboardAuditEvent } from "@/src/lib/dashboard-audit-client";
import { quizCategoryMovedAuditEvent, quizSavedAuditEvent } from "@/src/lib/management-audit";

interface RouteContext { params: Promise<{ quizId: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const actor = await requireManagementCapability(request, "manage-exams");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    const quiz = await getManagedQuiz((await params).quizId, actor);
    if (!quiz) return withManagementCors(request, Response.json({ error: "Quiz not found" }, { status: 404 }));
    return withManagementCors(request, Response.json({ quiz: managedQuizDto(quiz) }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const actor = await requireManagementCapability(request, "manage-exams");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    assertManagementWritesEnabled();
    const quizId = (await params).quizId;
    const body = await parseManagementJson(request);
    if (body.id !== undefined && body.id !== quizId) {
      throw new ManagementValidationError("The quiz id must match the URL", [{ path: "id", message: "must match quizId" }]);
    }
    const previousQuiz = actor.canManageAll ? await getManagedQuiz(quizId, actor) : null;
    const quiz = await saveManagedQuiz({ ...body, id: quizId } as never, actor);
    await emitDashboardAuditEvent(quizSavedAuditEvent(quiz, actor, "update"));
    if (previousQuiz && previousQuiz.categoryId !== quiz.categoryId) {
      await emitDashboardAuditEvent(quizCategoryMovedAuditEvent(quiz, actor, previousQuiz));
    }
    return withManagementCors(request, Response.json({ valid: true, quiz: managedQuizDto(quiz) }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export function OPTIONS(request: Request) { return corsPreflight(request); }
