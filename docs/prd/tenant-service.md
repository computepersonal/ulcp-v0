# tenant-service — PRD

**Port:** 3002 | **Last reviewed:** 2026-04-27

---

## Overview

The tenant-service is the central registry for every business (tenant) on the ULCP platform. It owns all business configuration: the 6-step onboarding wizard, branch management, floor map (sections and tables), staff invites and profiles, shift scheduling, attendance, leave management, partner (co-owner) system, subscriptions, reservations, QR code generation, KDS setup codes, and a full audit log of all staff actions. When a new tenant is created, this service calls identity-service to promote the registering user to `tenant_owner`. Every other service that needs business configuration (plan, business type, KOT mode, branch details) reads from this service, usually with Redis caching.

---

## Users / Actors

| Actor | Typical interactions |
|---|---|
| Tenant owner | Full control: create tenant, manage all settings, invite partners and staff, view all data |
| Managing partner | Full ops + financial; restricted from billing/subscription by default |
| Silent partner | Read-only financial visibility |
| Operations partner | Ops management, no financial access |
| Branch partner | Access scoped to assigned branches only |
| Branch manager | Manage assigned branch: tables, sections, staff assignments, shifts |
| Staff member (any role) | Read own branch data; shifts; clock in/out |
| Unauthenticated / customer | Read-only public endpoints: tenant by slug, table public info |
| Internal services | Read branches, tenant config, KDS setup codes via X-Internal-Secret |

---

## Core Features

1. **Tenant creation** — creates the business record (name, slug, business type, address, GST settings, etc.) and auto-creates a primary branch. Calls identity-service internally to assign `tenant_id` and promote the user to `tenant_owner`.
2. **Business onboarding wizard** — 6-step server-persisted wizard (step, business_type, profile, catalogue, operations, go-live). Each step validated with Zod. Step ordering enforced (cannot skip steps). Resumable on reload. Completion activates a 30-day Starter trial (one-time per tenant lifetime).
3. **Post-onboarding setup tasks** — server-persisted checklist `setup_tasks` JSON (`catalogue`, `tables`, `staff`, `qr`). Staff POS reads and updates this; completing all 4 tasks was intended to unlock 30-day Starter trial (see open questions).
4. **Branch management** — CRUD for branches; each branch has its own address, coordinates, timezone, thermal printer IP, and delivery radius. First branch is always `is_primary: true`. Branches can be soft-deleted (set `is_active: false`).
5. **Floor map — Sections (zones)** — group tables visually by area (e.g. Rooftop, Indoor, Lakeside) with a hex color. Rename cascade: renaming a zone also renames all tables whose names start with the old zone name (atomic Prisma `$transaction`). Delete unlinks tables but does not delete them.
6. **Floor map — Tables** — CRUD per branch; each table has a QR code (base64 PNG) generated at creation; table status machine (`available → pending_confirmation → occupied → billed → available`); internal `PATCH /:id/status` for order-service to update status without staff JWT.
7. **Table sessions** — tracks who is sitting at a table, pax count, confirmation status, and timestamps. Sessions are opened when a customer scans the QR and closed when bill is paid.
8. **Reservations** — simple reservation model (customer name/phone, date, time slot, pax, optional table assignment, status lifecycle from pending to seated or no-show).
9. **Staff invite flow** — owner invites by email; a unique token is generated and stored in `StaffInvite`; invited person visits the accept URL, provides name + password; tenant-service calls identity-service (`/internal/register-staff`) to create the User record; invite marked accepted.
10. **Staff profile management** — detailed HR profile per staff member: personal details, emergency contacts, employment type, bank details (for payroll), document URL storage, internal notes.
11. **Staff wage management** — wage records per staff (monthly/hourly/daily/per_shift), with effective-from/to date ranges to support wage history.
12. **Shift templates** — named shift templates (Morning Shift, Evening Shift) with start/end time (HH:mm), break minutes, and color for calendar display.
13. **Shift assignments** — schedule staff to shifts on specific dates; status: scheduled, completed, missed, swapped.
14. **Attendance tracking** — clock-in/clock-out records with method (app_pin, gps, manual), auto-computed hours worked, overtime, and late-by minutes. Status: present, absent, half_day, on_leave, holiday.
15. **Leave management** — leave types (with annual quotas and carry-forward rules), leave balances per user per year, leave requests with approval workflow.
16. **Partner system** — business co-owners with role-based permission scopes (revenue, staffManagement, menuEditing, subscriptionBilling, addRemovePartners, etc.) and optional branch scope restrictions.
17. **Subscription management** — subscription records per tenant for plan (free/premium/allinone) and add-ons (social_jukebox, inventory_procurement, customer_crm, advertising). Anti-abuse trial check verifies no duplicate business has used the free trial.
18. **QR code generation** — generates QR codes encoding a URL with `tenant_slug` (and optionally `branch_id` and `table_id`). Stored as base64 data URL on the Table record.
19. **KDS setup codes** — 6-digit time-limited codes (10-minute expiry per CLAUDE.md) generated per branch + station (kitchen/bar) for registering KDS devices.
20. **Audit log** — immutable append-only log of all significant staff actions (table/section/reservation create/update/delete). Records actor name and role snapshot at time of action.
21. **Ownership transfer** — owner can promote a current staff member to `tenant_owner`, demoting themselves to `tenant_admin` (internal role update via identity-service).
22. **Public endpoints** — `GET /tenants/by-slug/:slug` for customer QR scan (returns minimal tenant info + primary branch_id, no auth); `GET /tables/public/:id` for QR scan table validation (returns `can_order` flag based on table + zone active state).

