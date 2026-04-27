# notification-service — PRD

## Overview

The notification-service (port 3007) is a fire-and-forget messaging hub that decouples communication from the core order and inventory flows. It receives notification jobs either via direct HTTP (internal callers) or by subscribing to Redis Pub/Sub events, then routes each job to the correct channel (email, SMS, push, WhatsApp) through a BullMQ queue. Delivery is asynchronous and non-blocking — no other service waits for a notification to succeed before continuing its own flow. The service also owns the OTP generation and verification lifecycle for customer phone authentication.

---

## Users / Actors

| Actor | Interaction |
|---|---|
| order-service | Indirectly — publishes `ORDER_CREATED`, `ORDER_COMPLETED`, `PAYMENT_COMPLETED` Redis events that this service reacts to |
| inventory-service | Publishes `STOCK_LOW`, `STOCK_CRITICAL` Redis events that trigger owner push/SMS alerts |
| procurement-service | Publishes `BID_REQUEST_OPENED`, `BID_AWARDED`, `DIRECT_ORDER_CREATED` events that trigger vendor email/WhatsApp |
| identity-service | Calls `/api/v1/notify/otp/send` and `/api/v1/notify/otp/verify` for customer phone auth |
| Any internal service | Can call `/api/v1/notify/email`, `/api/v1/notify/sms`, `/api/v1/notify/push`, `/api/v1/notify/whatsapp`, or `/api/v1/notify/send` directly with `X-Internal-Secret` |
| Customers | Recipients of order confirmations, payment receipts, OTP codes, and stock-back alerts |
| Tenant owner / staff | Recipients of new-order alerts, stock alerts, bid notifications |
| Vendors (procurement) | Recipients of bid request emails/WhatsApp and bid award emails |
| Operations / DevOps | `/api/v1/notify/queue/status` for BullMQ queue health monitoring |

---

## Core Features

1. **Four delivery channels** — Email (SendGrid), SMS (MSG91), push notification (Firebase FCM), and WhatsApp (Interakt). Each has its own channel module.
2. **BullMQ job queue** — All notifications are enqueued before sending. The worker processes jobs asynchronously with retry and backoff (configuration details not yet visible in code — see Open Questions).
3. **Smart router (`/notify/send`)** — A single endpoint accepts an event name and business type, then uses `getChannelsForEvent()` to determine which channels to use. Callers do not need to know the routing logic.
4. **Business-type-aware WhatsApp gating** — `shouldUseWhatsApp(businessType)` gates WhatsApp on applicable business types only. Dine-in types never receive WhatsApp messages.
5. **OTP send and verify** — Cryptographically secure 6-digit OTP (via `crypto.randomBytes`), stored as a SHA-256 hash in Redis with a 5-minute TTL. Rate-limited to 3 sends per phone per hour. Verifies with constant-time comparison (`crypto.timingSafeEqual`) to prevent timing attacks. One-time use — deleted on successful verification. Max 5 verification attempts before invalidation.
6. **Redis event subscription** — Subscribes to 8 platform event channels and automatically queues the correct notifications without manual intervention from source services.
7. **Queue status monitoring** — Exposes waiting, active, completed, failed, and delayed job counts from BullMQ for ops visibility.
8. **Dev mode** — When `DEV_MODE=true` or provider API keys are absent, all channel sends log to Pino instead of hitting external APIs. OTP is also logged in dev mode.
9. **Per-channel direct endpoints** — Any internal service can bypass the smart router and call a specific channel directly (email/sms/push/whatsapp) with full control over template and recipient.

---

## API Endpoints

All routes require the `X-Internal-Secret` header — this service is not exposed to the public internet through Kong.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Service health check |
| POST | `/api/v1/notify/email` | `X-Internal-Secret` | Queue an email job |
| POST | `/api/v1/notify/sms` | `X-Internal-Secret` | Queue an SMS job |
| POST | `/api/v1/notify/push` | `X-Internal-Secret` | Queue a push notification job |
| POST | `/api/v1/notify/whatsapp` | `X-Internal-Secret` | Queue a WhatsApp message job |
| POST | `/api/v1/notify/send` | `X-Internal-Secret` | Smart router — determines channels from event + business type, queues all applicable jobs |
| GET | `/api/v1/notify/queue/status` | `X-Internal-Secret` | BullMQ queue health metrics |
| POST | `/api/v1/notify/otp/send` | `X-Internal-Secret` | Generate and send a 6-digit OTP to a phone number |
| POST | `/api/v1/notify/otp/verify` | `X-Internal-Secret` | Verify a submitted OTP |

