# notification-service — Domain Context

> Platform-wide conventions, tech stack, and coding rules are in the **root CLAUDE.md**.
> This file contains notification-service-specific domain knowledge only.

---

## NOTIFICATION SYSTEM

BullMQ queue (Redis) — fire-and-forget, 3 retries, exponential backoff.
Never blocks order flow.

### Channel Rules

```
Dine-in:        socket + in_app only
Delivery:       socket + in_app + whatsapp + sms
Critical:       always + sms (stock critical, payment fail)
Receipts:       always email
Loyalty:        in_app only (no SMS spam)
Flash sale:     push + in_app
Back in stock:  push + in_app + sms
```

### Providers

- SMS: MSG91
- WhatsApp: Interakt (₹2,399/mo)
- Push: Firebase FCM
- Email: SendGrid

---

## WHATSAPP INTEGRATION

**NOT for:** self_service_cafe, seated_food_only, seated_full_service, seated_self_order

**FOR:** home_kitchen, cloud_kitchen, food_truck, gated_community, catering,
kirana, boutique, nursery, pharmacy, handicrafts, bakery, stationery

`shouldUseWhatsApp(businessType)` checked before every notification send.

### Templates

- order confirmation
- status updates (accepted, preparing, out for delivery, delivered)
- new order alert (owner)
- monthly invoice
- OTP
- low stock alert

### Owner Reply Webhook

Owner replies YES/NO via WhatsApp → auto accept/reject order.
Webhook endpoint receives Interakt callback, triggers order state change.
