import { FastifyInstance } from "fastify";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { authenticateStaff } from "../middleware/authenticate";
import { AppError } from "@ulcp/shared";
import { logger } from "../lib/logger";

const JWT_KDS_SECRET = process.env["JWT_KDS_SECRET"] ?? "";

function signKdsToken(payload: {
  device_id: string;
  tenant_id: string;
  branch_id: string;
  station: string;
}): string {
  return jwt.sign(payload, JWT_KDS_SECRET, { expiresIn: "365d" } as jwt.SignOptions);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Routes ───────────────────────────────────────────────────────────────────

export async function kdsRoutes(app: FastifyInstance) {

  // POST /api/v1/tenants/kds/verify-setup-code  (public — called by KDS device)
  app.post("/verify-setup-code", async (req, reply) => {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body);

    const record = await prisma.kdsSetupCode.findUnique({ where: { code } });

    if (!record || record.used_at || record.expires_at < new Date()) {
      throw new AppError("Invalid or expired code", 400);
    }

    // Mark as used
    await prisma.kdsSetupCode.update({
      where: { id: record.id },
      data: { used_at: new Date() },
    });

    // Fetch branch + tenant names for the config payload
    const branch = await prisma.branch.findUnique({
      where: { id: record.branch_id },
      include: { tenant: true },
    });

    if (!branch) throw new AppError("Branch not found", 404);

    const device_id = record.id; // stable ID for this KDS device pairing
    const device_token = signKdsToken({
      device_id,
      tenant_id: record.tenant_id,
      branch_id: record.branch_id,
      station:   record.station,
    });

    logger.info({ tenant_id: record.tenant_id, station: record.station }, "KDS device connected");

    return reply.send({
      success: true,
      data: {
        tenant_id:    record.tenant_id,
        branch_id:    record.branch_id,
        station:      record.station,
        tenant_name:  branch.tenant.name,
        branch_name:  branch.name,
        business_name: branch.tenant.name,
        device_token,
      },
    });
  });

  // POST /api/v1/tenants/:tenant_id/kds/generate-code  (staff auth required)
  app.post(
    "/:tenant_id/generate-code",
    { preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id } = req.params as { tenant_id: string };
      const body = z.object({
        branch_id: z.string(),
        station: z.enum(["kitchen", "bar"]).default("kitchen"),
      }).parse(req.body);

      // Verify tenant exists and requester belongs to it
      const user = (req as unknown as { user: { tenant_id?: string; role?: string } }).user;
      if (user.tenant_id !== tenant_id) throw new AppError("Forbidden", 403);

      // Expire any unused codes for this branch+station
      await prisma.kdsSetupCode.updateMany({
        where: {
          tenant_id,
          branch_id: body.branch_id,
          station:   body.station,
          used_at:   null,
        },
        data: { expires_at: new Date() },
      });

      const KDS_SETUP_CODE_EXPIRY_MINS = 10;
      const expiresAt = new Date(Date.now() + KDS_SETUP_CODE_EXPIRY_MINS * 60 * 1000);

      // Generate unique code
      let code = generateCode();
      let attempts = 0;
      while (await prisma.kdsSetupCode.findUnique({ where: { code } }) && attempts < 10) {
        code = generateCode();
        attempts++;
      }

      const record = await prisma.kdsSetupCode.create({
        data: { code, tenant_id, branch_id: body.branch_id, station: body.station, expires_at: expiresAt },
      });

      logger.info({ tenant_id, branch_id: body.branch_id, station: body.station }, "KDS setup code generated");

      return reply.code(201).send({
        success: true,
        data: {
          code:       record.code,
          station:    record.station,
          expires_at: record.expires_at,
          expires_in_mins: KDS_SETUP_CODE_EXPIRY_MINS,
        },
      });
    }
  );

  // GET /api/v1/tenants/:tenant_id/kds/codes  (list recent codes — staff auth)
  app.get(
    "/:tenant_id/codes",
    { preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id } = req.params as { tenant_id: string };
      const user = (req as unknown as { user: { tenant_id?: string } }).user;
      if (user.tenant_id !== tenant_id) throw new AppError("Forbidden", 403);

      const codes = await prisma.kdsSetupCode.findMany({
        where: { tenant_id, expires_at: { gt: new Date() }, used_at: null },
        orderBy: { created_at: "desc" },
        take: 20,
      });

      return reply.send({ success: true, data: codes });
    }
  );
}
