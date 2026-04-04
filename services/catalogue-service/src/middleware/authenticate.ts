import { FastifyRequest, FastifyReply } from "fastify";
import { verifyStaffAccessToken } from "../lib/jwt";
import { StaffJwtPayload } from "@ulcp/shared";

declare module "fastify" {
  interface FastifyRequest {
    staff?: StaffJwtPayload;
  }
}

/** Hard auth — 401 if no/invalid token */
export async function authenticateStaff(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ success: false, error: "Unauthorized" });
  }
  try {
    req.staff = verifyStaffAccessToken(auth.slice(7));
  } catch {
    return reply.code(401).send({ success: false, error: "Invalid or expired token" });
  }
}

/** Soft auth — silently sets req.staff if token present; public routes use this */
export async function tryAuthenticateStaff(
  req: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return;
  try {
    req.staff = verifyStaffAccessToken(auth.slice(7));
  } catch {
    // public routes — ignore invalid tokens
  }
}

/** Resolve catalogue context from request */
export function resolveContext(
  req: FastifyRequest
): "customer" | "staff_order" | "staff_edit" {
  if (!req.staff) return "customer";
  const perms = req.staff.permissions as string[];
  if (perms.includes("menu:edit")) return "staff_edit";
  return "staff_order";
}
