# identity-service — PRD

**Port:** 3001 | **Last reviewed:** 2026-04-27

---

## Overview

The identity-service is the platform-wide authentication and identity authority for ULCP. It manages two completely separate user populations — business staff/owners/partners (email + password) and platform customers (mobile + OTP) — each with their own JWT secrets, token shapes, and auth flows. No other service stores credentials; all auth decisions flow through here. It also manages KDS device registration tokens and a SecurityLog for auditing critical auth events.

---

## Users / Actors

| Actor | Auth method | Token type |
|---|---|---|
| Tenant owner (new) | Email + password | Staff JWT (`pending_onboarding` role until tenant is created) |
| Tenant owner (established) | Email + password + tenant_id | Staff JWT (`tenant_owner` role) |
| Staff member | Email + password + tenant_id | Staff JWT (role + permissions[] from invite) |
| Partner | Email + password + tenant_id | Staff JWT (`is_partner: true`) |
| Platform customer | Mobile + OTP | Customer JWT (separate secret) |
| KDS device | 6-digit setup code exchange | KDS JWT (separate secret, managed by realtime-service) |
| Internal services | `X-Internal-Secret` header | No JWT — shared secret only |
| Superadmin | (not in current scope of this service) | — |

---

## Core Features

1. **Staff registration** — owner registers with email/password/name only; role starts as `pending_onboarding`; `tenant_id` is null until tenant-service creates a tenant and calls the internal PATCH endpoint to promote them.
2. **Staff login** — email + password + optional `tenant_id`; returns access token (15m) and refresh token (30d via httpOnly cookie); multi-tenant support: if a user belongs to multiple tenants, returns HTTP 300 with a tenant picker list.
3. **Token refresh** — accepts refresh token from cookie or request body; rotates both tokens.
4. **Logout** — invalidates all refresh tokens for the user; clears the cookie; does NOT blacklist access tokens (they expire in 15 minutes).
5. **Get current user (`/me`)** — returns full user profile (redacted sensitive fields) for the active staff session.
6. **Customer OTP flow** — send 6-digit OTP to mobile (MSG91 in production, fixed "123456" in dev); verify OTP and auto-register or auto-login customer; returns a platform-scoped customer JWT.
7. **Customer profile** — authenticated customers can view and update their own profile (name, email, birthday, anniversary, dietary preferences).
8. **Social profile** — customers can set a discoverable social profile (bio, interests, looking_for, emoji_avatar, Q&A, show/hide toggle) used by the social/jukebox room feature.
9. **Internal staff creation** — `POST /auth/internal/register-staff` creates a staff user pre-loaded with tenant_id, role, and permissions. Called by tenant-service when an invite is accepted; no tokens issued (staff must log in normally).
10. **Internal user deactivation** — `PATCH /auth/internal/users/:id/deactivate` sets `is_active=false`; called by tenant-service when an owner removes a staff member.
11. **Internal tenant assignment** — `PATCH /auth/users/:id/tenant` promotes a pending_onboarding user to tenant_owner and assigns their tenant_id. Called exclusively by tenant-service after creating a tenant.
12. **Internal role update** — `PATCH /auth/users/:id/role` changes a user's role; used for ownership transfers.
13. **Staff list** — authenticated staff can list all active users for their tenant.
14. **KDS device tokens** — `KdsDevice` model stores 6-digit setup codes and activation state; KDS JWT uses a separate secret (`JWT_KDS_SECRET`). Device activation/management is handled by tenant-service (KdsSetupCode model there), but the JWT secret is owned here.
15. **Security logging** — critical auth events (failed logins, OTP abuse, invalid tokens) written to `SecurityLog` table; superadmin alerting not yet implemented.

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | None | Register new owner or staff with invite |
| POST | `/api/v1/auth/login` | None | Login; returns tokens; HTTP 300 for multi-tenant users |
| POST | `/api/v1/auth/refresh` | None (cookie or body token) | Rotate access + refresh tokens |
| POST | `/api/v1/auth/logout` | Staff JWT | Invalidate all refresh tokens for user |
| GET | `/api/v1/auth/me` | Staff JWT | Get current authenticated user profile |
| GET | `/api/v1/auth/users` | Staff JWT | List all active staff for caller's tenant |
| POST | `/api/v1/auth/customer/otp/send` | None | Send OTP to customer mobile |
| POST | `/api/v1/auth/customer/otp/verify` | None | Verify OTP; auto-register; return customer JWT |
| GET | `/api/v1/auth/customer/me` | Customer JWT | Get own customer profile |
| PATCH | `/api/v1/auth/customer/me` | Customer JWT | Update customer profile |
| GET | `/api/v1/auth/customer/social-profile` | Customer JWT | Get social profile |
| PATCH | `/api/v1/auth/customer/social-profile` | Customer JWT | Update social profile |
| PATCH | `/api/v1/auth/users/:id/tenant` | X-Internal-Secret | [Internal] Assign tenant_id + promote role |
| PATCH | `/api/v1/auth/users/:id/role` | X-Internal-Secret | [Internal] Update user role |
| GET | `/api/v1/auth/users/:id` | X-Internal-Secret | [Internal] Get user by ID (name, email, mobile) |
| POST | `/api/v1/auth/internal/register-staff` | X-Internal-Secret | [Internal] Create staff user with pre-set tenant/role |
| PATCH | `/api/v1/auth/internal/users/:id/deactivate` | X-Internal-Secret | [Internal] Deactivate staff user |

