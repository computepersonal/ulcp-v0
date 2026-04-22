/**
 * Customer-facing profile endpoints — authenticated via customer JWT.
 * Exposed through Kong at /api/v1/auth/customer/*
 */
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError } from "@ulcp/shared";
import { prisma } from "../lib/prisma";
import { authenticateCustomer } from "../middleware/authenticate";

export async function customerProfileRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", authenticateCustomer);

  // GET /me — get own profile
  fastify.get("/me", async (req, reply) => {
    const customer = await prisma.platformCustomer.findUnique({
      where: { id: req.customer!.customer_id },
      select: {
        id: true,
        mobile: true,
        name: true,
        email: true,
        birthday: true,
        anniversary: true,
        preferences: true,
        is_active: true,
        created_at: true,
      },
    });
    if (!customer) return reply.code(404).send(apiError("Customer not found"));
    return reply.send(apiSuccess(customer));
  });

  // PATCH /me — update own profile (birthday, anniversary, preferences)
  fastify.patch("/me", async (req, reply) => {
    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      email: z.string().email().optional(),
      birthday: z.string().nullable().optional(),
      anniversary: z.string().nullable().optional(),
      preferences: z.record(z.unknown()).optional(),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.code(400).send(apiError(body.error.issues[0]?.message ?? "Validation error"));
    }

    const data: Record<string, unknown> = {};
    if (body.data.name !== undefined) data["name"] = body.data.name;
    if (body.data.email !== undefined) data["email"] = body.data.email;
    if (body.data.birthday !== undefined) {
      data["birthday"] = body.data.birthday ? new Date(body.data.birthday) : null;
    }
    if (body.data.anniversary !== undefined) {
      data["anniversary"] = body.data.anniversary ? new Date(body.data.anniversary) : null;
    }
    if (body.data.preferences !== undefined) data["preferences"] = body.data.preferences;

    const updated = await prisma.platformCustomer.update({
      where: { id: req.customer!.customer_id },
      data,
      select: {
        id: true,
        mobile: true,
        name: true,
        email: true,
        birthday: true,
        anniversary: true,
        preferences: true,
        is_active: true,
      },
    });

    return reply.send(apiSuccess(updated));
  });
}
