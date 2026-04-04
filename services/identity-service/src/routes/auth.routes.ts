import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError, ROLES } from "@ulcp/shared";
import {
  register,
  login,
  refresh,
  logout,
  getMe,
  assignTenant,
} from "../services/auth.service";
import { findUserByIdOnly, updateUserTenant, findUsersByTenant } from "../repositories/user.repository";
import { authenticateStaff } from "../middleware/authenticate";
import { storeOtp, verifyOtp } from "../repositories/otp.repository";
import { signCustomerToken, verifyCustomerToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";

const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const socialProfilePatchSchema = z.object({
  bio:          z.string().max(150).optional(),
  interests:    z.array(z.string()).optional(),
  looking_for:  z.enum(["friendship", "date", "networking", "fun", "any"]).optional(),
  prepared_qa:  z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  emoji_avatar: z.string().max(10).optional(),
  show_profile: z.boolean().optional(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  mobile: z.string().optional(),
  tenant_id: z.string().transform(v => v || undefined).optional(),
  role: z.string().transform(v => v || undefined).optional(),
  permissions: z.array(z.string()).default([]),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Empty string "" treated the same as omitted — finds pending_onboarding user
  tenant_id: z.string().transform(v => v || undefined).optional(),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

const assignTenantSchema = z.object({
  tenant_id: z.string().min(1),
  role: z.string().default(ROLES.TENANT_OWNER),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /auth/register
  fastify.post(
    "/register",
    {
      schema: {
        summary: "Register a new user",
        description: "Owner registers without tenant_id. Staff/partners register with tenant_id from their invite.",
        tags: ["Auth"],
        security: [],
        body: {
          type: "object",
          required: ["email", "password", "name"],
          properties: {
            email:       { type: "string", format: "email" },
            password:    { type: "string", minLength: 8 },
            name:        { type: "string" },
            mobile:      { type: "string" },
            tenant_id:   { type: "string", description: "Omit when registering as a new owner" },
            role:        { type: "string", description: "Defaults to pending_onboarding" },
            permissions: { type: "array", items: { type: "string" } },
          },
        },
        response: {
          201: {
            description: "User registered",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  access_token:  { type: "string" },
                  refresh_token: { type: "string" },
                  user: { type: "object", additionalProperties: true },
                },
              },
            },
          },
          400: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
          409: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const body = registerSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(body.error.errors[0]?.message ?? "Validation error"));
      }
      try {
        const result = await register(body.data);
        reply.setCookie("refreshToken", result.refreshToken, {
          httpOnly: true,
          secure: process.env["NODE_ENV"] === "production",
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60,
          path: "/api/v1/auth/refresh",
        });
        return reply.code(201).send(
          apiSuccess({ access_token: result.accessToken, refresh_token: result.refreshToken, user: result.user })
        );
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /auth/login
  fastify.post(
    "/login",
    {
      schema: {
        summary: "Login with email + password",
        description: "Omit tenant_id if the user is still in pending_onboarding state.",
        tags: ["Auth"],
        security: [],
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email:     { type: "string", format: "email" },
            password:  { type: "string" },
            tenant_id: { type: "string", description: "Omit for pending_onboarding users" },
          },
        },
        response: {
          200: {
            description: "Login successful",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  access_token:  { type: "string" },
                  refresh_token: { type: "string" },
                  user: { type: "object", additionalProperties: true },
                },
              },
            },
          },
          401: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const body = loginSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(body.error.errors[0]?.message ?? "Validation error"));
      }
      try {
        const result = await login(body.data);
        reply.setCookie("refreshToken", result.refreshToken, {
          httpOnly: true,
          secure: process.env["NODE_ENV"] === "production",
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60,
          path: "/api/v1/auth/refresh",
        });
        return reply.send(
          apiSuccess({ access_token: result.accessToken, refresh_token: result.refreshToken, user: result.user })
        );
      } catch (err) {
        // Multiple tenants: ask the frontend to show a business picker
        if (err instanceof Error && err.message === "TENANT_SELECTION_REQUIRED") {
          const tenants = (err as Error & { tenants: Array<{ tenant_id: string; role: string }> }).tenants;
          // Enrich with business names from tenant-service (best-effort, no failure if unavailable)
          const TENANT_URL = process.env["TENANT_SERVICE_URL"] ?? "http://localhost:3002";
          const enriched = await Promise.all(
            tenants.map(async (t) => {
              try {
                const res = await fetch(`${TENANT_URL}/api/v1/tenants/${t.tenant_id}`, {
                  headers: { "x-internal-secret": INTERNAL_SECRET },
                });
                const json = await res.json() as { success: boolean; data?: { tenant?: { name?: string; business_type?: string } } };
                const tenant = json?.data?.tenant;
                return { ...t, business_name: tenant?.name ?? t.tenant_id, business_type: tenant?.business_type ?? "" };
              } catch {
                return { ...t, business_name: t.tenant_id, business_type: "" };
              }
            })
          );
          return reply.code(300).send({ success: false, error: "TENANT_SELECTION_REQUIRED", data: { tenants: enriched } });
        }
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /auth/refresh
  fastify.post(
    "/refresh",
    {
      schema: {
        summary: "Refresh access token",
        tags: ["Auth"],
        security: [],
        body: {
          type: "object",
          properties: { refresh_token: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  access_token:  { type: "string" },
                  refresh_token: { type: "string" },
                },
              },
            },
          },
          401: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const cookieToken = (req.cookies as Record<string, string>)["refreshToken"];
      const bodyParsed = refreshSchema.safeParse(req.body);
      const token = cookieToken ?? (bodyParsed.success ? bodyParsed.data.refresh_token : null);

      if (!token) {
        return reply.code(401).send(apiError("Refresh token required"));
      }
      try {
        const tokens = await refresh(token);
        reply.setCookie("refreshToken", tokens.refreshToken, {
          httpOnly: true,
          secure: process.env["NODE_ENV"] === "production",
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60,
          path: "/api/v1/auth/refresh",
        });
        return reply.send(apiSuccess({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /auth/logout
  fastify.post(
    "/logout",
    {
      preHandler: [authenticateStaff],
      schema: {
        summary: "Logout (invalidate session)",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", properties: { message: { type: "string" } } },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const cookieToken = (req.cookies as Record<string, string>)["refreshToken"];
      await logout(req.staff!.user_id, cookieToken);
      reply.clearCookie("refreshToken", { path: "/api/v1/auth/refresh" });
      return reply.send(apiSuccess({ message: "Logged out" }));
    }
  );

  // GET /auth/me
  fastify.get(
    "/me",
    {
      preHandler: [authenticateStaff],
      schema: {
        summary: "Get current authenticated user",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: { user: { type: "object", additionalProperties: true } },
              },
            },
          },
          401: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      try {
        const user = await getMe(req.staff!.user_id, req.staff!.tenant_id);
        return reply.send(apiSuccess({ user }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // PATCH /auth/users/:id/tenant  — internal: called by tenant-service after creating a tenant
  // Secured by X-Internal-Secret header, NOT exposed through Kong externally
  fastify.patch<{ Params: { id: string } }>(
    "/users/:id/tenant",
    {
      schema: {
        summary: "[Internal] Assign tenant_id to a user",
        description: "Called by tenant-service after creating a tenant. Requires X-Internal-Secret header. Never expose this through the API gateway.",
        tags: ["Internal"],
        security: [],
        params: { type: "object", properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["tenant_id"],
          properties: {
            tenant_id: { type: "string" },
            role:      { type: "string", description: "Defaults to tenant_owner" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", properties: { user: { type: "object", additionalProperties: true } } },
            },
          },
          401: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
          404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
          409: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      // Verify internal secret
      const secret = req.headers["x-internal-secret"];
      if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
        return reply.code(401).send(apiError("Unauthorized"));
      }

      const body = assignTenantSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(body.error.errors[0]?.message ?? "Validation error"));
      }

      try {
        const user = await assignTenant(req.params.id, body.data.tenant_id, body.data.role);
        return reply.send(apiSuccess({ user }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // GET /auth/users/:id  — internal: fetch minimal user profile (for owner enrichment)
  fastify.get<{ Params: { id: string } }>(
    "/users/:id",
    {
      schema: {
        summary: "[Internal] Get user by ID",
        description: "Returns name, email, mobile for embedding in tenant responses. Requires X-Internal-Secret.",
        tags: ["Internal"],
        security: [],
        params: { type: "object", properties: { id: { type: "string" } } },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", properties: { user: { type: "object", additionalProperties: true } } },
            },
          },
          401: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
          404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const secret = req.headers["x-internal-secret"];
      if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
        return reply.code(401).send(apiError("Unauthorized"));
      }
      const user = await findUserByIdOnly(req.params.id);
      if (!user) return reply.code(404).send(apiError("User not found"));
      const { password_hash, pin_hash, ...safe } = user;
      return reply.send(apiSuccess({
        user: {
          user_id: safe.id,
          name: safe.name,
          email: safe.email,
          mobile: safe.mobile,
        },
      }));
    }
  );

  // PATCH /auth/users/:id/role  — internal: update role only (ownership transfer)
  fastify.patch<{ Params: { id: string } }>(
    "/users/:id/role",
    {
      schema: {
        summary: "[Internal] Update user role",
        description: "Used during ownership transfer to promote/demote roles. Requires X-Internal-Secret.",
        tags: ["Internal"],
        security: [],
        params: { type: "object", properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["role"],
          properties: { role: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", properties: { user: { type: "object", additionalProperties: true } } },
            },
          },
          401: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
          404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const secret = req.headers["x-internal-secret"];
      if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
        return reply.code(401).send(apiError("Unauthorized"));
      }
      const { role } = req.body as { role: string };
      if (!role) return reply.code(400).send(apiError("role is required"));

      const user = await findUserByIdOnly(req.params.id);
      if (!user) return reply.code(404).send(apiError("User not found"));

      const updated = await updateUserTenant(req.params.id, user.tenant_id ?? "", role);
      const { password_hash, pin_hash, ...safe } = updated;
      return reply.send(apiSuccess({ user: safe }));
    }
  );

  // GET /auth/users — list all active staff for the authenticated user's tenant
  fastify.get(
    "/users",
    {
      preHandler: [authenticateStaff],
      schema: {
        summary: "List staff for tenant",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", properties: { users: { type: "array", items: { type: "object", additionalProperties: true } } } },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const tenantId = req.staff!.tenant_id;
      if (!tenantId) return reply.code(400).send(apiError("No tenant associated with this account"));
      const users = await findUsersByTenant(tenantId);
      const safe = users.map(({ password_hash, pin_hash, ...u }) => u);
      return reply.send(apiSuccess({ users: safe }));
    }
  );

  // ─── Customer OTP ───────────────────────────────────────────────────────────

  // POST /auth/customer/otp/send
  fastify.post<{ Body: { phone: string } }>(
    "/customer/otp/send",
    {
      schema: {
        summary: "Send OTP to customer phone",
        tags: ["Customer Auth"],
        security: [],
        body: { type: "object", required: ["phone"], properties: { phone: { type: "string" } } },
        response: { 200: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", additionalProperties: true } } } },
      },
    },
    async (req, reply) => {
      const { phone } = req.body;
      if (!phone) return reply.code(400).send(apiError("phone is required"));

      // Generate 6-digit OTP (in dev: fixed "123456")
      const otp = process.env["NODE_ENV"] === "production"
        ? String(Math.floor(100000 + Math.random() * 900000))
        : "123456";

      await storeOtp(phone, otp);

      // In production: send via MSG91. For now log it.
      if (process.env["NODE_ENV"] !== "production") {
        console.log(`[DEV] OTP for ${phone}: ${otp}`);
      }

      return reply.send(apiSuccess({ message: "OTP sent" }));
    }
  );

  // POST /auth/customer/otp/verify
  fastify.post<{ Body: { phone: string; otp: string; name?: string } }>(
    "/customer/otp/verify",
    {
      schema: {
        summary: "Verify OTP and login/register customer",
        tags: ["Customer Auth"],
        security: [],
        body: { type: "object", required: ["phone", "otp"], properties: { phone: { type: "string" }, otp: { type: "string" }, name: { type: "string" } } },
        response: { 200: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", additionalProperties: true } } } },
      },
    },
    async (req, reply) => {
      const { phone, otp, name } = req.body;
      const valid = await verifyOtp(phone, otp);
      if (!valid) return reply.code(401).send(apiError("Invalid or expired OTP"));

      // Upsert customer — save name if provided and not already set
      let customer = await prisma.platformCustomer.findUnique({ where: { mobile: phone } });
      if (!customer) {
        customer = await prisma.platformCustomer.create({ data: { mobile: phone, name: name?.trim() || null } });
      } else if (name?.trim() && !customer.name) {
        customer = await prisma.platformCustomer.update({ where: { id: customer.id }, data: { name: name.trim() } });
      }

      const token = signCustomerToken(customer.id);
      return reply.send(apiSuccess({
        token,
        customerId: customer.id,
        name: customer.name ?? "",
        phone: customer.mobile,
      }));
    }
  );

  // ─── Social Profile ─────────────────────────────────────────────────────────

  // GET /auth/customer/social-profile
  fastify.get(
    "/customer/social-profile",
    {
      schema: {
        summary: "Get customer social profile",
        tags: ["Customer Auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", additionalProperties: true } } },
          401: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
          404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply.code(401).send(apiError("Unauthorized"));
      }
      const token = authHeader.slice(7);
      let payload: { customer_id: string };
      try {
        payload = verifyCustomerToken(token) as { customer_id: string };
      } catch {
        return reply.code(401).send(apiError("Invalid token"));
      }

      const customer = await prisma.platformCustomer.findUnique({ where: { id: payload.customer_id } });
      if (!customer) return reply.code(404).send(apiError("Customer not found"));

      const defaultProfile = {
        bio: "",
        interests: [],
        looking_for: "any",
        prepared_qa: [],
        emoji_avatar: "",
        show_profile: false,
      };

      return reply.send(apiSuccess({
        social_profile: customer.social_profile ?? defaultProfile,
      }));
    }
  );

  // PATCH /auth/customer/social-profile
  fastify.patch(
    "/customer/social-profile",
    {
      schema: {
        summary: "Update customer social profile",
        tags: ["Customer Auth"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            bio:          { type: "string", maxLength: 150 },
            interests:    { type: "array", items: { type: "string" } },
            looking_for:  { type: "string", enum: ["friendship", "date", "networking", "fun", "any"] },
            prepared_qa:  { type: "array", items: { type: "object", additionalProperties: true } },
            emoji_avatar: { type: "string" },
            show_profile: { type: "boolean" },
          },
        },
        response: {
          200: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", additionalProperties: true } } },
          400: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
          401: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
          404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply.code(401).send(apiError("Unauthorized"));
      }
      const token = authHeader.slice(7);
      let payload: { customer_id: string };
      try {
        payload = verifyCustomerToken(token) as { customer_id: string };
      } catch {
        return reply.code(401).send(apiError("Invalid token"));
      }

      const customer = await prisma.platformCustomer.findUnique({ where: { id: payload.customer_id } });
      if (!customer) return reply.code(404).send(apiError("Customer not found"));

      const parsed = socialProfilePatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(apiError(parsed.error.errors[0]?.message ?? "Validation error"));
      }

      // Merge with existing profile so partial updates don't wipe other fields
      const existing = (customer.social_profile ?? {}) as Record<string, unknown>;
      const updated = { ...existing, ...parsed.data };

      const savedCustomer = await prisma.platformCustomer.update({
        where: { id: customer.id },
        data: { social_profile: updated },
      });

      return reply.send(apiSuccess({ social_profile: savedCustomer.social_profile }));
    }
  );
}
