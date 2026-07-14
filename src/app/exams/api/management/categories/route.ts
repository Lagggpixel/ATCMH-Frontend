import { requireManagementCapability } from "@/src/lib/discord-auth";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { assertManagementWritesEnabled, createManagedCategory, listManagedCategories } from "@/src/lib/management-service";
import { managementAuthorizationError, managementError, ManagementValidationError, optionalString, parseManagementJson, requiredString } from "@/src/lib/management-route";

export async function GET(request: Request) {
  const actor = await requireManagementCapability(request, "manage-system");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    return withManagementCors(request, Response.json({ categories: await listManagedCategories(actor) }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export async function POST(request: Request) {
  const actor = await requireManagementCapability(request, "manage-system");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    assertManagementWritesEnabled();
    const body = await parseManagementJson(request);
    const parentId = optionalString(body, "parentId");
    if (parentId === "") {
      throw new ManagementValidationError("Invalid parentId", [{ path: "parentId", message: "must be omitted or a UUID" }]);
    }
    const category = await createManagedCategory({ name: requiredString(body, "name"), parentId }, actor);
    return withManagementCors(request, Response.json({ category }, { status: 201 }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export function OPTIONS(request: Request) { return corsPreflight(request); }
