import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { formatZodError } from "../lib/zodError";
import {
  createBidRequest,
  findBidRequests,
  findBidRequestById,
  updateBidRequest,
  deleteBidRequest,
  addVendorsToBidRequest,
  findVendorToken,
  markTokenUsed,
  createBid,
  findBidById,
  updateBidStatus,
} from "../repositories/bid.repository";
import {
  openBidRequest,
  closeBidRequest,
  getRankedBids,
  awardBid,
} from "../services/bid.service";
import {
  createBidRequestForIngredient,
  fetchIngredient,
} from "../services/autoReorder.service";

const ok = { type: "object" as const, properties: { success: { type: "boolean" as const }, data: { type: "object" as const, additionalProperties: true } } };
const err = { type: "object" as const, properties: { success: { type: "boolean" as const }, error: { type: "string" as const } } };
const errR = { 400: err, 401: err, 403: err, 404: err };

const bidRequestSchema = z.object({
  branch_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  items: z.array(z.object({
    ingredient_id: z.string(),
    ingredient_name: z.string(),
    quantity: z.number().positive(),
    unit: z.string(),
    notes: z.string().optional(),
  })).min(1),
  recurrence: z.enum(["one_time","daily","weekly","fortnightly","monthly","on_demand"]).default("one_time"),
  recurrence_day: z.string().optional(),
  delivery_location: z.string().optional(),
  delivery_notes: z.string().optional(),
  bid_close_at: z.string().datetime().optional(),
  ranking_weights: z.object({
    price: z.number().min(0).max(100),
    lead_time: z.number().min(0).max(100),
    rating: z.number().min(0).max(100),
    payment: z.number().min(0).max(100),
  }).optional(),
});

const bidSubmitSchema = z.object({
  items: z.array(z.object({
    ingredient_id: z.string(),
    unit_price: z.number().int().min(1),
    quantity_available: z.number().positive(),
    notes: z.string().optional(),
  })).min(1),
  total_amount: z.number().int().min(1),
  lead_time_days: z.number().int().min(1),
  valid_until: z.string().datetime(),
  payment_terms: z.enum(["advance","on_delivery","net_7","net_15","net_30"]),
  delivery_included: z.boolean().default(false),
  delivery_charge: z.number().int().min(0).default(0),
  notes: z.string().optional(),
});

interface TenantParams { tenant_id: string }
interface BidReqParams { tenant_id: string; id: string }
interface AwardParams { tenant_id: string; id: string; bid_id: string }
interface TokenParams { token: string }
interface BidWithdrawParams { bid_id: string }

