import { requireManagementCapability } from "@/src/lib/discord-auth";
import { deleteManagementAttempt, getManagementAttempt } from "@/src/lib/management-attempts";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { managementAuthorizationError, managementError } from "@/src/lib/management-route";
import { assertAdministrator, assertManagementCapability } from "@/src/lib/permissions";

interface RouteContext { params: Promise<{ attemptId: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const actor = await requireManagementCapability(request, "review-attempts");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    assertManagementCapability(actor, "review-attempts");
    const attempt = await getManagementAttempt((await params).attemptId);
    if (!attempt) return withManagementCors(request, Response.json({ error: "Attempt not found" }, { status: 404 }));
    return withManagementCors(request, Response.json({ attempt }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const actor = await requireManagementCapability(request, "review-attempts");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    assertManagementCapability(actor, "review-attempts");
    assertAdministrator(actor);
    await deleteManagementAttempt((await params).attemptId);
    return withManagementCors(request, new Response(null, { status: 204 }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export function OPTIONS(request: Request) { return corsPreflight(request); }
