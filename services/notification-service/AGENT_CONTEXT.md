# notification-service — Agent Context

> This file is the living knowledge base for the notification-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- BullMQ notification queue with 3-retry + exponential backoff (1s/5s/30s)
- Email channel (SendGrid)
- SMS channel (MSG91)
- Push channel (Firebase FCM)
- WhatsApp channel (Interakt)
- Smart channel router: `getChannelsForEvent(event, businessType)` — correct channels per event
- `shouldUseWhatsApp(businessType)` — dine-in types (Types 1-4) do NOT use WhatsApp
- OTP send (SHA-256 stored, 5-min TTL, 5-attempt limit, rate-limited 3/hr per phone)
- OTP verify (hash compare via `crypto.timingSafeEqual`, single-use)
- Redis pub/sub subscriber: handles ORDER_CREATED, ORDER_COMPLETED, PAYMENT_COMPLETED, STOCK_LOW, STOCK_CRITICAL, BID_REQUEST_OPENED, BID_AWARDED, DIRECT_ORDER_CREATED
- DEV_MODE: logs instead of sending (no external API calls in dev)
- Queue status endpoint (waiting/active/completed/failed/delayed counts)

## No Database
Stateless service — Redis only (BullMQ queues, OTP hashes).

## Key Routes
```
POST /api/v1/notify/email          ← X-Internal-Secret
POST /api/v1/notify/sms            ← X-Internal-Secret
POST /api/v1/notify/push           ← X-Internal-Secret
POST /api/v1/notify/whatsapp       ← X-Internal-Secret
POST /api/v1/notify/send           ← X-Internal-Secret, smart router (auto-picks channels)
GET  /api/v1/notify/queue/status   ← X-Internal-Secret, BullMQ stats
POST /api/v1/notify/otp/send       ← rate-limited (3/hr per phone)
POST /api/v1/notify/otp/verify     ← max 5 attempts, timing-safe compare
```

## Channel Rules
```
Dine-in:   socket + in_app only (no WhatsApp)
Delivery:  socket + in_app + whatsapp + sms
Critical:  always + sms (stock critical, payment fail)
Receipts:  always email
Loyalty:   in_app only (no SMS spam)
Flash sale: push + in_app
Back in stock: push + in_app + sms
```

## Known Issues / Gotchas
- DEV_MODE must be `"false"` (string) in production, not just absent from env
- WhatsApp: ALWAYS check `shouldUseWhatsApp(businessType)` before sending — dine-in types skip WhatsApp
- Firebase FIREBASE_PRIVATE_KEY must preserve newlines — use `JSON.parse(process.env.FIREBASE_PRIVATE_KEY)` in production
- Fastify v4 (downgraded from v5 during 2026-04-16 audit)
- Zod v3 (same as other services on Fastify v4)

## Recent Changes
- 2026-03-28: Service fully built (port 3007)
- 2026-04-16: Fastify downgraded v5→v4 (TypeScript audit fix)
- 2026-04-16: Zod downgraded v4→v3 (matches all other services)
- 2026-04-16: pino/pino-pretty versions aligned with other services

## Environment
- Dev port: 3007
- No database (Redis only, **port 6380**)
- DEV_MODE=true in docker-compose.dev.yml (set to false in production)
- Fastify v4, Zod v3

## How to Run Locally
```bash
cd services/notification-service
pnpm dev
# In DEV_MODE=true, all notifications are logged, not sent
# Test OTP (dev returns fixed "123456"):
# curl -X POST http://localhost:3007/api/v1/notify/otp/send \
#   -H "Content-Type: application/json" \
#   -d '{"phone":"9999999999"}'
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up notification-service
docker compose -f docker-compose.dev.yml logs -f notification-service
```

## Dependencies on Other Services
- No HTTP calls out — consumes Redis pub/sub events from all services
- Queues jobs internally via BullMQ (Redis)

## Pending / TODO
- WhatsApp reply webhook (owner replies YES/NO → auto accept/reject order)
- Template management for Interakt (move hardcoded templates to config)
- Delivery notification flow testing end-to-end
- Unit tests for channel routing logic
- E2E tests for OTP flow
