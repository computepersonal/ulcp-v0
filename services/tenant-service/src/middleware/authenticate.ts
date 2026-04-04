import { FastifyRequest, FastifyReply } from "fastify";
import { verifyStaffAccessToken } from "../lib/jwt";
import { StaffJwtPayload } from "@ulcp/shared";

declare module "fastify" {
  interface FastifyRequest {
    staff?: StaffJwtPayload;
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
    return reply
      .code(401)
      .send({ success: false, error: "Invalid or expired token" });
  }
}
