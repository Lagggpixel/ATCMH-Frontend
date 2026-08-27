import { requireManagementCapability } from "@/src/lib/discord-auth";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { commitPreviewedImport } from "@/src/lib/management-imports";
import { emitDashboardAuditEvent } from "@/src/lib/dashboard-audit-client";
import { quizImportedAuditEvent } from "@/src/lib/management-audit";

export async function POST(request: Request) {
  const actor = await requireManagementCapability(request, "import-exams");
  if (actor instanceof Response) return withManagementCors(request, actor);
  try {
    const body = await request.json() as { normalizedImport?: unknown; idempotencyKey?: unknown };
    if (typeof body.idempotencyKey !== "string") return withManagementCors(request, new Response("idempotencyKey is required", { status: 400 }));
    const result = await commitPreviewedImport(body.normalizedImport, body.idempotencyKey, actor.discordId,
      actor.impersonating ? { realActorAccountId: actor.accountId, impersonatedAccountId: actor.impersonatedAccountId!, impersonatedDiscordId: actor.impersonatedDiscordId! } : undefined);
    if (result.valid && "result" in result && result.result?.quizId) {
      await emitDashboardAuditEvent(quizImportedAuditEvent(result.result.quizId, body.idempotencyKey, actor));
    }
    return withManagementCors(request, Response.json(result, { status: result.valid ? 201 : 422 }));
  } catch (error) {
    return withManagementCors(request, new Response(error instanceof Error ? error.message : "Import failed", { status: 503 }));
  }
}
export function OPTIONS(request: Request) { return corsPreflight(request); }
