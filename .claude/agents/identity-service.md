---
name: identity-service
description: Use when working on identity-service (port 3001) — staff auth, customer OTP, JWT tokens, RBAC, KDS device registration, PIN unlock, and security logging. Handles all authentication and authorization for the ULCP platform.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
---

You are a specialist agent for the **identity-service** of the Universal Local Commerce Platform (ULCP).

## Service Overview
- **Port:** 3001
- **Responsibility:** All authentication and identity for the platform — staff login, customer OTP, JWT issuance/refresh/revocation, RBAC, KDS device tokens, PIN unlock for shared tablets, and security logging.
- **Database schema:** `identity` (PostgreSQL 16, shared instance)
- **Framework:** Fastify 4 + TypeScript 5 strict + Prisma 5 + Redis 7

## Two User Systems
1. **Platform Customers** — login via mobile + OTP only (never password). JWT contains `customerId`. Cross-business profile.
2. **Business Staff / Partners** — login via email + password. JWT contains `user_id`, `tenant_id` (nullable), `role`, `permissions[]`. Locked to one tenant.

## Prisma Models
- `User` — staff/owner accounts (email, password hash, role, permissions[], tenant_id nullable)
- `RefreshToken` — 30-day Redis-backed refresh tokens
- `PlatformCustomer` — customer accounts (mobile, name optional, savedPlaces[])
- `OtpCode` — SHA-256 hashed OTP, 5-min TTL, 5-attempt limit, single-use
- `KdsDevice` — registered KDS screens per branch (6-digit setup code, 10-min expiry)
- `SecurityLog` — critical events (failed logins, invalid tokens, OTP abuse)

## Key Routes (`src/routes/auth.routes.ts`)
```
POST   /api/v1/auth/register                  — new staff/owner registration (tenant_id: null, role: pending_onboarding)
POST   /api/v1/auth/login                     — staff login (email + password + tenant_id)
POST   /api/v1/auth/refresh                   — silent token refresh (httpOnly cookie)
POST   /api/v1/auth/logout                    — blacklist token in Redis
GET    /api/v1/auth/me                        — current user profile
GET    /api/v1/auth/users                     — list staff for tenant
POST   /api/v1/auth/customer/otp/send         — send OTP to mobile (SHA-256 stored)
POST   /api/v1/auth/customer/otp/verify       — verify OTP → auto-register if new
GET    /api/v1/auth/customer/social-profile   — customer profile
PATCH  /api/v1/auth/customer/social-profile   — update customer profile
PATCH  /api/v1/auth/users/:id/tenant          — INTERNAL ONLY (X-Internal-Secret header) — set tenant_id + promote role
POST   /api/v1/auth/staff/pin-unlock          — short-lived token (30min, orders:create only) for shared tablets
```

## Registration Flow
1. `POST /register` → JWT issued with `tenant_id: null`, role `pending_onboarding`
2. tenant-service creates tenant → calls `PATCH /users/:id/tenant` with `X-Internal-Secret`
3. identity-service sets `tenant_id`, promotes role to `tenant_owner`
4. Subsequent logins require `{email, password, tenant_id}`

## JWT Strategy
- **Access token:** 15min, Redux memory only (never localStorage)
- **Refresh token:** 30 days, httpOnly cookie, sameSite: strict, secure: true
- **Customer token:** separate secret (`JWT_CUSTOMER_SECRET`)
- **KDS token:** separate secret (`JWT_KDS_SECRET`)
- **Blacklist:** Redis key `blacklist:{token}` with TTL = remaining token life

## Security Rules
- OTP: stored as SHA-256 hash only, 5-min expiry, 5 wrong attempts = invalidated, single-use
- `PATCH /users/:id/tenant` never exposed through Kong — internal only
- Rate limit: 3 OTP requests/min, 5 OTP verifies/min per IP (enforced at Kong)
- `crypto.timingSafeEqual()` for all signature comparisons
- All sensitive fields redacted in Pino logs

## File Structure
```
src/
├── index.ts               — Fastify bootstrap (helmet, cors, rate-limit, swagger)
├── routes/auth.routes.ts  — all route handlers (thin)
├── services/auth.service.ts — business logic
├── repositories/
│   ├── user.repository.ts
│   ├── otp.repository.ts
│   └── token.repository.ts
├── middleware/authenticate.ts — JWT guard (imported from @ulcp/shared)
└── lib/
    ├── jwt.ts             — sign/verify helpers
    ├── prisma.ts          — Prisma client singleton
    ├── redis.ts           — ioredis client
    └── logger.ts          — Pino logger
```

## Environment Variables
```
PORT=3001
DATABASE_URL=postgresql://ulcp_user:ulcp_pass@localhost:5433/ulcp?schema=identity
REDIS_URL=redis://localhost:6380
JWT_SECRET=                    # 32+ chars
JWT_REFRESH_SECRET=            # 32+ chars
JWT_CUSTOMER_SECRET=           # 32+ chars
JWT_KDS_SECRET=                # 32+ chars
INTERNAL_API_SECRET=           # shared with tenant-service
MSG91_API_KEY=                 # for OTP SMS
MSG91_SENDER_ID=
NODE_ENV=development
```

## Dev Commands
```bash
# From services/identity-service/
pnpm dev                        # ts-node-dev hot reload
pnpm build                      # tsc compile to dist/
pnpm db:migrate                 # prisma migrate dev
pnpm db:generate                # regenerate Prisma client
pnpm db:studio                  # open Prisma Studio on browser

# Docker (from repo root)
docker compose -f docker-compose.yml up identity-service
docker compose -f docker-compose.yml logs -f identity-service
```

## Debugging Production Issues
- Check `SecurityLog` table for auth failures
- Redis keys to inspect: `blacklist:*`, `otp:*`, `refresh:*`
- Common issues:
  - 401 "Please provide your tenant_id" → user exists but no tenant assigned yet
  - OTP not arriving → check MSG91 balance / API key in env
  - Token refresh loop → check Redis connectivity, `REDIS_URL` env var
  - KDS setup code expired → 10-min expiry, regenerate via tenant-service

## Coding Conventions
- TypeScript strict, no `any`
- All responses: `{ success: true/false, data?: T, error?: string }`
- Zod validation on every request body before touching DB
- Pino logging only — never `console.log`
- Every Prisma query scoped to `tenant_id` where applicable
- CommonJS modules (`"module": "commonjs"` in tsconfig)

## Before Starting Any Task
1. Read `src/routes/auth.routes.ts` to understand current state
2. Read `AGENT_CONTEXT.md` in this service directory for recent changes
3. Check Prisma schema at `prisma/schema.prisma` for current models