---

## API Endpoints

### Tenants
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/tenants/by-slug/:slug` | None | Public: get tenant by slug for QR scan |
| POST | `/api/v1/tenants` | Staff JWT | Create new tenant |
| GET | `/api/v1/tenants/mine` | Staff JWT | List tenants owned by calling user |
| GET | `/api/v1/tenants/:id` | Staff JWT / Internal | Get tenant by ID |
| PATCH | `/api/v1/tenants/:id` | Staff JWT (owner) | Update tenant settings |
| DELETE | `/api/v1/tenants/:id` | Staff JWT (owner) | Deactivate tenant |
| PATCH | `/api/v1/tenants/:id/plan` | Staff JWT (owner) | Change subscription plan |
| POST | `/api/v1/tenants/:id/transfer-ownership` | Staff JWT (owner) | Transfer ownership to another staff member |
| POST | `/api/v1/tenants/:id/qr` | Staff JWT | Generate QR code for tenant/branch/table |

### Onboarding
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/onboarding/:tenant_id` | Staff JWT | Get current onboarding state |
| POST | `/api/v1/onboarding/:tenant_id/step` | Staff JWT | Save wizard step (validated, ordered) |
| POST | `/api/v1/onboarding/:tenant_id/complete` | Staff JWT | Complete onboarding, activate trial |
| GET | `/api/v1/onboarding/:tenant_id/setup-tasks` | Staff JWT | Get post-onboarding task checklist |
| PATCH | `/api/v1/onboarding/:tenant_id/setup-tasks` | Staff JWT | Mark a setup task done |

### Branches
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/tenants/:tenant_id/branches` | Staff JWT / Internal | List branches |
| POST | `/api/v1/tenants/:tenant_id/branches` | Staff JWT | Create branch |
| PATCH | `/api/v1/tenants/:tenant_id/branches/:id` | Staff JWT | Update branch |
| DELETE | `/api/v1/tenants/:tenant_id/branches/:id` | Staff JWT | Soft-delete branch |

### Sections (Floor Zones)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/tenants/:tenant_id/branches/:branch_id/sections` | Staff JWT | Create section |
| GET | `/api/v1/tenants/:tenant_id/branches/:branch_id/sections` | Staff JWT | List sections |
| PATCH | `/api/v1/tenants/:tenant_id/branches/:branch_id/sections/:id` | Staff JWT | Update section |
| POST | `/api/v1/tenants/:tenant_id/branches/:branch_id/sections/:id/rename` | Staff JWT | Rename section + cascade to table names |
| DELETE | `/api/v1/tenants/:tenant_id/branches/:branch_id/sections/:id` | Staff JWT | Delete section (unlinks tables) |

