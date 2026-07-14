import { requireManagementCapability } from "@/src/lib/discord-auth";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { assertManagementWritesEnabled, listQuizUnlocks, setQuizUnlock } from "@/src/lib/management-service";
import { managementAuthorizationError, managementError, ManagementValidationError, optionalString, parseManagementJson, requiredString } from "@/src/lib/management-route";

interface RouteContext { params: Promise<{ quizId: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const actor = await requireManagementCapability(request, "unlock-learners");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    return withManagementCors(request, Response.json({ unlocks: await listQuizUnlocks((await params).quizId, actor) }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const actor = await requireManagementCapability(request, "unlock-learners");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    assertManagementWritesEnabled();
    const body = await parseManagementJson(request);
    if (typeof body.unlocked !== "boolean") {
      throw new ManagementValidationError("Invalid unlocked", [{ path: "unlocked", message: "expected a boolean" }]);
    }
    const quizId = (await params).quizId;
    const discordId = requiredString(body, "discordId");
    const userName = optionalString(body, "userName");
    await setQuizUnlock({ quizId, discordId, userName, unlocked: body.unlocked }, actor);
    return withManagementCors(request, Response.json({ unlock: { quizId, discordId, userName, unlocked: body.unlocked } }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export function OPTIONS(request: Request) { return corsPreflight(request); }
