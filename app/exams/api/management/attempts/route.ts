import { requireManagementCapability } from "@/src/lib/discord-auth";
import { listManagementAttemptPage } from "@/src/lib/management-attempts";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { managementAuthorizationError, managementError, ManagementValidationError } from "@/src/lib/management-route";
import { assertManagementCapability } from "@/src/lib/permissions";

function optionalPageNumber(value: string | null, name: "page" | "pageSize") {
  if (value === null) return undefined;
  if (!/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new ManagementValidationError(`Invalid ${name}`, [{ path: name, message: "expected a non-negative integer" }]);
  }
  return Number(value);
}

export async function GET(request: Request) {
  const actor = await requireManagementCapability(request, "review-attempts");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    assertManagementCapability(actor, "review-attempts");
    const url = new URL(request.url);
    const result = await listManagementAttemptPage({
      page: optionalPageNumber(url.searchParams.get("page"), "page"),
      pageSize: optionalPageNumber(url.searchParams.get("pageSize"), "pageSize"),
      query: url.searchParams.get("query") ?? "",
    });
    return withManagementCors(request, Response.json(result));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export function OPTIONS(request: Request) { return corsPreflight(request); }
