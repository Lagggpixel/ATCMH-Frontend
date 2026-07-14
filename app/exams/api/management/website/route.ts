import { requireManagementCapability } from "@/src/lib/discord-auth";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";
import { assertManagementWritesEnabled, listWebsiteContent, saveWebsiteContent, type WebsiteContent, type WebsiteContentInput } from "@/src/lib/management-service";
import { managementAuthorizationError, managementError, ManagementValidationError, optionalString, parseManagementJson, requiredString } from "@/src/lib/management-route";

function canonicalNumericId(value: unknown, field: string): number {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new ManagementValidationError(`Invalid ${field}`, [{ path: field, message: "expected a canonical numeric string" }]);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ManagementValidationError(`Invalid ${field}`, [{ path: field, message: "must be a positive safe integer" }]);
  }
  return id;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ManagementValidationError(`Invalid ${path}`, [{ path, message: "expected an object" }]);
  }
  return value as Record<string, unknown>;
}

function websiteDto(content: WebsiteContent) {
  return {
    home: content.home ? { ...content.home, id: String(content.home.id) } : null,
    announcements: content.announcements.map((announcement) => ({ ...announcement, id: String(announcement.id) })),
    pages: content.pages,
  };
}

function parseWebsiteContent(body: Record<string, unknown>): WebsiteContentInput {
  const input: WebsiteContentInput = {};
  if (body.home !== undefined && body.home !== null) {
    const home = record(body.home, "home");
    input.home = {
      id: canonicalNumericId(home.id, "home.id"),
      title: requiredString(home, "title"),
      intro: requiredString(home, "intro"),
      headerTitle: requiredString(home, "headerTitle"),
      headerSubtitle: requiredString(home, "headerSubtitle"),
    };
  }
  if (body.announcements !== undefined) {
    if (!Array.isArray(body.announcements)) {
      throw new ManagementValidationError("Invalid announcements", [{ path: "announcements", message: "expected an array" }]);
    }
    input.announcements = body.announcements.map((candidate, index) => {
      const announcement = record(candidate, `announcements.${index}`);
      const id = announcement.id === undefined ? undefined : canonicalNumericId(announcement.id, `announcements.${index}.id`);
      const sortOrder = announcement.sortOrder;
      if (typeof sortOrder !== "number" || !Number.isSafeInteger(sortOrder)) {
        throw new ManagementValidationError("Invalid sortOrder", [{ path: `announcements.${index}.sortOrder`, message: "expected an integer" }]);
      }
      return { id, content: requiredString(announcement, "content"), sortOrder };
    });
  }
  if (body.pages !== undefined) {
    if (!Array.isArray(body.pages)) {
      throw new ManagementValidationError("Invalid pages", [{ path: "pages", message: "expected an array" }]);
    }
    input.pages = body.pages.map((candidate, index) => {
      const page = record(candidate, `pages.${index}`);
      return {
        id: optionalString(page, "id"),
        slug: requiredString(page, "slug"),
        title: requiredString(page, "title"),
        content: requiredString(page, "content"),
      };
    });
  }
  return input;
}

export async function GET(request: Request) {
  const actor = await requireManagementCapability(request, "manage-system");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    return withManagementCors(request, Response.json({ content: websiteDto(await listWebsiteContent()) }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export async function PUT(request: Request) {
  const actor = await requireManagementCapability(request, "manage-system");
  if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
  try {
    assertManagementWritesEnabled();
    const content = await saveWebsiteContent(parseWebsiteContent(await parseManagementJson(request)), actor);
    return withManagementCors(request, Response.json({ content: websiteDto(content) }));
  } catch (error) {
    return withManagementCors(request, managementError(error));
  }
}

export function OPTIONS(request: Request) { return corsPreflight(request); }
