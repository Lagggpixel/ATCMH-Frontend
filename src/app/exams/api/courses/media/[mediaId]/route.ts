import { getVerifiedLearnerDiscordSubject } from "@/src/lib/learner-session";
import { getCourseMediaForLearner } from "@/src/lib/course-repository";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const discordId = await getVerifiedLearnerDiscordSubject();
  if (!discordId) return new Response("Unauthorized", { status: 401 });
  try {
    const media = await getCourseMediaForLearner((await params).mediaId, discordId);
    if (!media) return new Response("Media not found", { status: 404 });
    const filename = media.filename.replace(/[\"\r\n]/g, "_");
    return new Response(new Uint8Array(media.content), {
      headers: {
        "Content-Type": media.contentType,
        "Content-Length": String(media.sizeBytes),
        "Content-Disposition": `inline; filename="${filename}"`,
        "ETag": `"${media.sha256}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Media not found", { status: 404 });
  }
}
