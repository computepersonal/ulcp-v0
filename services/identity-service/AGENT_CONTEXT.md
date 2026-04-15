# identity-service — Agent Context

> This file is the living knowledge base for the identity-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

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
- KDS device registration endpoints (implied from KdsDevice model)
- PIN unlock for shared tablets (POST /staff/pin-unlock)

## Prisma Models (current)
- User, RefreshToken, PlatformCustomer, OtpCode, KdsDevice, SecurityLog

## Known Issues / Gotchas
- None recorded yet

## Recent Changes
- 2026-03-19: Registration redesigned — tenant_id optional, pending_onboarding role
- 2026-03-19: PATCH /auth/users/:id/tenant added — internal only, X-Internal-Secret auth
- 2026-03-26: Helpful error when user exists but no tenant_id given on login

## Environment
- Dev port: 3001
- DB schema: identity
- Docker Redis: port 6380 (not 6379 — local Redis 3.0 on 6379 is incompatible with BullMQ)

## How to Run Locally
```bash
cd services/identity-service
pnpm dev
# Service starts on http://localhost:3001
# Health check: GET http://localhost:3001/health
```

## How to Run Tests
```bash
# No tests written yet — add here when written
```

## How to Deploy
```bash
# Docker build
docker build -t ulcp-identity ./services/identity-service

# Via docker-compose (all services)
docker compose -f docker-compose.dev.yml up identity-service

# Check logs
docker compose -f docker-compose.dev.yml logs -f identity-service
```

## Pending / TODO
- Unit tests for auth.service.ts
- E2E tests for registration + login flow
- Rate limiting tests (OTP endpoints)
