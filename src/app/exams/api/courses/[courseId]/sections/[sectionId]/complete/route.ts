import { completeCourseSection, CourseProgressError } from "@/src/lib/course-repository";
import { authorizeLearnerMutation } from "@/src/lib/browser-session";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string; sectionId: string }> }) {
  const authorized = await authorizeLearnerMutation(
    request.headers.get("origin"),
    request.headers.get("cookie"),
    request.headers.get("X-CSRF-Token"),
  );
  if (!authorized) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { courseId, sectionId } = await params;
    return Response.json(await completeCourseSection(courseId, sectionId, authorized.session.discordId));
  } catch (error) {
    if (error instanceof CourseProgressError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && /not found|IDs must be/.test(error.message)) return Response.json({ error: error.message }, { status: 404 });
    return Response.json({ error: "Unable to save course progress" }, { status: 503 });
  }
}
