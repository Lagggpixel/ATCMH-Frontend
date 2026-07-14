import { requireManagementCapability } from "@/src/lib/discord-auth";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { managedQuizDto } from "@/src/lib/management-dto";
import { moveManagedQuizCategory } from "@/src/lib/management-service";
import { managementAuthorizationError, managementError, parseManagementJson, requiredString } from "@/src/lib/management-route";

interface RouteContext { params: Promise<{ quizId: string }> }

export async function PATCH(request: Request, {params}: RouteContext) {
  const actor = await requireManagementCapability(request, "manage-system");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    const body = await parseManagementJson(request);
    const quiz = await moveManagedQuizCategory((await params).quizId, requiredString(body, "categoryId"), actor);
    return withManagementCors(request, Response.json({quiz: managedQuizDto(quiz)}));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export function OPTIONS(request: Request) { return corsPreflight(request); }