Note: Internal endpoints are never exposed through Kong API gateway — they are service-to-service only.

---

## Data Models

### User
Core staff/owner/partner identity record.
- `id`, `email`, `password_hash`, `name`, `mobile`
- `tenant_id` — null until onboarding completes
- `role` — `pending_onboarding | tenant_owner | branch_manager | cashier | waiter | delivery_staff | inventory_manager | reports_analyst | head_chef | sous_chef | line_cook | bartender | kitchen_helper | platform_superadmin`
- `permissions[]` — granular permission strings (e.g. `orders:manage`, `menu:edit`)
- `branch_id` — optional; scopes staff to a specific branch
- `is_partner` — true for business partners (different from staff)
- `is_active` — soft-delete flag
- `pin_hash` — for shared-tablet PIN unlock flow
- Unique constraint: `(email, tenant_id)` — same email can exist across different tenants

### RefreshToken
Hashed refresh tokens with expiry. Rotated on every use. Cascade-deleted when user is deleted.

### PlatformCustomer
Cross-tenant customer identity. One record per mobile number platform-wide.
- `id`, `mobile` (unique), `name`, `email`, `birthday`, `anniversary`
- `preferences` — JSON: `{ veg_only, allergens[], dietary_notes }`
- `social_profile` — JSON: `{ bio, interests, looking_for, prepared_qa, show_profile, emoji_avatar }`
- `is_active`

### OtpCode
Stores hashed OTPs. Fields: `mobile`, `otp_hash` (SHA-256), `attempts`, `is_used`, `expires_at`. Never stores raw OTP value.

### KdsDevice
Tracks KDS device registration per branch station. Fields: `tenant_id`, `branch_id`, `station` (kitchen|bar), `setup_code` (unique), `setup_code_expires_at`, `is_activated`, `activated_at`.

### SecurityLog
Immutable audit trail for critical auth events. Fields: `user_id`, `event`, `ip`, `user_agent`, `metadata`.

---

## Business Rules

