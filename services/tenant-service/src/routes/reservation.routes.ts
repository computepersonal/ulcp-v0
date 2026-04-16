import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import {
  createReservation,
  listReservations,
  findReservationById,
  updateReservation,
  deleteReservation,
} from "../repositories/reservation.repository";

const genericOk = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
  },
} as const;

const errResponses = {
  400: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  401: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  403: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
} as const;

const createSchema = z.object({
  table_id:       z.string().optional(),
  customer_name:  z.string().min(1),
  customer_phone: z.string().min(1),
  customer_email: z.string().email().optional(),
  pax:            z.number().int().min(1).default(2),
  date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  time_slot:      z.string().regex(/^\d{2}:\d{2}$/, "time_slot must be HH:MM"),
  notes:          z.string().optional(),
});

const updateSchema = z.object({
  status:    z.enum(["pending", "confirmed", "seated", "cancelled", "no_show"]).optional(),
  table_id:  z.string().nullable().optional(),
  notes:     z.string().optional(),
  pax:       z.number().int().min(1).optional(),
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time_slot: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

type BranchParams = { tenant_id: string; branch_id: string };
type ReservationParams = { tenant_id: string; branch_id: string; id: string };

export async function reservationRoutes(fastify: FastifyInstance): Promise<void> {

  // POST — create a reservation
  fastify.post<{ Params: BranchParams }>(
    "/",
    {
      schema: {
        summary: "Create a reservation",
        tags: ["Reservations"],
        params: { type: "object", properties: { tenant_id: { type: "string" }, branch_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["customer_name", "customer_phone", "date", "time_slot"],
          properties: {
            table_id:       { type: "string" },
            customer_name:  { type: "string" },
            customer_phone: { type: "string" },
            customer_email: { type: "string" },
            pax:            { type: "integer", minimum: 1, default: 2 },
            date:           { type: "string", description: "YYYY-MM-DD" },
            time_slot:      { type: "string", description: "HH:MM (24h)" },
            notes:          { type: "string" },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = createSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(body.error.errors[0]?.message ?? "Validation error"));
      }
      const reservation = await createReservation({
        tenant_id: req.params.tenant_id,
        branch_id: req.params.branch_id,
        created_by: req.staff?.user_id,
        ...body.data,
      });
      return reply.code(201).send(apiSuccess({ reservation }));
    }
  );

  // GET — list reservations (filter by ?date=YYYY-MM-DD&status=confirmed)
  fastify.get<{ Params: BranchParams; Querystring: { date?: string; status?: string } }>(
    "/",
    {
      schema: {
        summary: "List reservations",
        tags: ["Reservations"],
        params: { type: "object", properties: { tenant_id: { type: "string" }, branch_id: { type: "string" } } },
        querystring: {
          type: "object",
          properties: {
            date:   { type: "string", description: "Filter by date YYYY-MM-DD" },
            status: { type: "string" },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const { tenant_id, branch_id } = req.params;
      const { date, status } = req.query as { date?: string; status?: string };
      const reservations = await listReservations(tenant_id, branch_id, date, status);
      return reply.send(apiSuccess({ reservations }));
    }
  );

  // PATCH — update status, assign table, edit details
  fastify.patch<{ Params: ReservationParams }>(
    "/:id",
    {
      schema: {
        summary: "Update a reservation",
        tags: ["Reservations"],
        params: { type: "object", properties: { tenant_id: { type: "string" }, branch_id: { type: "string" }, id: { type: "string" } } },
        body: {
          type: "object",
          properties: {
            status:    { type: "string", enum: ["pending", "confirmed", "seated", "cancelled", "no_show"] },
            table_id:  { type: "string", nullable: true },
            notes:     { type: "string" },
            pax:       { type: "integer", minimum: 1 },
            date:      { type: "string" },
            time_slot: { type: "string" },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updateSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(body.error.errors[0]?.message ?? "Validation error"));
      }
      const existing = await findReservationById(req.params.id, req.params.tenant_id);
      if (!existing) return reply.code(404).send(apiError("Reservation not found"));

      const reservation = await updateReservation(
        req.params.id,
        req.params.tenant_id,
        body.data
      );
      return reply.send(apiSuccess({ reservation }));
    }
  );

  // DELETE — cancel/remove a reservation
  fastify.delete<{ Params: ReservationParams }>(
    "/:id",
    {
      schema: {
        summary: "Delete a reservation",
        tags: ["Reservations"],
        params: { type: "object", properties: { tenant_id: { type: "string" }, branch_id: { type: "string" }, id: { type: "string" } } },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await deleteReservation(req.params.id, req.params.tenant_id);
        return reply.send(apiSuccess({ message: "Reservation deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );
}
