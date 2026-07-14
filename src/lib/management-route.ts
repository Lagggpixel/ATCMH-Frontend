import { ZodError } from "zod";

export interface ManagementIssue {
  path: string;
  message: string;
}

export class ManagementValidationError extends Error {
  constructor(message: string, readonly issues: ManagementIssue[] = []) {
    super(message);
  }
}

export function managementError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "The management request could not be completed";
  if (error instanceof ZodError) {
    return Response.json({
      error: "The request did not match the required schema",
      issues: error.issues.map((issue) => ({ path: issue.path.join(".") || "request", message: issue.message })),
    }, { status: 422 });
  }
  if (error instanceof ManagementValidationError) {
    return Response.json({ error: message, issues: error.issues }, { status: 422 });
  }
  if (/writes are disabled|temporarily unavailable/i.test(message)) {
    return Response.json({ error: message }, { status: 503 });
  }
  if (/not found/i.test(message)) return Response.json({ error: message }, { status: 404 });
  if (/not permitted|administrator access/i.test(message)) return Response.json({ error: message }, { status: 403 });
  return Response.json({ error: message }, { status: 422 });
}

export async function managementAuthorizationError(response: Response): Promise<Response> {
  return Response.json({ error: await response.text() || "Unauthorized" }, { status: response.status });
}

export async function parseManagementJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ManagementValidationError("The request body must be an object", [{ path: "request", message: "expected an object" }]);
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ManagementValidationError) throw error;
    throw new ManagementValidationError("The request body must be valid JSON", [{ path: "request", message: "invalid JSON" }]);
  }
}

export function requiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string") throw new ManagementValidationError(`Invalid ${field}`, [{ path: field, message: "expected a string" }]);
  return value;
}

export function optionalString(input: Record<string, unknown>, field: string): string | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ManagementValidationError(`Invalid ${field}`, [{ path: field, message: "expected a string" }]);
  return value;
}
