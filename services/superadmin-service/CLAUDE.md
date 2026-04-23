# superadmin-service — Domain Context

> Platform-wide conventions, tech stack, and coding rules are in the **root CLAUDE.md**.
> This file contains superadmin-service-specific domain knowledge only.

---

## SUPERADMIN PANEL

### Platform Overview

- Tenants count, GMV, MRR, commission earned, new signups

### Businesses

- List all tenants, impersonate, activate/suspend, plan override

### Revenue

- MRR breakdown, commission earned/pending

### Commission Settlement

- Generate invoices, mark as paid

### Customers

- Cross-business spend data

### Notifications

- Broadcast to all businesses or all customers

### Settings

- Commission rates, pricing, feature flags

### Moderation

- Flagged reviews, reported businesses

---

## COMMISSION SYSTEM

Commission = % of every completed order the platform earns.
Calculated when order.status → completed.
Settled monthly via invoice.

```
COMMISSION_RATES = { free: 3%, starter: 2%, pro: 1.5% }
```

Razorpay Route: auto-splits at checkout.
Example: Customer pays ₹500 → ₹490 to restaurant + ₹10 to platform instantly.
