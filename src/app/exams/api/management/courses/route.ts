import { requireManagementCapability } from "@/src/lib/discord-auth";
import { listManagedCoursesForActor, saveManagedCourse } from "@/src/lib/course-management-service";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { managementAuthorizationError, managementError, parseManagementJson } from "@/src/lib/management-route";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const actor = await requireManagementCapability(request, "manage-courses");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    return withManagementCors(request, Response.json({ courses: await listManagedCoursesForActor(actor) }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export async function POST(request: Request) {
  const actor = await requireManagementCapability(request, "manage-courses");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    const body = await parseManagementJson(request);
    if (body.id !== undefined) throw new Error("New courses must not include an id");
    const course = await saveManagedCourse(body, actor);
    return withManagementCors(request, Response.json({ course }, { status: 201 }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}
