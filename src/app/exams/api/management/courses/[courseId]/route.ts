import { requireManagementCapability } from "@/src/lib/discord-auth";
import { getManagedCourseForActor, saveManagedCourse } from "@/src/lib/course-management-service";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { managementAuthorizationError, managementError, parseManagementJson } from "@/src/lib/management-route";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const actor = await requireManagementCapability(request, "manage-courses");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    const course = await getManagedCourseForActor((await params).courseId, actor);
    if (!course) return withManagementCors(request, Response.json({ error: "Course not found" }, { status: 404 }));
    return withManagementCors(request, Response.json({ course }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const actor = await requireManagementCapability(request, "manage-courses");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    const courseId = (await params).courseId;
    const body = await parseManagementJson(request);
    if (body.id !== undefined && body.id !== courseId) throw new Error("Course IDs must match the route");
    const course = await saveManagedCourse({ ...body, id: courseId }, actor);
    return withManagementCors(request, Response.json({ course }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}