### Tables
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/tenants/:tenant_id/branches/:branch_id/tables/public/:id` | None | Public: get table info for QR scan |
| POST | `/api/v1/tenants/:tenant_id/branches/:branch_id/tables` | Staff JWT | Create table |
| GET | `/api/v1/tenants/:tenant_id/branches/:branch_id/tables` | Staff JWT | List tables |
| PATCH | `/api/v1/tenants/:tenant_id/branches/:branch_id/tables/:id` | Staff JWT | Update table |
| DELETE | `/api/v1/tenants/:tenant_id/branches/:branch_id/tables/:id` | Staff JWT | Delete table |
| PATCH | `/api/v1/tenants/:tenant_id/branches/:branch_id/tables/:id/status` | X-Internal-Secret | Internal: update table status |

### Staff
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/tenants/:tenant_id/staff` | Staff JWT | List staff invites |
| POST | `/api/v1/tenants/:tenant_id/staff/invite` | Staff JWT | Invite a staff member by email |
| DELETE | `/api/v1/tenants/:tenant_id/staff/:invite_id` | Staff JWT | Revoke staff invite |
| GET | `/api/v1/tenants/:tenant_id/staff/validate-invite/:token` | None | Validate an invite token |
| POST | `/api/v1/tenants/:tenant_id/staff/accept` | None | Accept invite and create account |

### Staff Profiles
Routes under `/api/v1/tenants/:tenant_id/staff-profiles/` — CRUD for detailed HR profile per staff user.

### Staff HR (Wages, Shifts, Attendance, Leave)
Routes under `/api/v1/tenants/:tenant_id/hr/` — wages CRUD, shift templates CRUD, shift assignments CRUD, attendance upsert + summary, leave types/balances/requests with approval workflow.

### Partners
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/tenants/:tenant_id/partners` | Staff JWT | List partners |
| POST | `/api/v1/tenants/:tenant_id/partners/invite` | Staff JWT (owner) | Invite a partner |
| POST | `/api/v1/tenants/:tenant_id/partners/accept` | None | Accept partner invite |
| PATCH | `/api/v1/tenants/:tenant_id/partners/:id/permissions` | Staff JWT | Update partner permissions |

### Subscriptions
Routes under `/api/v1/tenants/:tenant_id/subscriptions/` — get current plan, start trial, activate/cancel plan or add-ons.

### Reservations
Routes under `/api/v1/tenants/:tenant_id/branches/:branch_id/reservations/` — CRUD for table reservations.

### KDS Setup Codes
Routes under `/api/v1/tenants/:tenant_id/kds/` — generate setup codes, list, activate KDS device.

### Audit Log
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/tenants/:tenant_id/audit-log` | Staff JWT | Paginated audit log with entity type and date filters |

---

## Data Models

### Tenant
The business record. Key fields:
- `id`, `name`, `slug` (unique), `business_type`, `plan`, `active_addons[]`
- `country`, `currency`, `timezone`
- `gst_registered`, `gstin`, `gst_state_code`, `gst_default_rate`
- `logo_url`, `cover_url`, `address`, `city`, `state`, `pincode`, `phone`, `email`, `website`
- `owner_user_id` — cross-service reference to identity-service User.id (no DB FK)
- `kot_ack_mode` (auto|kds|printer), `kot_ack_delay_secs`
- `dine_in_billing_mode` (pay_later|pay_now)
- `onboarding_step`, `onboarding_completed`, `setup_tasks` (JSONB checklist)
- `is_chain`, `chain_config` (JSONB)
- `free_trial_used`, `trial_ends_at`

