import { ZodError } from "zod";

export function formatZodError(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}
