# notification-service — Agent Context

> This file is the living knowledge base for the notification-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- BullMQ notification queue with 3-retry + exponential backoff
- Email channel (SendGrid)
- SMS channel (MSG91)
- Push channel (Firebase FCM)
- WhatsApp channel (Interakt)
- Smart channel router (routes by business type + notification type)
- OTP send (SHA-256 stored, 5-min TTL, 5-attempt limit)
- OTP verify (hash compare, single-use)
- Redis pub/sub subscriber for platform events
- DEV_MODE: logs instead of sending (no external API calls in dev)
- Queue status endpoint

## No Database
Stateless service — Redis only for BullMQ queues and OTP storage.

## Known Issues / Gotchas
- DEV_MODE must be set to "false" (string) in production, not just absent
- WhatsApp: check shouldUseWhatsApp(businessType) before queuing — dine-in types do NOT use WhatsApp
- Firebase credentials: FIREBASE_PRIVATE_KEY must preserve newlines (use JSON.parse workaround in production)

## Recent Changes
- 2026-03-28: Service fully built (port 3007)
- All four channels implemented
- DEV_MODE logging fallback working

## Environment
- Dev port: 3007
- No database (Redis only)
- DEV_MODE=true in docker-compose.dev.yml

## How to Run Locally
```bash
cd services/notification-service
pnpm dev
# In DEV_MODE=true, all notifications are logged, not sent
# Check logs: docker compose -f docker-compose.dev.yml logs -f notification-service
```

## How to Test Channels in Dev
```bash
# Test email queue
curl -X POST http://localhost:3007/api/v1/notify/email \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: dev_internal_secret_ulcp_services" \
  -d '{"to":"test@example.com","subject":"Test","body":"Hello"}'

# Test OTP
curl -X POST http://localhost:3007/api/v1/notify/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"9999999999"}'
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up notification-service
docker compose -f docker-compose.dev.yml logs -f notification-service
```

## Pending / TODO
- WhatsApp reply webhook (owner replies YES/NO → auto accept/reject order)
- Template management for Interakt
- Delivery notification flow testing end-to-end
- Unit tests for channel routing logic
- E2E tests for OTP flow
