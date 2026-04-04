import { FastifyInstance } from "fastify";
import { z } from "zod";
import { notificationQueue } from "../lib/queue";
import { sendOtp, verifyOtp } from "../services/otp.service";
import { getChannelsForEvent } from "../services/router.service";
import { logger } from "../lib/logger";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "";

// Zod schemas
const EmailSchema = z.object({
  to: z.string().refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "Invalid email" }),
  subject: z.string().optional(),
  template: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  tenant_id: z.string().optional(),
});

const SmsSchema = z.object({
  to: z.string().min(5),
  template: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  tenant_id: z.string().optional(),
});

const PushSchema = z.object({
  to: z.string().min(1),
  template: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  tenant_id: z.string().optional(),
});

const WhatsappSchema = z.object({
  to: z.string().min(5),
  template: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  tenant_id: z.string().optional(),
});

const SmartSendSchema = z.object({
  event: z.string(),
  business_type: z.string().default("default"),
  recipients: z.object({
    email: z.string().optional(),
    phone: z.string().optional(),
    push_token: z.string().optional(),
  }),
  subject: z.string().optional(),
  template: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  tenant_id: z.string().optional(),
});

const OtpSendSchema = z.object({
  phone: z.string().min(5),
  tenant_id: z.string(),
});

const OtpVerifySchema = z.object({
  phone: z.string().min(5),
  otp: z.string().refine((v) => /^\d{6}$/.test(v), { message: "OTP must be 6 digits" }),
  tenant_id: z.string(),
});

function checkInternalSecret(request: { headers: Record<string, string | string[] | undefined> }): boolean {
  const secret = request.headers["x-internal-secret"];
  return secret === INTERNAL_SECRET;
}

export async function notifyRoutes(app: FastifyInstance): Promise<void> {
  // Internal secret middleware hook
  app.addHook("preHandler", async (request, reply) => {
    if (!checkInternalSecret(request as unknown as { headers: Record<string, string | string[] | undefined> })) {
      reply.code(401).send({ success: false, error: "Unauthorized: missing or invalid X-Internal-Secret" });
    }
  });

  // POST /api/v1/notify/email
  app.post("/api/v1/notify/email", async (request, reply) => {
    const parsed = EmailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.message });
    }
    const { to, subject, template, data, tenant_id } = parsed.data;

    const job = await notificationQueue.add("email", {
      type: "email",
      to,
      subject,
      template,
      data: data ?? {},
      tenant_id,
    });

    logger.info({ job_id: job.id, to }, "Email job queued");
    return reply.send({ success: true, data: { job_id: job.id } });
  });

  // POST /api/v1/notify/sms
  app.post("/api/v1/notify/sms", async (request, reply) => {
    const parsed = SmsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.message });
    }
    const { to, template, data, tenant_id } = parsed.data;

    const job = await notificationQueue.add("sms", {
      type: "sms",
      to,
      template,
      data: data ?? {},
      tenant_id,
    });

    return reply.send({ success: true, data: { job_id: job.id } });
  });

  // POST /api/v1/notify/push
  app.post("/api/v1/notify/push", async (request, reply) => {
    const parsed = PushSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.message });
    }
    const { to, template, data, tenant_id } = parsed.data;

    const job = await notificationQueue.add("push", {
      type: "push",
      to,
      template,
      data: data ?? {},
      tenant_id,
    });

    return reply.send({ success: true, data: { job_id: job.id } });
  });

  // POST /api/v1/notify/whatsapp
  app.post("/api/v1/notify/whatsapp", async (request, reply) => {
    const parsed = WhatsappSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.message });
    }
    const { to, template, data, tenant_id } = parsed.data;

    const job = await notificationQueue.add("whatsapp", {
      type: "whatsapp",
      to,
      template,
      data: data ?? {},
      tenant_id,
    });

    return reply.send({ success: true, data: { job_id: job.id } });
  });

  // POST /api/v1/notify/send — smart router
  app.post("/api/v1/notify/send", async (request, reply) => {
    const parsed = SmartSendSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.message });
    }

    const { event, business_type, recipients, subject, template, data, tenant_id } = parsed.data;
    const channels = getChannelsForEvent(event, business_type);

    const jobIds: string[] = [];

    for (const channel of channels) {
      let to: string | undefined;
      switch (channel) {
        case "email":
          to = recipients.email;
          break;
        case "sms":
        case "whatsapp":
          to = recipients.phone;
          break;
        case "push":
          to = recipients.push_token ?? recipients.phone;
          break;
      }

      if (!to) {
        logger.debug({ channel, event }, "No recipient for channel, skipping");
        continue;
      }

      const job = await notificationQueue.add(`smart-${channel}`, {
        type: channel,
        to,
        subject,
        template,
        data: data ?? {},
        tenant_id,
      });
      jobIds.push(job.id ?? "unknown");
    }

    return reply.send({ success: true, data: { channels, job_ids: jobIds } });
  });

  // GET /api/v1/notify/queue/status
  app.get("/api/v1/notify/queue/status", async (_request, reply) => {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      notificationQueue.getWaitingCount(),
      notificationQueue.getActiveCount(),
      notificationQueue.getCompletedCount(),
      notificationQueue.getFailedCount(),
      notificationQueue.getDelayedCount(),
    ]);

    return reply.send({
      success: true,
      data: { waiting, active, completed, failed, delayed },
    });
  });

  // POST /api/v1/notify/otp/send
  app.post("/api/v1/notify/otp/send", async (request, reply) => {
    const parsed = OtpSendSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.message });
    }

    const result = await sendOtp(parsed.data.phone, parsed.data.tenant_id);

    if (!result.success) {
      return reply.code(429).send({ success: false, error: result.message });
    }

    return reply.send({ success: true, data: { message: result.message } });
  });

  // POST /api/v1/notify/otp/verify
  app.post("/api/v1/notify/otp/verify", async (request, reply) => {
    const parsed = OtpVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.message });
    }

    const result = await verifyOtp(parsed.data.phone, parsed.data.otp, parsed.data.tenant_id);

    if (!result.verified) {
      return reply.code(401).send({ success: false, error: result.message });
    }

    return reply.send({ success: true, data: { verified: true, message: result.message } });
  });
}
