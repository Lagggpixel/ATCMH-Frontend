import { requireManagementCapability } from "@/src/lib/discord-auth";
import { getCourseStatistics } from "@/src/lib/course-repository";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { managementAuthorizationError, managementError } from "@/src/lib/management-route";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const actor = await requireManagementCapability(request, "manage-courses");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    const statistics = await getCourseStatistics((await params).courseId);
    if (!statistics) return withManagementCors(request, Response.json({ error: "Course not found" }, { status: 404 }));
    return withManagementCors(request, Response.json({ statistics }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}
