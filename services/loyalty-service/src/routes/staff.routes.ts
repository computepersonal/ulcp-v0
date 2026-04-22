import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError } from "@ulcp/shared";
import { formatZodError } from "../lib/zodError";
import { authenticateStaff } from "../middleware/authenticate";
import * as loyaltyService from "../services/loyalty.service";
import * as loyaltyRepo from "../repositories/customerLoyalty.repository";
import * as offerRepo from "../repositories/customerOffer.repository";

type TenantCustomerParams = { tenant_id: string; customer_id: string };
type TenantParams = { tenant_id: string };

const grantOfferSchema = z.object({
  type: z.enum(["reward", "wallet_credit"]),
  name: z.string().min(1),
  description: z.string().optional(),
  value_type: z.enum(["percentage", "flat", "free_item"]),
  value: z.number().int().min(1),
  free_item_id: z.string().optional(),
  free_item_name: z.string().optional(),
  min_order_amount: z.number().int().min(0).optional(),
  expires_at: z.string().datetime().optional(),
});

const notesSchema = z.object({ notes: z.string() });

export async function staffRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /loyalty/:tenant_id/customer/:customer_id — full profile for staff POS
  fastify.get<{ Params: TenantCustomerParams }>(
    "/:tenant_id/customer/:customer_id",
    {
      schema: {
        summary: "Get customer loyalty profile (staff)",
        tags: ["Loyalty — Staff"],
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const profile = await loyaltyService.getFullProfile(
          req.params.tenant_id,
          req.params.customer_id,
          true // include staff_notes
        );
        return reply.send(apiSuccess(profile));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to load customer profile"));
      }
    }
  );

  // GET /loyalty/:tenant_id/customer/by-mobile/:mobile — lookup by phone
  fastify.get<{ Params: { tenant_id: string; mobile: string } }>(
    "/:tenant_id/customer/by-mobile/:mobile",
    {
      schema: {
        summary: "Lookup customer by mobile (staff)",
        tags: ["Loyalty — Staff"],
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const customer = await loyaltyService.findCustomerByMobile(req.params.mobile);
        if (!customer) {
          return reply.code(404).send(apiError("Customer not found"));
        }
        const profile = await loyaltyService.getFullProfile(
          req.params.tenant_id,
          customer.id,
          true
        );
        return reply.send(apiSuccess(profile));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to lookup customer"));
      }
    }
  );

  // POST /loyalty/:tenant_id/customer/:customer_id/notes — update staff notes
  fastify.post<{ Params: TenantCustomerParams }>(
    "/:tenant_id/customer/:customer_id/notes",
    {
      schema: {
        summary: "Update staff notes for customer",
        tags: ["Loyalty — Staff"],
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = notesSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        await loyaltyRepo.updateStaffNotes(
          req.params.tenant_id,
          req.params.customer_id,
          body.data.notes
        );
        return reply.send(apiSuccess({ message: "Notes updated" }));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to update notes"));
      }
    }
  );

  // GET /loyalty/:tenant_id/customer/:customer_id/offers — list offers
  fastify.get<{
    Params: TenantCustomerParams;
    Querystring: { status?: string };
  }>(
    "/:tenant_id/customer/:customer_id/offers",
    {
      schema: {
        summary: "List customer offers (staff)",
        tags: ["Loyalty — Staff"],
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const status = req.query.status as "active" | "used" | "expired" | undefined;
        const offers = await offerRepo.getOffersByStatus(
          req.params.tenant_id,
          req.params.customer_id,
          status
        );
        return reply.send(apiSuccess({ offers }));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to load offers"));
      }
    }
  );

  // POST /loyalty/:tenant_id/customer/:customer_id/offers/grant — grant offer manually
  fastify.post<{ Params: TenantCustomerParams }>(
    "/:tenant_id/customer/:customer_id/offers/grant",
    {
      schema: {
        summary: "Grant an offer to customer (staff)",
        tags: ["Loyalty — Staff"],
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = grantOfferSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const offer = await loyaltyService.grantOffer({
          tenant_id: req.params.tenant_id,
          customer_id: req.params.customer_id,
          ...body.data,
          granted_by: req.staff!.user_id,
        });
        return reply.code(201).send(apiSuccess({ offer }));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to grant offer"));
      }
    }
  );

  // POST /loyalty/:tenant_id/offers/:offer_id/apply — apply offer to order
  fastify.post<{ Params: { tenant_id: string; offer_id: string } }>(
    "/:tenant_id/offers/:offer_id/apply",
    {
      schema: {
        summary: "Apply offer to an order",
        tags: ["Loyalty — Staff"],
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = z.object({ order_id: z.string().min(1) }).safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const offer = await loyaltyService.applyOffer(
          req.params.tenant_id,
          req.params.offer_id,
          body.data.order_id
        );
        return reply.send(apiSuccess({ offer }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to apply offer";
        return reply.code(400).send(apiError(msg));
      }
    }
  );

  // POST /loyalty/:tenant_id/offers/:offer_id/revoke — revoke offer from order
  fastify.post<{ Params: { tenant_id: string; offer_id: string } }>(
    "/:tenant_id/offers/:offer_id/revoke",
    {
      schema: {
        summary: "Revoke offer from order",
        tags: ["Loyalty — Staff"],
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const offer = await loyaltyService.revokeOffer(req.params.tenant_id, req.params.offer_id);
        return reply.send(apiSuccess({ offer }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to revoke offer";
        return reply.code(400).send(apiError(msg));
      }
    }
  );

  // GET /loyalty/:tenant_id/customers — list all customers for tenant (POS customer page)
  fastify.get<{
    Params: TenantParams;
    Querystring: { search?: string; tier?: string; page?: string; limit?: string };
  }>(
    "/:tenant_id/customers",
    {
      schema: {
        summary: "List all loyalty customers for tenant",
        tags: ["Loyalty — Staff"],
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const { search, tier, page, limit } = req.query;
        const result = await loyaltyRepo.listCustomersForTenant(req.params.tenant_id, {
          search,
          tier: tier as "silver" | "gold" | "platinum" | undefined,
          page: page ? parseInt(page, 10) : undefined,
          limit: limit ? parseInt(limit, 10) : undefined,
        });

        // Enrich with customer names from identity-service
        const enriched = await Promise.all(
          result.rows.map(async (row) => {
            const profile = await loyaltyService.fetchCustomerProfile(row.customer_id);
            return {
              ...row,
              customer_name: profile?.name ?? null,
              customer_mobile: profile?.mobile ?? null,
              customer_email: profile?.email ?? null,
            };
          })
        );

        return reply.send(apiSuccess({
          customers: enriched,
          total: result.total,
          page: result.page,
          limit: result.limit,
        }));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to list customers"));
      }
    }
  );
}