export async function bidRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Bid Requests (staff) ───────────────────────────────────────────────────

  fastify.post<{ Params: TenantParams; Body: unknown }>(
    "/:tenant_id/bid-requests",
    { schema: { summary: "Create bid request", tags: ["Bid Requests"], response:{201:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const parsed = bidRequestSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id } = req.params;
      const { ranking_weights, bid_close_at, items, ...rest } = parsed.data;
      const bidReq = await createBidRequest({
        tenant_id,
        ...rest,
        items: items as unknown as never[],
        ...(bid_close_at ? { bid_close_at: new Date(bid_close_at) } : {}),
        ...(ranking_weights ? { ranking_weights } : {}),
        created_by: req.staff!.user_id,
      });
      return reply.code(201).send(apiSuccess({ bid_request: bidReq }));
    }
  );

  fastify.get<{ Params: TenantParams; Querystring: { status?: string } }>(
    "/:tenant_id/bid-requests",
    { schema: { summary: "List bid requests", tags: ["Bid Requests"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const reqs = await findBidRequests(req.params.tenant_id, req.query.status);
      return reply.send(apiSuccess({ bid_requests: reqs }));
    }
  );

  // POST /:tenant_id/bid-requests/for-ingredient — one-click "get quotes" for a single
  // inventory item: creates an open bid request and invites every vendor whose catalog
  // includes this ingredient. WhatsApps each vendor's contact_whatsapp.
  const forIngredientSchema = z.object({
    branch_id: z.string().min(1),
    ingredient_id: z.string().min(1),
    quantity: z.number().positive(),
    close_in_hours: z.number().int().min(1).max(168).default(4),
    notes: z.string().max(500).optional(),
  });

  fastify.post<{ Params: TenantParams; Body: unknown }>(
    "/:tenant_id/bid-requests/for-ingredient",
    {
      schema: {
        summary: "Get quotes for a single ingredient — invite all vendors that supply it",
        tags: ["Bid Requests"],
        response: { 200: ok, ...errR },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const parsed = forIngredientSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id } = req.params;
      const { branch_id, ingredient_id, quantity, close_in_hours, notes } = parsed.data;

      const ingredient = await fetchIngredient(tenant_id, branch_id, ingredient_id);
      if (!ingredient) return reply.code(404).send(apiError("Ingredient not found in inventory"));

      const result = await createBidRequestForIngredient({
        tenant_id,
        branch_id,
        ingredient_id,
        ingredient_name: ingredient.name,
        ingredient_unit: ingredient.unit,
        quantity,
        close_in_hours,
        description: notes,
        created_by: req.staff!.user_id,
      });

      return reply.send(apiSuccess(result));
    },
  );

  fastify.get<{ Params: BidReqParams }>(
    "/:tenant_id/bid-requests/:id",
    { schema: { summary: "Get bid request", tags: ["Bid Requests"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, id } = req.params;
      const bidReq = await findBidRequestById(id, tenant_id);
      if (!bidReq) return reply.code(404).send(apiError("Bid request not found"));
      return reply.send(apiSuccess({ bid_request: bidReq }));
    }
  );

  fastify.patch<{ Params: BidReqParams; Body: unknown }>(
    "/:tenant_id/bid-requests/:id",
    { schema: { summary: "Update bid request (draft only)", tags: ["Bid Requests"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const parsed = bidRequestSchema.partial().safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id, id } = req.params;
      const bidReq = await findBidRequestById(id, tenant_id);
      if (!bidReq) return reply.code(404).send(apiError("Bid request not found"));
      if (bidReq.status !== "draft") return reply.code(400).send(apiError("Can only edit draft bid requests"));
      const { bid_close_at, items, ranking_weights, ...rest } = parsed.data;
      await updateBidRequest(id, tenant_id, {
        ...rest,
        ...(items ? { items: items as unknown as never[] } : {}),
        ...(bid_close_at ? { bid_close_at: new Date(bid_close_at) } : {}),
        ...(ranking_weights ? { ranking_weights } : {}),
      });
      const updated = await findBidRequestById(id, tenant_id);
      return reply.send(apiSuccess({ bid_request: updated }));
    }
  );

  fastify.delete<{ Params: BidReqParams }>(
    "/:tenant_id/bid-requests/:id",
    { schema: { summary: "Delete bid request", tags: ["Bid Requests"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, id } = req.params;
      await deleteBidRequest(id, tenant_id);
      return reply.send(apiSuccess({ deleted: true }));
    }
  );

  // ── Bid Request Actions ────────────────────────────────────────────────────

  fastify.post<{ Params: BidReqParams }>(
    "/:tenant_id/bid-requests/:id/open",
    { schema: { summary: "Open bid request — generate tokens, notify vendors", tags: ["Bid Requests"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      try {
        const result = await openBidRequest(req.params.id, req.params.tenant_id);
        return reply.send(apiSuccess(result));
      } catch (e) {
        if (e instanceof AppError) return reply.code(e.statusCode).send(apiError(e.message));
        throw e;
      }
    }
  );

  fastify.post<{ Params: BidReqParams }>(
    "/:tenant_id/bid-requests/:id/close",
    { schema: { summary: "Close bid request — no more bids accepted", tags: ["Bid Requests"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      try {
        await closeBidRequest(req.params.id, req.params.tenant_id);
        return reply.send(apiSuccess({ closed: true }));
      } catch (e) {
        if (e instanceof AppError) return reply.code(e.statusCode).send(apiError(e.message));
        throw e;
      }
    }
  );

  fastify.get<{ Params: BidReqParams }>(
    "/:tenant_id/bid-requests/:id/bids/ranked",
    { schema: { summary: "Get ranked bids for a bid request", tags: ["Bid Requests"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      try {
        const ranked = await getRankedBids(req.params.id, req.params.tenant_id);
        return reply.send(apiSuccess({ bids: ranked }));
      } catch (e) {
        if (e instanceof AppError) return reply.code(e.statusCode).send(apiError(e.message));
        throw e;
      }
    }
  );

  fastify.post<{ Params: AwardParams }>(
    "/:tenant_id/bid-requests/:id/award/:bid_id",
    { schema: { summary: "Award bid — creates PO in inventory-service", tags: ["Bid Requests"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      try {
        const result = await awardBid(req.params.id, req.params.bid_id, req.params.tenant_id);
        return reply.send(apiSuccess(result));
      } catch (e) {
        if (e instanceof AppError) return reply.code(e.statusCode).send(apiError(e.message));
        throw e;
      }
    }
  );

  fastify.post<{ Params: BidReqParams; Body: unknown }>(
    "/:tenant_id/bid-requests/:id/vendors",
    { schema: { summary: "Add vendors to bid request invite list", tags: ["Bid Requests"], body:{type:"object"as const,required:["vendor_ids"],properties:{vendor_ids:{type:"array"as const,items:{type:"string"as const}}}}, response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const parsed = z.object({ vendor_ids: z.array(z.string()).min(1) }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      await addVendorsToBidRequest(req.params.id, parsed.data.vendor_ids);
      return reply.send(apiSuccess({ added: parsed.data.vendor_ids.length }));
    }
  );

  // ── Vendor-facing routes (magic link token, NO JWT) ───────────────────────

  fastify.get<{ Params: TokenParams }>(
    "/vendor/bid-request/:token",
    { schema: { summary: "Vendor: view bid request via magic link", tags: ["Vendor Portal"] } },
    async (req, reply) => {
      const vt = await findVendorToken(req.params.token);
      if (!vt || vt.token_type !== "bid") return reply.code(404).send(apiError("Invalid token"));
      if (vt.expires_at < new Date()) return reply.code(410).send(apiError("This bid request has expired"));
      if (vt.used_at) return reply.code(409).send(apiError("You have already submitted a bid"));
      if (!vt.bid_request_id) return reply.code(404).send(apiError("Invalid token"));

      const bidReq = await findBidRequestById(vt.bid_request_id, "");  // no tenant check — vendor uses token
      if (!bidReq) return reply.code(404).send(apiError("Bid request not found"));

      return reply.send(apiSuccess({
        bid_request: {
          id: bidReq.id,
          title: bidReq.title,
          description: bidReq.description,
          items: bidReq.items,
          recurrence: bidReq.recurrence,
          recurrence_day: bidReq.recurrence_day,
          delivery_location: bidReq.delivery_location,
          delivery_notes: bidReq.delivery_notes,
          bid_close_at: bidReq.bid_close_at,
          status: bidReq.status,
        },
        vendor_id: vt.vendor_id,
      }));
    }
  );

  const bidSubmitBody = {
    type: "object" as const,
    required: ["items","total_amount","lead_time_days","valid_until","payment_terms"],
    properties: {
      items: { type: "array" as const, items: { type: "object" as const } },
      total_amount: { type: "integer" as const, description: "Total in paise" },
      lead_time_days: { type: "integer" as const },
      valid_until: { type: "string" as const, format: "date-time" },
      payment_terms: { type: "string" as const, enum: ["advance","on_delivery","net_7","net_15","net_30"] },
      delivery_included: { type: "boolean" as const },
      delivery_charge: { type: "integer" as const },
      notes: { type: "string" as const },
    },
  };

  fastify.post<{ Params: TokenParams; Body: unknown }>(
    "/vendor/bid-request/:token/bid",
    { schema: { summary: "Vendor: submit bid via magic link", tags: ["Vendor Portal"], body: bidSubmitBody } },
    async (req, reply) => {
      const parsed = bidSubmitSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));

      const vt = await findVendorToken(req.params.token);
      if (!vt || vt.token_type !== "bid") return reply.code(404).send(apiError("Invalid token"));
      if (vt.expires_at < new Date()) return reply.code(410).send(apiError("Bid request has expired"));
      if (vt.used_at) return reply.code(409).send(apiError("You have already submitted a bid"));
      if (!vt.bid_request_id) return reply.code(404).send(apiError("Invalid token"));

      const bidReq = await findBidRequestById(vt.bid_request_id, "");
      if (!bidReq) return reply.code(404).send(apiError("Bid request not found"));
      if (bidReq.status !== "open") return reply.code(400).send(apiError("Bid request is no longer accepting bids"));

      const { valid_until, items, ...rest } = parsed.data;
      const bid = await createBid({
        bid_request: { connect: { id: vt.bid_request_id } },
        vendor: { connect: { id: vt.vendor_id } },
        tenant_id: bidReq.tenant_id,
        items: items as unknown as never[],
        valid_until: new Date(valid_until),
        ...rest,
      });

      await markTokenUsed(vt.id);
      return reply.code(201).send(apiSuccess({ bid: { id: bid.id, status: bid.status, submitted_at: bid.submitted_at } }));
    }
  );

  fastify.patch<{ Params: BidWithdrawParams; Body: unknown }>(
    "/vendor/bid/:bid_id/withdraw",
    { schema: { summary: "Vendor: withdraw submitted bid", tags: ["Vendor Portal"] } },
    async (req, reply) => {
      const bid = await findBidById(req.params.bid_id);
      if (!bid) return reply.code(404).send(apiError("Bid not found"));
      if (bid.status !== "submitted") return reply.code(400).send(apiError("Can only withdraw a submitted bid"));
      await updateBidStatus(req.params.bid_id, "withdrawn" as never);
      return reply.send(apiSuccess({ withdrawn: true }));
    }
  );
}
