/**
 * Internal customer endpoints — called by loyalty-service and other services
 * via X-Internal-Secret header. Not exposed through Kong.
 */
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError } from "@ulcp/shared";
import { prisma } from "../lib/prisma";

const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

export async function customerInternalRoutes(fastify: FastifyInstance): Promise<void> {
  // Verify internal secret for all routes
  fastify.addHook("preHandler", async (req, reply) => {
    const secret = req.headers["x-internal-secret"];
    if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
      return reply.code(401).send(apiError("Unauthorized"));
    }
  });

  // GET /customers/:id — lookup customer by ID
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    { schema: { hide: true } },
    async (req, reply) => {
      const customer = await prisma.platformCustomer.findUnique({
        where: { id: req.params.id },
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
      return reply.send(apiSuccess({ customer }));
    }
  );

  // GET /customers/by-mobile/:mobile — lookup customer by mobile
  fastify.get<{ Params: { mobile: string } }>(
    "/by-mobile/:mobile",
    { schema: { hide: true } },
    async (req, reply) => {
      const customer = await prisma.platformCustomer.findUnique({
        where: { mobile: req.params.mobile },
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
      return reply.send(apiSuccess({ customer }));
    }
  );

  // PATCH /customers/:id/profile — update customer preferences (called by loyalty-service)
  fastify.patch<{ Params: { id: string } }>(
    "/:id/profile",
    { schema: { hide: true } },
    async (req, reply) => {
      const body = z.object({
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        birthday: z.string().datetime().optional(),
        anniversary: z.string().datetime().optional(),
        preferences: z.record(z.unknown()).optional(),
      }).safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(body.error.issues[0]?.message ?? "Validation error"));
      }
      const customer = await prisma.platformCustomer.findUnique({ where: { id: req.params.id } });
      if (!customer) return reply.code(404).send(apiError("Customer not found"));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = {};
      if (body.data.name) data["name"] = body.data.name;
      if (body.data.email) data["email"] = body.data.email;
      if (body.data.birthday) data["birthday"] = new Date(body.data.birthday);
      if (body.data.anniversary) data["anniversary"] = new Date(body.data.anniversary);
      if (body.data.preferences) data["preferences"] = body.data.preferences;

      const updated = await prisma.platformCustomer.update({
        where: { id: req.params.id },
        data,
      });
      return reply.send(apiSuccess({ customer: updated }));
    }
  );
}
