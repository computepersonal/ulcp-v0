# identity-service — Domain Context

> Platform-wide conventions, tech stack, and coding rules are in the **root CLAUDE.md**.
> This file contains identity-service-specific domain knowledge only.

---

## TWO USER SYSTEMS

### System 1 — Platform Customers

Login: mobile + OTP (no password ever)
JWT: customerId only (platform-wide)
Scope: cross-business — one profile, shop anywhere
Auto-register on first OTP verify (name optional)

### System 2 — Business Staff + Partners

Login: email + password
JWT: user_id + tenant_id (nullable) + role + permissions[]
Scope: locked to one tenant
Partners use same system (is_partner: true flag)

### Registration Flow — tenant_id is ALWAYS system-generated, never typed by user

**Owner (new business):**
1. `POST /api/v1/auth/register` — `{email, password, name}` only
   → JWT issued with `tenant_id: null`, `role: "pending_onboarding"`
2. `POST /api/v1/tenants` — creates tenant record
   → tenant-service internally calls identity-service `PATCH /users/:id/tenant`
   → sets `tenant_id`, promotes role to `tenant_owner` automatically
3. All subsequent logins: `{email, password, tenant_id}` (tenant_id now known)

**Staff (invited):**
- `POST /tenants/:id/staff/invite` — sends invite with a secure token
- Invited person registers/logs in using the invite token
- `tenant_id` comes from the invite record, never from manual input

**Customers:**
- `tenant_id` comes from QR code context (URL param), never typed

### Internal Service Security

`PATCH /api/v1/auth/users/:id/tenant` (identity-service):
- Secured by `X-Internal-Secret` header (shared env var: `INTERNAL_API_SECRET`)
- Never exposed through Kong API gateway — internal service-to-service only
- Called by tenant-service after creating a tenant

---

## THREE-LAYER RBAC

### Layer 1: Platform Roles

```
platform_superadmin → full platform
tenant_owner        → full tenant, cannot be restricted
```

### Layer 2: Preset Roles

```
UNIVERSAL: branch_manager, cashier, waiter, delivery_staff,
           inventory_manager, reports_analyst

KITCHEN (Types 2,3,4,7 only):
  head_chef      → KDS + assign duties + menu:edit + inventory
  sous_chef      → KDS + assign duties (when head chef absent)
  line_cook      → KDS view + mark items ready
  bartender      → bar KDS only (Type 3)
  kitchen_helper → KDS view only
```

### Layer 3: Granular Permissions

```
menu:view, menu:edit, menu:publish
orders:view, orders:manage, orders:refund, orders:discount
billing:view, billing:manage, billing:refund
reports:view, reports:download, revenue:view
inventory:view, inventory:manage, inventory:purchase
staff:view, staff:manage, staff:permissions
tables:view, tables:manage, tables:confirm
customers:view, customers:export
delivery:view, delivery:manage, delivery:settings
kds:view, kds:manage, kitchen:assign, kitchen:schedule
branch:settings, branch:manage, shifts:view, shifts:manage
```

Head chef: has menu:edit but NOT menu:publish (cannot permanently delete).
Branch managers can only set permissions within their own branch.

---

## CUSTOMER ONBOARDING

Browse without login (zero friction).
OTP only triggered on "Add to Cart".
Auto-register on first OTP verify (name optional).
Returning customer: auto-recognized via localStorage token.
PWA install prompt after 2nd visit.
Splash: 0.5s branded loading → immediate catalogue.

---

## SECURITY RULES

OTP: stored as SHA-256 hash only, 5-min expiry, 5 wrong attempts = invalidated, single-use.
`PATCH /users/:id/tenant` never exposed through Kong — internal only.
Rate limits (Kong): OTP request 3/min + 10/hr per IP, OTP verify 5/min per IP, payment 10/min per IP.
`crypto.timingSafeEqual()` for all signature comparisons.
All sensitive fields redacted in Pino logs.

JWT:
- Access token: 15min, Redux memory only (never localStorage)
- Refresh token: 30 days, httpOnly cookie, sameSite: strict, secure: true
- Customer token: separate secret (`JWT_CUSTOMER_SECRET`)
- KDS token: separate secret (`JWT_KDS_SECRET`)
- Blacklist: Redis key `blacklist:{token}` with TTL = remaining token life

Infrastructure:
- PostgreSQL + Redis: internal Docker network only
- All external: HTTPS via Cloudflare
- Sensitive fields: [REDACTED] in all logs
- SecurityLog table: critical events → superadmin alert
