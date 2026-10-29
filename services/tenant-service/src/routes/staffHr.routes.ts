import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { formatZodError } from "../lib/zodError";
import { authenticateStaff } from "../middleware/authenticate";
import {
  findWagesByUser, findCurrentWage, createWage, updateWage, deleteWage,
} from "../repositories/wage.repository";
import {
  findShiftTemplates, createShiftTemplate, updateShiftTemplate, deleteShiftTemplate,
  findShiftAssignments, createShiftAssignment, updateShiftAssignment, deleteShiftAssignment,
} from "../repositories/shift.repository";
import {
  findAttendance, upsertAttendance, getAttendanceSummary,
} from "../repositories/attendance.repository";
import {
  findLeaveTypes, createLeaveType, updateLeaveType,
  findLeaveBalances, upsertLeaveBalance, incrementLeaveUsed,
  findLeaveRequests, findLeaveRequestById, createLeaveRequest, updateLeaveRequestStatus,
} from "../repositories/leave.repository";

const genericOk = {
  type: "object",
  properties: { success: { type: "boolean" }, data: { type: "object", additionalProperties: true } },
} as const;

const errResponses = {
  400: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  401: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
} as const;

type TenantParams = { tenant_id: string };

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const wageSchema = z.object({
  user_id: z.string().min(1),
  wage_type: z.enum(["monthly", "hourly", "daily", "per_shift"]),
  amount: z.number().int().positive(),
  currency: z.string().optional(),
  effective_from: z.string().datetime(),
  effective_to: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const shiftTemplateSchema = z.object({
  name: z.string().min(1),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm format"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm format"),
  branch_id: z.string().optional(),
  break_mins: z.number().int().min(0).optional(),
  color: z.string().optional(),
});

const shiftAssignSchema = z.object({
  user_id: z.string().min(1),
  shift_id: z.string().min(1),
  date: z.string().datetime(),
  branch_id: z.string().optional(),
});

const clockInSchema = z.object({
  user_id: z.string().min(1),
  method: z.enum(["app_pin", "gps", "manual"]).optional(),
  branch_id: z.string().optional(),
});

const clockOutSchema = z.object({
  user_id: z.string().min(1),
  method: z.enum(["app_pin", "gps", "manual"]).optional(),
});

const leaveTypeSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(5),
  annual_quota: z.number().int().min(0).optional(),
  is_paid: z.boolean().optional(),
  carry_forward: z.boolean().optional(),
  max_carry: z.number().int().min(0).optional(),
});

const leaveRequestSchema = z.object({
  user_id: z.string().min(1),
  leave_type_id: z.string().min(1),
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
  days: z.number().positive(),
  reason: z.string().optional(),
});

const leaveReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  review_notes: z.string().optional(),
});

/**
 * Staff HR routes — registered at /api/v1/tenants/:tenant_id/hr
 */
