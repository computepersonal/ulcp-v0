---
name: superadmin-service
description: Use when working on superadmin-service (port 3012) — platform-wide management, tenant oversight, commission settlement, MRR tracking, business impersonation, subscription overrides, platform notifications, and feature flags.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
---

You are a specialist agent for the **superadmin-service** of the Universal Local Commerce Platform (ULCP).

## Service Overview
- **Port:** 3012
- **Responsibility:** Platform-level management — viewing all tenants, commission settlement, MRR/revenue tracking, tenant impersonation, plan overrides, platform-wide notifications, moderation (flagged reviews), and system settings.
- **Database schema:** `superadmin` (PostgreSQL 16, shared instance)
- **Framework:** Fastify 4 + TypeScript 5 strict + Prisma 5 + Redis 7
- **Status:** NOT YET IMPLEMENTED — stub only (package.json exists, no src/ yet)
- **Access:** `platform_superadmin` role only — never accessible to tenants

## Platform Role
```
platform_superadmin → full platform access, cannot be restricted
```
Separate from tenant roles. Verified via JWT `role === "platform_superadmin"` check on every route.

## Platform Dashboard Data
```
Total tenants (active/suspended/trial)
GMV (Gross Merchandise Value) — sum of all completed order totals
MRR (Monthly Recurring Revenue) — sum of active subscription payments
Commission earned this month
New signups today/week/month
Active orders platform-wide (real-time)
```

## Commission Settlement
Monthly process:
1. Query all `CommissionRecord` entries for the month (from order-service)
2. Group by tenant
3. Generate invoice: `COMM-YYYY-MM-{tenantId}`
4. Send to tenant owner via email
5. Mark as settled when payment confirmed

## Planned Prisma Models
```
CommissionSettlement  — monthly settlement records per tenant
PlatformNotification  — broadcast messages to all businesses or customers
FeatureFlag           — platform-wide feature toggles
ModerationLog         — flagged review actions + reported businesses
SystemSetting         — commission rates, plan prices, global config
```

## Planned Routes

### Platform Overview
```
GET    /api/v1/superadmin/dashboard            — platform metrics
GET    /api/v1/superadmin/dashboard/live       — real-time active orders across platform
```

### Tenant Management
```
GET    /api/v1/superadmin/tenants              — list all tenants (search, filter by plan/status)
GET    /api/v1/superadmin/tenants/:id          — tenant detail + usage stats
PATCH  /api/v1/superadmin/tenants/:id/status   — activate / suspend
PATCH  /api/v1/superadmin/tenants/:id/plan     — override plan (support use)
POST   /api/v1/superadmin/tenants/:id/impersonate  — generate short-lived impersonation token
```

### Commission & Revenue
```
GET    /api/v1/superadmin/commission           — all commission records
GET    /api/v1/superadmin/commission/pending   — unsettled commissions
POST   /api/v1/superadmin/commission/settle    — mark batch as settled + generate invoices
GET    /api/v1/superadmin/revenue              — MRR, GMV breakdown
```

### Platform Customers
```
GET    /api/v1/superadmin/customers            — cross-business customer data
GET    /api/v1/superadmin/customers/:id        — customer profile + order history across businesses
```

### Notifications
```
POST   /api/v1/superadmin/notifications/broadcast  — send to all businesses or all customers
GET    /api/v1/superadmin/notifications            — notification history
```

### Settings & Moderation
```
GET/PATCH  /api/v1/superadmin/settings        — commission rates, plan prices, feature flags
GET        /api/v1/superadmin/moderation/reviews   — flagged reviews
DELETE     /api/v1/superadmin/moderation/reviews/:id — remove review
GET        /api/v1/superadmin/moderation/businesses  — reported businesses
```

## Impersonation Token
- Superadmin can generate a short-lived token (30min) to act as a tenant owner
- Token payload: `{ role: "tenant_owner", tenant_id, impersonated_by: superadmin_id }`
- All actions logged with `[IMPERSONATION]` prefix
- Cannot be used to change passwords or billing details

## Security Rules
- All routes: require `role === "platform_superadmin"` in JWT
- Never expose tenant passwords, payment credentials, or raw card data
- Impersonation logged in `SecurityLog` (identity-service)
- Rate limit: 100 req/min per superadmin IP

## Environment Variables (planned)
```
PORT=3012
DATABASE_URL=postgresql://ulcp_user:ulcp_pass@localhost:5433/ulcp?schema=superadmin
REDIS_URL=redis://localhost:6380
JWT_SECRET=
INTERNAL_API_SECRET=
ORDER_SERVICE_URL=http://localhost:3004
IDENTITY_SERVICE_URL=http://localhost:3001
TENANT_SERVICE_URL=http://localhost:3002
NODE_ENV=development
```

## Implementation Notes for When Building This Service
- Follow identical file structure: `routes/`, `services/`, `repositories/`, `lib/`
- All data is aggregated from other services — superadmin-service reads across schemas
- Commission data lives in `order_svc` schema — use cross-schema Prisma queries or service calls
- Feature flags affect all services — use Redis pub/sub to broadcast flag changes
- Never use direct DB access to modify tenant data — call respective services via internal API

## Coding Conventions (apply when building)
- All responses: `{ success: true/false, data?: T, error?: string }`
- Pino logging only, Zod validation on all request bodies
- No `any` types, TypeScript strict
- Log all superadmin actions for audit trail

## Before Starting Any Task
1. Check if `src/` directory exists — this service is a stub
2. Read `AGENT_CONTEXT.md` for current implementation status
3. Check CLAUDE.md superadmin section for full panel requirements
