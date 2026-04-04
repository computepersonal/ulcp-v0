import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { listSessionsByBranch } from "../repositories/session.repository";
import {
  openTableSession,
  confirmTableSession,
  closeTableSession,
  billTableSession,
} from "../services/session.service";

const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

const genericOk = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
  },
} as const;

const openSessionSchema = z.object({
  table_id: z.string().min(1),
  customer_id: z.string().optional(),
  customer_phone: z.string().optional(),
  customer_name: z.string().optional(),
  pax: z.number().int().min(1).optional(),
});

type BranchParams = { tenant_id: string; branch_id: string };
type SessionParams = { tenant_id: string; branch_id: string; session_id: string };

export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /sessions — customer or internal call to open a session when they scan QR
  // Accepts either: staff JWT, customer token, or internal secret
  fastify.post<{ Params: BranchParams }>(
    "/",
    {
      schema: {
        summary: "Open a table session (customer scans QR)",
        tags: ["Sessions"],
        security: [],
        params: { type: "object", properties: { tenant_id: { type: "string" }, branch_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["table_id"],
          properties: {
            table_id:       { type: "string" },
            customer_id:    { type: "string" },
            customer_phone: { type: "string" },
            customer_name:  { type: "string" },
            pax:            { type: "number" },
          },
        },
        response: { 200: genericOk },
      },
    },
    async (req, reply) => {
      const body = openSessionSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(body.error.errors[0]?.message ?? "Validation error"));

      const { tenant_id, branch_id } = req.params;
      try {
        const result = await openTableSession({ tenant_id, branch_id, ...body.data });
        return reply.send(apiSuccess({
          session: result.session,
          table: { id: result.table.id, name: result.table.name, status: result.table.status },
          is_new: result.isNew,
          needs_confirmation: result.session.status === "pending_confirmation",
        }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // GET /sessions — staff: list all active sessions for a branch
  fastify.get<{ Params: BranchParams; Querystring: { status?: string } }>(
    "/",
    {
      schema: {
        summary: "List table sessions for branch",
        tags: ["Sessions"],
        params: { type: "object", properties: { tenant_id: { type: "string" }, branch_id: { type: "string" } } },
        response: { 200: genericOk },
      },
      preHandler: [async (req, reply) => {
        const secret = req.headers["x-internal-secret"];
        if (INTERNAL_SECRET && secret === INTERNAL_SECRET) return;
        return authenticateStaff(req, reply);
      }],
    },
    async (req, reply) => {
      const { tenant_id, branch_id } = req.params;
      const { status } = req.query as { status?: string };
      const sessions = await listSessionsByBranch(tenant_id, branch_id, status);
      return reply.send(apiSuccess({ sessions }));
    }
  );

  // PATCH /sessions/:session_id/confirm — staff confirms table (pending_confirmation → open)
  fastify.patch<{ Params: SessionParams }>(
    "/:session_id/confirm",
    {
      schema: {
        summary: "Staff confirms table — opens session",
        tags: ["Sessions"],
        params: {
          type: "object",
          properties: {
            tenant_id: { type: "string" },
            branch_id: { type: "string" },
            session_id: { type: "string" },
          },
        },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const session = await confirmTableSession(
          req.params.session_id,
          req.params.tenant_id,
          req.staff!.user_id
        );
        return reply.send(apiSuccess({ session }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /sessions/:session_id/bill — mark session as billed
  fastify.patch<{ Params: SessionParams }>(
    "/:session_id/bill",
    {
      schema: {
        summary: "Mark session as billed",
        tags: ["Sessions"],
        params: { type: "object", properties: { tenant_id: { type: "string" }, branch_id: { type: "string" }, session_id: { type: "string" } } },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const session = await billTableSession(req.params.session_id, req.params.tenant_id);
        return reply.send(apiSuccess({ session }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /sessions/:session_id/close — staff closes table (after payment)
  fastify.patch<{ Params: SessionParams }>(
    "/:session_id/close",
    {
      schema: {
        summary: "Close table session (table back to available)",
        tags: ["Sessions"],
        params: { type: "object", properties: { tenant_id: { type: "string" }, branch_id: { type: "string" }, session_id: { type: "string" } } },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const session = await closeTableSession(
          req.params.session_id,
          req.params.tenant_id,
          req.staff!.user_id
        );
        return reply.send(apiSuccess({ session }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );
}
