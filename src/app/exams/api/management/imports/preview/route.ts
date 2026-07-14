import { requireManagementCapability } from "@/src/lib/discord-auth";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { previewImport, previewUploadedImport } from "@/src/lib/management-imports";

export async function POST(request: Request) {
  const actor = await requireManagementCapability(request, "import-exams");
  if (actor instanceof Response) return withManagementCors(request, actor);
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data") && !contentType.startsWith("application/json")) {
      return withManagementCors(request, new Response("Unsupported MIME type", { status: 415 }));
    }
    const preview = contentType.startsWith("multipart/form-data")
      ? await (async () => { const file = (await request.formData()).get("file"); return file instanceof File ? previewUploadedImport(file, actor.discordId) : { valid: false, errors: [{ path: "file", message: "a file is required" }] }; })()
      : await previewImport(await request.json(), actor.discordId);
    return withManagementCors(request, Response.json(preview, { status: preview.valid ? 200 : 422 }));
  } catch { return withManagementCors(request, new Response("Invalid import request", { status: 400 })); }
}
export function OPTIONS(request: Request) { return corsPreflight(request); }
