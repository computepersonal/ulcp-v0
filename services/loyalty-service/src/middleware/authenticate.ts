import { FastifyRequest, FastifyReply } from "fastify";
import { verifyStaffAccessToken, verifyCustomerToken } from "../lib/jwt";
import { StaffJwtPayload, CustomerJwtPayload } from "@ulcp/shared";

declare module "fastify" {
  interface FastifyRequest {
    staff?: StaffJwtPayload;
    customer?: CustomerJwtPayload;
  }
}

/** Hard staff auth — 401 if no/invalid token */
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

/** Hard customer auth — 401 if no/invalid token */
export async function authenticateCustomer(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ success: false, error: "Unauthorized" });
  }
  try {
    req.customer = verifyCustomerToken(auth.slice(7));
  } catch {
    return reply.code(401).send({ success: false, error: "Invalid or expired token" });
  }
}