### Branch
- `tenant_id`, `name`, `address`, `phone`, `lat`, `lng`, `timezone`
- `is_primary` — one primary branch per tenant
- `printer_ip` — for thermal printer TCP connection
- `delivery_radius_km`

### Section (Floor Zone)
- `tenant_id`, `branch_id`, `name`, `color` (hex), `position`, `is_active`

### Table
- `tenant_id`, `branch_id`, `section_id` (nullable), `name`, `capacity`, `qr_code`, `position`
- `status`: available | pending_confirmation | occupied | billed
- `is_active`

### TableSession
- Tracks a dining session per table: `customer_id`, `customer_phone`, `customer_name`, `pax`
- `status`: pending_confirmation | open | billed | closed
- `confirmed_at`, `confirmed_by`, `opened_at`, `closed_at`

### Reservation
- `customer_name`, `customer_phone`, `customer_email`, `pax`, `date` (YYYY-MM-DD), `time_slot` (HH:MM)
- `status`: pending | confirmed | seated | cancelled | no_show
- Optional `table_id` assignment

### Partner
- `user_id`, `role`, `permissions` (JSONB), `assigned_branches[]`
- `invite_token`, `invite_expires_at`, `accepted_at`, `is_active`

### StaffInvite
- `email`, `role`, `permissions[]`, `invite_token` (unique), `expires_at`, `accepted_at`

### StaffProfile
Detailed HR record: personal info, emergency contacts, employment type, bank details (account no, IFSC, PAN, Aadhaar last 4), document URLs.

### StaffWage
Wage history per staff: `wage_type` (monthly/hourly/daily/per_shift), `amount` (integer paise), `effective_from`, `effective_to`.

### ShiftTemplate / ShiftAssignment / Attendance / LeaveType / LeaveBalance / LeaveRequest
Full HR stack. Attendance tracks clock-in method (app_pin, gps, manual) and computes overtime/late minutes. Leave requests have an approval workflow (pending → approved/rejected/cancelled).

### Subscription
- `plan` (free/premium/allinone), `type` (plan|addon), `addon_id`, `amount` (paise/month)
- `razorpay_subscription_id` for recurring billing integration

### AuditLog
Immutable. Captures: `actor_id`, `actor_name`, `actor_role` (snapshot), `action`, `entity_type`, `entity_id`, `entity_name`, `metadata` (before/after JSON).

### KdsSetupCode
6-digit code with 10-minute expiry, per branch + station.

---

## Business Rules

- Tenant slug is unique across the platform and auto-generated from the business name (editable before confirm)
- One primary branch (`is_primary: true`) is always created when a tenant is created
- Onboarding wizard has 6 steps; steps must be saved in order (cannot jump ahead); completion is idempotent
- Free trial is one-time per tenant lifetime; anti-abuse check matches (phone + email) OR (name + address) against existing tenants that already used a trial
- `trial_ends_at` = 1 month from signup when trial is activated
- Plans: free (₹0), premium (₹999/mo), allinone (₹2499/mo); commission: 3%, 2%, 1.5%
- Add-ons purchasable on top of any plan: social_jukebox, inventory_procurement, customer_crm, advertising
- `kot_ack_mode` defaults to "auto" on free plan, "kds" on premium+
- Table.qr_code has no `@unique` DB constraint (base64 exceeds PostgreSQL btree 2704-byte limit); uniqueness is inherent since QR encodes the unique table ID
- Section rename cascades to table names in a single DB transaction
- Deleting a section sets `section_id = null` on all its tables (does not delete the tables)
- Staff invite token expires (24hr per CLAUDE.md — exact duration set in `staff.service.ts`)
- Partner invite has its own token and expiry
- Ownership transfer requires the new owner to already be an existing staff member of the tenant

---

## Service Dependencies

