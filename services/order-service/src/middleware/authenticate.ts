import { FastifyRequest, FastifyReply } from "fastify";
import { verifyStaffAccessToken, verifyCustomerAccessToken, verifyKdsAccessToken } from "../lib/jwt";
import { StaffJwtPayload, CustomerJwtPayload, KdsJwtPayload } from "@ulcp/shared";

declare module "fastify" {
  interface FastifyRequest {
    staff?: StaffJwtPayload;
    customer?: CustomerJwtPayload;
    kdsDevice?: KdsJwtPayload;
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

/** Accepts either staff JWT or KDS device JWT — used on KOT routes */
export async function authenticateStaffOrKds(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ success: false, error: "Unauthorized" });
  }
  const token = auth.slice(7);
  // Try staff first
  try {
    req.staff = verifyStaffAccessToken(token);
    return;
  } catch { /* not a staff token */ }
  // Try KDS
  try {
    req.kdsDevice = verifyKdsAccessToken(token);
    return;
  } catch { /* not a KDS token */ }
  return reply.code(401).send({ success: false, error: "Invalid or expired token" });
}

/** KDS device auth — verifies KDS JWT (JWT_KDS_SECRET) */
export async function authenticateKds(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ success: false, error: "Unauthorized" });
  }
  try {
    req.kdsDevice = verifyKdsAccessToken(auth.slice(7));
  } catch {
    return reply.code(401).send({ success: false, error: "Invalid or expired token" });
  }
}

/** Customer auth — verifies customer JWT (JWT_CUSTOMER_SECRET) */
export async function authenticateCustomer(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ success: false, error: "Unauthorized" });
  }
  try {
    req.customer = verifyCustomerAccessToken(auth.slice(7));
  } catch {
    return reply.code(401).send({ success: false, error: "Invalid or expired token" });
  }
}
