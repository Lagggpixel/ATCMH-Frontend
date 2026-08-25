import { requireManagementCapability } from "@/src/lib/discord-auth";
import { getCourseMediaForManager } from "@/src/lib/course-repository";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { managementAuthorizationError, managementError } from "@/src/lib/management-route";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ courseId: string; mediaId: string }> }) {
  const actor = await requireManagementCapability(request, "manage-courses");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    const { courseId, mediaId } = await params;
    const media = await getCourseMediaForManager(courseId, mediaId);
    if (!media) return withManagementCors(request, Response.json({ error: "Media not found" }, { status: 404 }));
    const filename = media.filename.replace(/[\"\r\n]/g, "_");
    return withManagementCors(request, new Response(new Uint8Array(media.content), {
      headers: {
        "Content-Type": media.contentType,
        "Content-Length": String(media.sizeBytes),
        "Content-Disposition": `inline; filename="${filename}"`,
        "ETag": `"${media.sha256}"`,
        "Cache-Control": "private, no-store",
      },
    }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}