export async function staffHrRoutes(fastify: FastifyInstance): Promise<void> {
  // ═══════════════════════════════════════════════════════════════════════════
  // WAGES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /wages/:user_id — get wage history for a staff member
  fastify.get<{ Params: TenantParams & { user_id: string } }>(
    "/wages/:user_id",
    { schema: { summary: "Get wage history", tags: ["Wages"], response: { 200: genericOk } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const wages = await findWagesByUser(req.params.user_id, req.params.tenant_id);
      const current = await findCurrentWage(req.params.user_id, req.params.tenant_id);
      return reply.send(apiSuccess({ wages, current_wage: current }));
    }
  );

  // POST /wages — set wage for a staff member
  fastify.post<{ Params: TenantParams }>(
    "/wages",
    {
      schema: { summary: "Set staff wage", tags: ["Wages"], body: { type: "object", additionalProperties: true }, response: { 201: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = wageSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        // Close any existing open-ended wage for this user
        const current = await findCurrentWage(body.data.user_id, req.params.tenant_id);
        if (current) {
          await updateWage(current.id, req.params.tenant_id, {
            effective_to: new Date(body.data.effective_from),
          });
        }
        const wage = await createWage({
          tenant_id: req.params.tenant_id,
          ...body.data,
          effective_from: new Date(body.data.effective_from),
          effective_to: body.data.effective_to ? new Date(body.data.effective_to) : undefined,
        });
        return reply.code(201).send(apiSuccess({ wage }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /wages/:id — delete a wage record
  fastify.delete<{ Params: TenantParams & { id: string } }>(
    "/wages/:id",
    { schema: { summary: "Delete wage record", tags: ["Wages"], response: { 200: genericOk } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      await deleteWage(req.params.id, req.params.tenant_id);
      return reply.send(apiSuccess({ message: "Wage deleted" }));
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SHIFT TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /shifts — list shift templates
  fastify.get<{ Params: TenantParams }>(
    "/shifts",
    { schema: { summary: "List shift templates", tags: ["Shifts"], response: { 200: genericOk } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const shifts = await findShiftTemplates(req.params.tenant_id);
      return reply.send(apiSuccess({ shifts }));
    }
  );

  // POST /shifts — create shift template
  fastify.post<{ Params: TenantParams }>(
    "/shifts",
    {
      schema: { summary: "Create shift template", tags: ["Shifts"], body: { type: "object", additionalProperties: true }, response: { 201: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = shiftTemplateSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      const shift = await createShiftTemplate({ tenant_id: req.params.tenant_id, ...body.data });
      return reply.code(201).send(apiSuccess({ shift }));
    }
  );

  // PATCH /shifts/:id — update shift template
  fastify.patch<{ Params: TenantParams & { id: string } }>(
    "/shifts/:id",
    {
      schema: { summary: "Update shift template", tags: ["Shifts"], body: { type: "object", additionalProperties: true }, response: { 200: genericOk } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = shiftTemplateSchema.partial().safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      await updateShiftTemplate(req.params.id, req.params.tenant_id, body.data);
      return reply.send(apiSuccess({ message: "Shift updated" }));
    }
  );

  // DELETE /shifts/:id — delete shift template
  fastify.delete<{ Params: TenantParams & { id: string } }>(
    "/shifts/:id",
    { schema: { summary: "Delete shift template", tags: ["Shifts"], response: { 200: genericOk } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      await deleteShiftTemplate(req.params.id, req.params.tenant_id);
      return reply.send(apiSuccess({ message: "Shift deleted" }));
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SHIFT ASSIGNMENTS (SCHEDULE)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /schedule — get shift schedule (filterable by user_id, date range)
  fastify.get<{ Params: TenantParams; Querystring: { user_id?: string; date_from?: string; date_to?: string } }>(
    "/schedule",
    {
      schema: {
        summary: "Get shift schedule", tags: ["Shifts"],
        querystring: { type: "object", properties: { user_id: { type: "string" }, date_from: { type: "string" }, date_to: { type: "string" } } },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const assignments = await findShiftAssignments(req.params.tenant_id, {
        user_id: req.query.user_id,
        date_from: req.query.date_from ? new Date(req.query.date_from) : undefined,
        date_to: req.query.date_to ? new Date(req.query.date_to) : undefined,
      });
      return reply.send(apiSuccess({ assignments }));
    }
  );

  // POST /schedule — assign a shift to a user on a date
  fastify.post<{ Params: TenantParams }>(
    "/schedule",
    {
      schema: { summary: "Assign shift", tags: ["Shifts"], body: { type: "object", additionalProperties: true }, response: { 201: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = shiftAssignSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const assignment = await createShiftAssignment({
          tenant_id: req.params.tenant_id,
          ...body.data,
          date: new Date(body.data.date),
        });
        return reply.code(201).send(apiSuccess({ assignment }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /schedule/:id — update shift assignment status
  fastify.patch<{ Params: TenantParams & { id: string } }>(
    "/schedule/:id",
    {
      schema: { summary: "Update shift assignment", tags: ["Shifts"], body: { type: "object", additionalProperties: true }, response: { 200: genericOk } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const { status, notes } = req.body as { status?: string; notes?: string };
      await updateShiftAssignment(req.params.id, req.params.tenant_id, { status, notes });
      return reply.send(apiSuccess({ message: "Assignment updated" }));
    }
  );

  // DELETE /schedule/:id — remove shift assignment
  fastify.delete<{ Params: TenantParams & { id: string } }>(
    "/schedule/:id",
    { schema: { summary: "Remove shift assignment", tags: ["Shifts"], response: { 200: genericOk } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      await deleteShiftAssignment(req.params.id, req.params.tenant_id);
      return reply.send(apiSuccess({ message: "Assignment removed" }));
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTENDANCE
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /attendance — list attendance (filterable)
  fastify.get<{ Params: TenantParams; Querystring: { user_id?: string; date_from?: string; date_to?: string; status?: string } }>(
    "/attendance",
    {
      schema: {
        summary: "List attendance", tags: ["Attendance"],
        querystring: { type: "object", properties: { user_id: { type: "string" }, date_from: { type: "string" }, date_to: { type: "string" }, status: { type: "string" } } },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const records = await findAttendance(req.params.tenant_id, {
        user_id: req.query.user_id,
        date_from: req.query.date_from ? new Date(req.query.date_from) : undefined,
        date_to: req.query.date_to ? new Date(req.query.date_to) : undefined,
        status: req.query.status,
      });
      return reply.send(apiSuccess({ records }));
    }
  );

  // GET /attendance/summary/:user_id — monthly summary
  fastify.get<{ Params: TenantParams & { user_id: string }; Querystring: { year: string; month: string } }>(
    "/attendance/summary/:user_id",
    {
      schema: {
        summary: "Attendance summary", tags: ["Attendance"],
        querystring: { type: "object", required: ["year", "month"], properties: { year: { type: "string" }, month: { type: "string" } } },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const summary = await getAttendanceSummary(
        req.params.tenant_id,
        req.params.user_id,
        parseInt(req.query.year, 10),
        parseInt(req.query.month, 10)
      );
      return reply.send(apiSuccess(summary));
    }
  );

  // POST /attendance/clock-in — clock in
  fastify.post<{ Params: TenantParams }>(
    "/attendance/clock-in",
    {
      schema: { summary: "Clock in", tags: ["Attendance"], body: { type: "object", additionalProperties: true }, response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = clockInSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const record = await upsertAttendance(body.data.user_id, today, {
        tenant_id: req.params.tenant_id,
        branch_id: body.data.branch_id,
        clock_in: now,
        clock_in_method: body.data.method,
        status: "present",
      });
      return reply.send(apiSuccess({ attendance: record }));
    }
  );

  // POST /attendance/clock-out — clock out
  fastify.post<{ Params: TenantParams }>(
    "/attendance/clock-out",
    {
      schema: { summary: "Clock out", tags: ["Attendance"], body: { type: "object", additionalProperties: true }, response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = clockOutSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Compute hours worked
      const existing = await findAttendance(req.params.tenant_id, {
        user_id: body.data.user_id,
        date_from: today,
        date_to: today,
      });
      const clockIn = existing[0]?.clock_in;
      const hoursWorked = clockIn ? (now.getTime() - new Date(clockIn).getTime()) / 3600000 : undefined;

      const record = await upsertAttendance(body.data.user_id, today, {
        tenant_id: req.params.tenant_id,
        clock_out: now,
        clock_out_method: body.data.method,
        hours_worked: hoursWorked ? Math.round(hoursWorked * 100) / 100 : undefined,
      });
      return reply.send(apiSuccess({ attendance: record }));
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAVE TYPES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /leave-types
  fastify.get<{ Params: TenantParams }>(
    "/leave-types",
    { schema: { summary: "List leave types", tags: ["Leaves"], response: { 200: genericOk } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const types = await findLeaveTypes(req.params.tenant_id);
      return reply.send(apiSuccess({ leave_types: types }));
    }
  );

  // POST /leave-types
  fastify.post<{ Params: TenantParams }>(
    "/leave-types",
    {
      schema: { summary: "Create leave type", tags: ["Leaves"], body: { type: "object", additionalProperties: true }, response: { 201: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = leaveTypeSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const type = await createLeaveType({ tenant_id: req.params.tenant_id, ...body.data });
        return reply.code(201).send(apiSuccess({ leave_type: type }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /leave-types/:id
  fastify.patch<{ Params: TenantParams & { id: string } }>(
    "/leave-types/:id",
    {
      schema: { summary: "Update leave type", tags: ["Leaves"], body: { type: "object", additionalProperties: true }, response: { 200: genericOk } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = leaveTypeSchema.partial().safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      await updateLeaveType(req.params.id, req.params.tenant_id, body.data);
      return reply.send(apiSuccess({ message: "Leave type updated" }));
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAVE BALANCES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /leave-balances/:user_id?year=2026
  fastify.get<{ Params: TenantParams & { user_id: string }; Querystring: { year?: string } }>(
    "/leave-balances/:user_id",
    {
      schema: {
        summary: "Get leave balances", tags: ["Leaves"],
        querystring: { type: "object", properties: { year: { type: "string" } } },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const year = parseInt(req.query.year ?? String(new Date().getFullYear()), 10);
      const balances = await findLeaveBalances(req.params.tenant_id, req.params.user_id, year);
      return reply.send(apiSuccess({ balances, year }));
    }
  );

  // POST /leave-balances — initialize balances for a user (typically done at year start or when adding a new employee)
  fastify.post<{ Params: TenantParams }>(
    "/leave-balances",
    {
      schema: { summary: "Initialize leave balances", tags: ["Leaves"], body: { type: "object", additionalProperties: true }, response: { 200: genericOk } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const { user_id, year } = req.body as { user_id: string; year: number };
      if (!user_id || !year) return reply.code(400).send(apiError("user_id and year required"));

      const types = await findLeaveTypes(req.params.tenant_id);
      const balances = [];
      for (const lt of types) {
        if (!lt.is_active) continue;
        const b = await upsertLeaveBalance(user_id, lt.id, year, {
          tenant_id: req.params.tenant_id,
          total: lt.annual_quota,
        });
        balances.push(b);
      }
      return reply.send(apiSuccess({ balances }));
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAVE REQUESTS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /leave-requests — list (filterable by user_id, status)
  fastify.get<{ Params: TenantParams; Querystring: { user_id?: string; status?: string } }>(
    "/leave-requests",
    {
      schema: {
        summary: "List leave requests", tags: ["Leaves"],
        querystring: { type: "object", properties: { user_id: { type: "string" }, status: { type: "string" } } },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const requests = await findLeaveRequests(req.params.tenant_id, {
        user_id: req.query.user_id,
        status: req.query.status,
      });
      return reply.send(apiSuccess({ requests }));
    }
  );

  // POST /leave-requests — submit a leave request
  fastify.post<{ Params: TenantParams }>(
    "/leave-requests",
    {
      schema: { summary: "Submit leave request", tags: ["Leaves"], body: { type: "object", additionalProperties: true }, response: { 201: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = leaveRequestSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const request = await createLeaveRequest({
          tenant_id: req.params.tenant_id,
          ...body.data,
          start_date: new Date(body.data.start_date),
          end_date: new Date(body.data.end_date),
        });
        return reply.code(201).send(apiSuccess({ request }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /leave-requests/:id/review — approve or reject
  fastify.patch<{ Params: TenantParams & { id: string } }>(
    "/leave-requests/:id/review",
    {
      schema: { summary: "Review leave request", tags: ["Leaves"], body: { type: "object", additionalProperties: true }, response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = leaveReviewSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));

      const request = await findLeaveRequestById(req.params.id, req.params.tenant_id);
      if (!request) return reply.code(404).send(apiError("Leave request not found"));

      await updateLeaveRequestStatus(req.params.id, req.params.tenant_id, {
        status: body.data.status,
        reviewed_by: req.staff!.user_id,
        review_notes: body.data.review_notes,
      });

      // If approved, update leave balance
      if (body.data.status === "approved") {
        const year = new Date(request.start_date).getFullYear();
        await incrementLeaveUsed(request.user_id, request.leave_type_id, year, request.days);
      }

      return reply.send(apiSuccess({ message: `Leave request ${body.data.status}` }));
    }
  );
}
