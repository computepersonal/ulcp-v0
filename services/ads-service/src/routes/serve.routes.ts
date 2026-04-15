import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAdsForContext, recordImpression, recordClick, VALID_PLACEMENTS } from "../services/ad-engine.service";

const serveQuerySchema = z.object({
  placement: z.enum([...VALID_PLACEMENTS] as unknown as [string, ...string[]]),
  tenant_id: z.string().optional(),
  branch_id: z.string().optional(),
  customer_id: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  format: z.string().optional(),
  limit: z.coerce.number().min(1).max(10).default(2),
});

const clickBodySchema = z.object({
  campaign_id: z.string(),
  creative_id: z.string(),
  impression_id: z.string(),
  tenant_id: z.string().optional(),
  customer_id: z.string().optional(),
});

export default async function serveRoutes(app: FastifyInstance) {
  // GET /api/v1/ads/serve
  app.get(
    "/serve",
    {
      schema: {
        tags: ["Ad Delivery"],
        description: "Fetch ads for a given placement context",
        querystring: {
          type: "object",
          properties: {
            placement: { type: "string" },
            tenant_id: { type: "string" },
            branch_id: { type: "string" },
            customer_id: { type: "string" },
            lat: { type: "number" },
            lng: { type: "number" },
            format: { type: "string" },
            limit: { type: "number" },
          },
          required: ["placement"],
        },
      },
    },
    async (req, reply) => {
      const parsed = serveQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: parsed.error.errors[0]?.message });
      }
      const { placement, tenant_id, branch_id, customer_id, lat, lng, format, limit } = parsed.data;

      const ads = await getAdsForContext({
        placement,
        tenant_id,
        branch_id,
        customer_id,
        customer_lat: lat,
        customer_lng: lng,
        format,
        limit,
      });

      // Record impressions asynchronously — don't await
      for (const ad of ads) {
        void recordImpression(
          ad.campaign_id,
          ad.creative_id,
          placement,
          tenant_id,
          branch_id,
          customer_id
        );
      }

      return reply.send({ success: true, data: { ads, placement } });
    }
  );

  // POST /api/v1/ads/click
  app.post(
    "/click",
    {
      schema: {
        tags: ["Ad Delivery"],
        description: "Record an ad click and return redirect URL",
        body: {
          type: "object",
          required: ["campaign_id", "creative_id", "impression_id"],
          properties: {
            campaign_id: { type: "string" },
            creative_id: { type: "string" },
            impression_id: { type: "string" },
            tenant_id: { type: "string" },
            customer_id: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const parsed = clickBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: parsed.error.errors[0]?.message });
      }
      const { campaign_id, creative_id, impression_id, tenant_id, customer_id } = parsed.data;

      try {
        const redirect_url = await recordClick(campaign_id, creative_id, impression_id, tenant_id, customer_id);
        return reply.send({ success: true, data: { redirect_url } });
      } catch {
        return reply.code(404).send({ success: false, error: "Campaign not found" });
      }
    }
  );
}
