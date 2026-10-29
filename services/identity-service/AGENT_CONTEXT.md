# identity-service — Agent Context

> This file is the living knowledge base for the identity-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- Staff registration (POST /register) — issues JWT with tenant_id: null, role: pending_onboarding
- Staff login (POST /login) — email + password + tenant_id, helpful error when tenant_id missing
- Token refresh (POST /refresh) — httpOnly cookie, Redis-backed
- Logout (POST /logout) — blacklists token in Redis
- Current user (GET /me)
- List staff for tenant (GET /users)
- Customer OTP send/verify — auto-register on first verify
- Customer social profile get/update
- Internal PATCH /users/:id/tenant — X-Internal-Secret, assigns tenant_id + promotes role
- Internal POST /internal/register-staff — X-Internal-Secret, creates staff with tenant_id + role + permissions pre-set; returns user (no tokens); 409 on duplicate email+tenant_id
- Internal PATCH /internal/users/:id/deactivate — X-Internal-Secret, sets is_active=false
- KDS device registration endpoints
- PIN unlock for shared tablets (POST /staff/pin-unlock)

## Prisma Models (current)
- User, RefreshToken, PlatformCustomer, OtpCode, KdsDevice, SecurityLog

## JWT Payload (staff)
```typescript
{ user_id, tenant_id, role, permissions: string[], name, email }
```
`permissions[]` is populated from the user's role + any custom grants — flows into Redux `authSlice` on login.

## Known Issues / Gotchas
- Redis default port is **6380** (not 6379) — Docker Redis runs on 6380 to avoid conflict with local Redis 3.0
- OTP in dev mode: fixed `"123456"` for easy testing — logged via Pino (not console.log)
- tenant_id is NEVER typed by user — always system-generated via tenant-service → PATCH /users/:id/tenant

## Recent Changes
- 2026-03-19: Registration redesigned — tenant_id optional, pending_onboarding role
- 2026-03-19: PATCH /auth/users/:id/tenant added — internal only, X-Internal-Secret auth
- 2026-03-26: Helpful error when user exists but no tenant_id given on login
- 2026-04-08: permissions[] included in login response and JWT payload
- 2026-04-16: console.log replaced with logger.info (Pino) for dev OTP logging
- 2026-04-16: Redis default fallback port corrected to 6380
- 2026-04-23: POST /internal/register-staff added — tenant-service calls this when processing staff invites
- 2026-04-23: PATCH /internal/users/:id/deactivate added — tenant-service calls this when owner deactivates staff
- 2026-04-23: deactivateUser() added to user.repository.ts

## Environment
- Dev port: 3001
- DB schema: identity
- Docker Redis: **port 6380** (not 6379 — local Redis 3.0 on 6379 is incompatible with BullMQ)

## How to Run Locally
```bash
cd services/identity-service
pnpm dev
# Service starts on http://localhost:3001
# Health check: GET http://localhost:3001/health
# Swagger: http://localhost:3001/docs
```

## How to Deploy
```bash
docker compose -f docker-compose.yml up identity-service
docker compose -f docker-compose.yml logs -f identity-service
```

## Dependencies on Other Services
- None at runtime — identity-service is called by others, not the reverse
- tenant-service calls `PATCH /api/v1/auth/users/:id/tenant` (internal, X-Internal-Secret)

## Pending / TODO
- Unit tests for auth.service.ts
- E2E tests for registration + login flow
- Rate limiting tests (OTP endpoints)