- OTP stored as SHA-256 hash — raw OTP never persisted
- OTP expires in 5 minutes; 5 wrong attempts invalidates it; single-use only
- Access token TTL: 15 minutes; stored in Redux memory only (never localStorage)
- Refresh token TTL: 30 days; httpOnly cookie, `sameSite: strict`, `secure: true` in production
- Customer and KDS tokens use separate JWT secrets from staff tokens
- `pending_onboarding` role has no permissions — cannot access any protected resource until tenant is created
- The `PATCH /users/:id/tenant` endpoint is NEVER exposed through Kong; exclusively service-to-service
- In development, all OTPs are fixed as "123456"
- If a user email exists across multiple tenants, login without `tenant_id` returns HTTP 300 with a tenant list for the UI to show a business picker
- `(email, tenant_id)` unique — PostgreSQL treats NULLs as distinct, so duplicate `pending_onboarding` users are prevented at the application layer in `auth.service.ts`
- Passwords are bcrypt-hashed
- `crypto.timingSafeEqual()` used for all signature/secret comparisons to prevent timing attacks
- Sensitive fields (password_hash, pin_hash) redacted from all Pino log output and API responses

---

## Service Dependencies

| Dependency | Direction | Reason |
|---|---|---|
| tenant-service | Outbound (identity → tenant) | During login: enriches multi-tenant picker list with business names |
| tenant-service | Inbound (tenant → identity) | After tenant creation: calls `PATCH /users/:id/tenant` to promote user; after invite accept: calls `POST /internal/register-staff` |
| loyalty-service | Inbound (loyalty → identity) | Calls internal customer endpoints to read/update customer preferences |
| All services | Inbound (all → identity) | All services use the shared `authenticate.ts` middleware which verifies JWTs signed by this service |
| Redis | Internal | JWT blacklist (`blacklist:{token}`), OTP storage not in Redis (uses PostgreSQL OtpCode model) |

---

## Current Build Status

**Built and working:**
- Full staff registration, login, refresh, logout, /me flow
- Multi-tenant login with HTTP 300 tenant picker
- Customer OTP send/verify (MSG91 stubbed in dev with fixed OTP)
- Customer profile CRUD
- Social profile get/update
- Internal staff registration (`/internal/register-staff`)
- Internal user deactivation
- Internal tenant assignment (`PATCH /users/:id/tenant`)
- Internal role update
- Internal user lookup by ID
- Staff list for tenant
- SecurityLog model (writes exist but superadmin alerting not wired)
- KdsDevice model (schema exists; JWT issuance for KDS assumed to be in realtime-service — not confirmed)

**Stubbed or missing:**
- MSG91 actual SMS integration (dev uses fixed OTP "123456")
- JWT blacklist for access tokens on logout (refresh token is revoked, but access tokens can still be used for up to 15 minutes after logout)
- Rate limiting on OTP endpoints is configured in Kong (`kong.yml`), not in this service itself
- Superadmin alerting on SecurityLog critical events — model exists but no alert dispatch
- Password reset / forgot password flow — not present in routes
- Email verification on registration — not present
- KDS JWT issuance route — KdsDevice model exists here but no route to exchange the setup code for a JWT is visible in this service's routes

---

## Open Questions / Gaps

1. **Password reset flow** — there is no `POST /auth/forgot-password` or `POST /auth/reset-password` route. Is this intended (SMS OTP-based reset?) or a gap?
2. **KDS JWT issuance** — `KdsDevice` model lives in identity-service but no route here exchanges a setup code for a KDS JWT. Is this done in tenant-service or realtime-service? The flow is unclear.
3. **JWT blacklist on logout** — refresh token is invalidated but the 15-minute access token is not blacklisted. For high-security scenarios (stolen token), is this acceptable?
4. **Social profile access control** — any customer with a JWT can call `/customer/social-profile`; there is no visibility check (the `show_profile` flag is on the profile object but is not enforced server-side when other services read the profile).
5. **OTP rate limiting** — the CLAUDE.md says 3/min + 10/hr per IP for OTP requests. This is described as being in Kong. Has it been configured in `kong.yml`? This should be verified.
6. **`pending_onboarding` duplicate prevention** — the comment in schema says duplicates are prevented at the application layer in `auth.service.ts`. This should be confirmed with a test: what happens if a user registers twice before creating a tenant?
7. **Email verification** — there is no email verification step on registration. Is this intentional (trust email, verify at OTP/invite level)?
8. **Admin-initiated password change** — no endpoint exists for an owner to reset a staff member's password.