### Request Shapes (key fields)

**`POST /notify/email`**: `{ to: email, subject?, template: string, data?: object, tenant_id? }`

**`POST /notify/send`**: `{ event: string, business_type: string, recipients: { email?, phone?, push_token? }, subject?, template: string, data?: object, tenant_id? }`

**`POST /notify/otp/send`**: `{ phone: string, tenant_id: string }`

**`POST /notify/otp/verify`**: `{ phone: string, otp: string (6 digits), tenant_id: string }`

---

## Data Models

The notification-service has **no Prisma schema and no database**. All state is ephemeral:

- **BullMQ jobs** — stored in Redis by BullMQ. Each job carries `{ type, to, subject?, template, data, tenant_id? }`.
- **OTP hash** — Redis key `otp:{phone}:{tenant_id}`, value = SHA-256 hash, TTL = 300 seconds.
- **OTP attempt counter** — Redis key `otp:attempts:{phone}:{tenant_id}`, TTL = 300 seconds.
- **OTP rate limit counter** — Redis key `otp:ratelimit:{phone}`, TTL = 3600 seconds (1 hour).

No notification history is persisted anywhere.

---

## Business Rules

### Channel Routing (from `router.service.ts`)

| Event | Channels (no WhatsApp BT) | Channels (WhatsApp-eligible BT) |
|---|---|---|
| `dine_in_order` | push | push |
| `delivery_order` | push, sms | push, sms, whatsapp |
| `critical` | push, sms, email | push, sms, email, whatsapp |
| `order_receipt` | email | email |
| `otp` | sms | sms |
| `bid_request` | email | email, whatsapp |
| `bid_awarded` | email | email |
| `bid_rejected` | email | email |
| `low_stock` | push | push |
| `stock_critical` | push, sms | push, sms |
| `back_in_stock` | push, sms | push, sms |
| (default) | push | push |

### WhatsApp-Eligible Business Types
`home_kitchen`, `cloud_kitchen`, `food_truck`, `gated_community`, `catering`, `kirana`, `boutique`, `nursery`, `pharmacy`, `handicrafts`, `bakery`, `stationery`

### WhatsApp-Excluded Business Types (dine-in)
`self_service_cafe`, `seated_food_only`, `seated_full_service`, `seated_self_order`

### OTP Security Rules
- 6-digit OTP, cryptographically generated (`crypto.randomBytes`)
- Stored as SHA-256 hash — plaintext never persisted
- 5-minute expiry (300 seconds)
- Max 3 send requests per phone per hour (rate limit key TTL = 1 hour)
- Max 5 verification attempts before OTP is invalidated
- Constant-time comparison prevents timing attacks
- One-time use: deleted immediately on successful verification
- OTP is scoped to `phone + tenant_id` — the same phone number can have distinct OTPs at different tenants simultaneously

### Redis Events Consumed (auto-queue behavior)

| Event | Triggered action |
|---|---|
| `ORDER_CREATED` | Push/SMS/WhatsApp to owner (if `owner_phone` present) for delivery orders |
| `ORDER_COMPLETED` | Email receipt to customer (if `customer_email` present) |
| `PAYMENT_COMPLETED` | Email + SMS receipt to customer |
| `STOCK_LOW` | Push to owner |
| `STOCK_CRITICAL` | Push + SMS to owner |
| `BID_REQUEST_OPENED` | Email to vendor + WhatsApp (if applicable) |
| `BID_AWARDED` | Email to vendor |
| `DIRECT_ORDER_CREATED` | Email + WhatsApp (if applicable) to vendor |

---

## Service Dependencies