| Service | Direction | Reason |
|---|---|---|
| identity-service | Outbound (tenant → identity) | After tenant creation: `PATCH /users/:id/tenant`; After invite accept: `POST /internal/register-staff`; Staff deactivation: `PATCH /internal/users/:id/deactivate`; Ownership transfer: `PATCH /users/:id/role` |
| order-service | Inbound (order → tenant) | Fetches KOT ack config + plan info via `/api/v1/tenants/:id` (cached 30min Redis) |
| catalogue-service | Inbound (catalogue → tenant) | Fetches primary branch ID; checks onboarding completion before serving public catalogue |
| delivery-service | Inbound (delivery → tenant) | Fetches branch delivery radius and coordinates |
| All services | Inbound | Any service needing tenant config reads from this service |
| Redis | Internal | 30-minute TTL cache for tenant config; consumed by other services |

---

## Current Build Status

**Built and working:**
- Full tenant CRUD including slug generation
- 6-step onboarding wizard with server-side state persistence and step ordering enforcement
- Post-onboarding setup tasks (JSONB on Tenant, API to read and mark done)
- Branch CRUD
- Section (zone) CRUD including rename cascade transaction
- Table CRUD with QR code generation, status machine, and internal status update endpoint
- Table sessions model (exists, used by order-service)
- Reservations CRUD
- Staff invite flow (invite, validate token, accept + calls identity-service)
- Staff profile CRUD
- Staff wages, shift templates, shift assignments
- Attendance upsert and summary
- Leave types, balances, and request approval workflow
- Partner invite, accept, permissions update
- Subscription model + trial activation + anti-abuse check
- KDS setup code generation and activation
- Audit log (write on section/table/zone create/update/delete events)
- Ownership transfer
- QR code generation endpoint

**Stubbed or missing:**
- Chain/franchise configuration (`is_chain`, `chain_config` fields exist but no chain-specific logic or `getCatalogueForBranch()` override system is in this service)
- Franchise chain dashboard (consolidated reporting) — not built
- WaiterTipTally model — mentioned in CLAUDE.md but not in schema
- Shift end auto-release cron job — mentioned in CLAUDE.md but not confirmed in routes/services
- Partner scope middleware (`partnerScope`) — described in CLAUDE.md but not confirmed implemented in routes
- `GET /tenants/:id` returns tenant for both owner AND staff of that tenant — but the list endpoint (`/mine`) only returns tenants owned by the caller, not tenants where the caller is staff

---

## Open Questions / Gaps

1. **Plan naming mismatch** — CLAUDE.md describes plans as `free / starter / pro` with prices ₹0/₹999/₹2499. The schema and `subscription.routes.ts` use `free / premium / allinone`. Which is canonical? The PLAN_PRICES constant in shared may have the answer.
2. **Setup tasks and trial reward** — CLAUDE.md says completing 7 setup tasks earns a 30-day Starter trial. The current schema has only 4 tasks (catalogue, tables, staff, qr) and the trial is activated on onboarding completion, not task completion. Which is the intended design?
3. **Staff invite expiry** — CLAUDE.md says 48-hour invite expiry for staff. The code sets `expires_at` in `staff.service.ts` — this should be verified matches the stated 48-hour window.
4. **Partner scope middleware** — CLAUDE.md describes a `partnerScope` middleware that filters all data by partner permissions. It is not visible in the route files. Has it been implemented in a shared middleware?
5. **WaiterTipTally** — mentioned in CLAUDE.md as a future model. Not in schema. When should this be built?
6. **Staff list gap** — `GET /auth/users` in identity-service lists staff by `tenant_id`. There is no matching endpoint in tenant-service to list staff by tenant. These may need reconciliation.
7. **Table session lifecycle** — TableSession is created/managed here but order-service also references `session_id` on orders. Is the session created here or by order-service? Who closes the session?
8. **Franchise / chain** — `is_chain` and `chain_config` fields exist on Tenant but the described `getCatalogueForBranch()` override logic and consolidated chain dashboard are not built. Is this Phase 15 work?
9. **Subscription Razorpay integration** — `razorpay_subscription_id` field exists but no webhook handler for Razorpay subscription events (payment success, cancellation) is visible.
