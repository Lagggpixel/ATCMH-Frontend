import { requireManagementCapability } from "@/src/lib/discord-auth";
import { uploadCourseMedia } from "@/src/lib/course-management-service";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { managementAuthorizationError, managementError } from "@/src/lib/management-route";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const actor = await requireManagementCapability(request, "manage-courses");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return withManagementCors(request, Response.json({ error: "A media file is required" }, { status: 422 }));
    const media = await uploadCourseMedia((await params).courseId, file, actor);
    return withManagementCors(request, Response.json({ media }, { status: 201 }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}
