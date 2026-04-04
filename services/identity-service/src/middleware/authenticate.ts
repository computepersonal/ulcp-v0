import { FastifyRequest, FastifyReply } from "fastify";
import { verifyStaffAccessToken, verifyCustomerToken } from "../lib/jwt";
import { StaffJwtPayload, CustomerJwtPayload, Permission } from "@ulcp/shared";

declare module "fastify" {
  interface FastifyRequest {
    staff?: StaffJwtPayload;
    customer?: CustomerJwtPayload;
  }
}

export async function authenticateStaff(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ success: false, error: "Unauthorized" });
  }
  const token = auth.slice(7);
  try {
    req.staff = verifyStaffAccessToken(token);
  } catch {
    return reply.code(401).send({ success: false, error: "Invalid or expired token" });
  }
}

export async function authenticateCustomer(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ success: false, error: "Unauthorized" });
  }
  const token = auth.slice(7);
  try {
    req.customer = verifyCustomerToken(token);
  } catch {
    return reply.code(401).send({ success: false, error: "Invalid or expired token" });
  }
}

export function requirePermission(permission: Permission) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.staff) {
      return reply.code(401).send({ success: false, error: "Unauthorized" });
    }
    if (!req.staff.permissions.includes(permission)) {
      return reply.code(403).send({ success: false, error: "Forbidden" });
    }
  };
}
