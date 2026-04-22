import { FastifyInstance } from "fastify";
import { apiSuccess, apiError } from "@ulcp/shared";
import { authenticateCustomer } from "../middleware/authenticate";
import * as loyaltyService from "../services/loyalty.service";
import * as loyaltyRepo from "../repositories/customerLoyalty.repository";
import * as offerRepo from "../repositories/customerOffer.repository";
import * as visitRepo from "../repositories/customerVisit.repository";

type TenantParams = { tenant_id: string };

export async function customerRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /loyalty/:tenant_id/me — customer views their loyalty at this place
  fastify.get<{ Params: TenantParams }>(
    "/:tenant_id/me",
    {
      schema: {
        summary: "Get my loyalty profile at this place (customer)",
        tags: ["Loyalty — Customer"],
      },
      preHandler: [authenticateCustomer],
    },
    async (req, reply) => {
      try {
        const profile = await loyaltyService.getFullProfile(
          req.params.tenant_id,
          req.customer!.customer_id,
          false // no staff_notes
        );
        return reply.send(apiSuccess(profile));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to load loyalty profile"));
      }
    }
  );

  // GET /loyalty/me/all — cross-business loyalty overview (platform home)
  fastify.get(
    "/me/all",
    {
      schema: {
        summary: "Get loyalty across all places (customer)",
        tags: ["Loyalty — Customer"],
      },
      preHandler: [authenticateCustomer],
    },
    async (req, reply) => {
      try {
        const customerId = req.customer!.customer_id;
        const allLoyalty = await loyaltyRepo.getAllLoyaltyForCustomer(customerId);

        // Enrich with tenant info (name, logo) — use tenant-service
        const TENANT_URL = process.env["TENANT_SERVICE_URL"] ?? "http://localhost:3002";
        const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

        const enriched = await Promise.all(
          allLoyalty.map(async (l) => {
            let tenantName: string | null = null;
            let tenantLogo: string | null = null;
            try {
              const res = await fetch(`${TENANT_URL}/api/v1/tenants/${l.tenant_id}`, {
                headers: { "x-internal-secret": INTERNAL_SECRET },
              });
              if (res.ok) {
                const data = (await res.json()) as { data?: { tenant?: { name?: string; logo?: string } } };
                tenantName = data.data?.tenant?.name ?? null;
                tenantLogo = data.data?.tenant?.logo ?? null;
              }
            } catch { /* non-critical */ }

            const activeCount = await offerRepo.countActiveOffers(l.tenant_id, customerId);

            return {
              tenant_id: l.tenant_id,
              tenant_name: tenantName,
              tenant_logo: tenantLogo,
              points_balance: l.points_balance,
              wallet_balance: l.wallet_balance,
              tier: l.tier,
              active_offers_count: activeCount,
              last_visit_at: l.last_visit_at,
            };
          })
        );

        return reply.send(apiSuccess({ places: enriched }));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to load loyalty overview"));
      }
    }
  );

  // GET /loyalty/:tenant_id/me/history — customer order history at this place
  fastify.get<{
    Params: TenantParams;
    Querystring: { page?: string; limit?: string };
  }>(
    "/:tenant_id/me/history",
    {
      schema: {
        summary: "Get my order history at this place (customer)",
        tags: ["Loyalty — Customer"],
      },
      preHandler: [authenticateCustomer],
    },
    async (req, reply) => {
      try {
        const result = await visitRepo.getVisitsForCustomer(
          req.params.tenant_id,
          req.customer!.customer_id,
          {
            page: req.query.page ? parseInt(req.query.page, 10) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
          }
        );
        return reply.send(apiSuccess(result));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to load history"));
      }
    }
  );

  // GET /loyalty/:tenant_id/me/offers — customer views their offers
  fastify.get<{ Params: TenantParams }>(
    "/:tenant_id/me/offers",
    {
      schema: {
        summary: "Get my active offers at this place (customer)",
        tags: ["Loyalty — Customer"],
      },
      preHandler: [authenticateCustomer],
    },
    async (req, reply) => {
      try {
        const offers = await offerRepo.getActiveOffers(
          req.params.tenant_id,
          req.customer!.customer_id
        );
        return reply.send(apiSuccess({ offers }));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to load offers"));
      }
    }
  );
}
