import { ZodError } from "zod";

/**
 * Returns a human-readable error string like "website: Invalid url"
 * instead of just "Invalid url".
 */
export function formatZodError(err: ZodError): string {
  const first = err.errors[0];
  if (!first) return "Validation error";
  const path = first.path.length > 0 ? first.path.join(".") + ": " : "";
  return `${path}${first.message}`;
}
