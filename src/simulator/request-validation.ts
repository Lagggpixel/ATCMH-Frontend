import type {ZodError} from "zod/v3";

/** Describe the failing fields without echoing submitted values. */
export function invalidRequestMessage(error: ZodError) {
  const details = error.issues.slice(0, 3).map(issue => {
    const field = issue.path.filter(part => !["action", "patch", "envelope"].includes(String(part))).join(".");
    const message = issue.code === "invalid_enum_value" || issue.code === "invalid_literal" ? "Choose a listed value."
      : issue.code === "unrecognized_keys" ? "Some fields are not supported." : issue.message;
    return `${field ? `${field}: ` : ""}${message}`;
  }).join("; ");
  return `Check the request fields: ${details}`;
}