| Dependency | Direction | Reason |
|---|---|---|
| Redis | Core infrastructure | BullMQ job queue, OTP storage, event subscription |
| SendGrid | External API | Email delivery (production) |
| MSG91 | External API | SMS delivery (production) |
| Firebase FCM | External API | Push notification delivery (production) |
| Interakt | External API | WhatsApp message delivery (production) |
| order-service | Event consumer | Reacts to ORDER_CREATED, ORDER_COMPLETED, PAYMENT_COMPLETED |
| inventory-service | Event consumer | Reacts to STOCK_LOW, STOCK_CRITICAL |
| procurement-service | Event consumer | Reacts to BID_REQUEST_OPENED, BID_AWARDED, DIRECT_ORDER_CREATED |
| identity-service | Inbound caller | Calls /otp/send and /otp/verify for customer authentication |
| PostgreSQL | None | This service has no database |

---

## Current Build Status

**Core infrastructure: fully implemented.**
- Fastify server with helmet, CORS, Swagger docs
- BullMQ queue + worker setup
- Redis connection and pub/sub subscriber
- All 4 channel modules (email, SMS, push, WhatsApp)
- Smart router (`getChannelsForEvent()`) with business-type gating
- All 9 HTTP endpoints with Zod validation and internal-secret guard
- OTP generate/send/verify with full security controls
- Event subscriber handling 8 Redis channels
- Dev mode (logs instead of sending)
- Graceful shutdown

**Stubbed or incomplete:**
- **No external API calls are live in production.** All provider integrations (SendGrid, MSG91, FCM, Interakt) are commented out in the channel modules. The code logs to Pino instead. This needs to be wired up before any real notifications are sent.
- **Template system is primitive** — templates are raw strings with `{{variable}}` interpolation. There is no template registry, no HTML email support, no WhatsApp template management (WhatsApp Business API requires pre-approved templates with specific parameter formats).
- **No WhatsApp reply webhook** — The CLAUDE.md specifies that owner replies of YES/NO via WhatsApp should auto-accept/reject orders. This endpoint does not exist.
- **`KOT_STATUS_CHANGED` not subscribed** — The CLAUDE.md specifies waiter notifications when a KOT is ready, but this event is not in the subscriber's channel list.
- **No notification history** — There is no log of sent notifications. Failed jobs exist in BullMQ's failed queue but are not surfaced in any UI.
- **BullMQ retry config not visible** — The CLAUDE.md states 3 retries with exponential backoff, but the queue/worker configuration file was not inspected. This should be verified.
- **`in_app` channel** not implemented — The CLAUDE.md channel rules reference `in_app` as a channel type, but it does not appear in the router or the channel enum. In-app notifications appear to be handled via Socket.io in the realtime-service instead.
- **Loyalty notifications** — The CLAUDE.md specifies `in_app only (no SMS spam)` for loyalty events. This routing rule is not present in `router.service.ts`.
- **Flash sale / back-in-stock push** — `back_in_stock` routes to push+sms in the router, but the CLAUDE.md says flash sale notifications should go to push+in_app. No `flash_sale` event type exists in the router.

---

## Open Questions / Gaps

1. **Provider activation**: Which external APIs need to be live for the beta launch? What are the template registration requirements for WhatsApp/Interakt and SMS/MSG91?
2. **WhatsApp reply webhook**: The YES/NO auto-accept/reject flow from owner WhatsApp replies is documented but not built. What is the priority?
3. **Template management**: Should templates be hardcoded in the service, stored in a database, or managed via the Interakt/SendGrid template system?
4. **HTML email**: Are email notifications plain text, or do they need HTML rendering (e.g. branded order receipts)? Puppeteer is listed in the stack for PDF — is it also used for email?
5. **BullMQ retry configuration**: Confirm the retry count (3x) and backoff strategy are correctly configured in the queue lib file.
6. **Notification history**: Should the platform store a log of notifications sent (for debugging, audit, or compliance)? If so, where — Postgres or a time-series store?
7. **`in_app` channel**: Is in-app notification handled by this service enqueuing an event for realtime-service, or does realtime-service handle it independently? The current code does not route anything to an `in_app` channel.
8. **OTP for staff vs. customers**: The OTP service is scoped by `tenant_id`. Does staff login also use this OTP service, or only customer login?
9. **Interakt template registration**: WhatsApp Business API requires pre-approved templates by name. How are template names managed and kept in sync between the code and Interakt's dashboard?
10. **Multi-language notifications**: Are notifications expected to support localization (e.g. regional languages for Indian tenants)?
11. **Push token management**: Push notifications use `push_token` or `phone` as the recipient `to` field. How are FCM device tokens collected, stored, and invalidated? This service doesn't own that data.
