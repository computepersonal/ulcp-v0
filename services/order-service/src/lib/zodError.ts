import { ZodError } from "zod";

export function formatZodError(err: ZodError): string {
  const first = err.errors[0];
  if (!first) return "Validation error";
  const path = first.path.length > 0 ? first.path.join(".") + ": " : "";
  return `${path}${first.message}`;
}
