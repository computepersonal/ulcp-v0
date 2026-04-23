# order-service — Domain Context

> Platform-wide conventions, tech stack, and coding rules are in the **root CLAUDE.md**.
> This file contains order-service-specific domain knowledge only.

---

## KOT SYSTEM

Sequential per branch per day: KOT-001... resets midnight.
Multiple KOTs per table session. All consolidated at billing.

### KOT Routing

```
Type 2/4/7: Single KOT → Kitchen KDS + Kitchen Printer
Type 3:     Auto-split by item.station:
              food  → Kitchen KDS + Printer
              drink → Bar KDS + Printer
```

### KOT Acknowledgment Modes

Configured per tenant (`kot_ack_mode` + `kot_ack_delay_secs` on Tenant model).
Default by plan: free → "auto", starter/pro → "kds"

```
auto    → BullMQ delayed job fires after kot_ack_delay_secs (default 60s)
          If KOT still pending → auto-acknowledge
          Job cancelled if staff/printer acks first

kds     → Chef taps on KDS screen
          PATCH /api/v1/kots/:tenant_id/:id/status { status: "acknowledged" }

printer → Thermal printer confirms successful print job
          POST /api/v1/kots/:tenant_id/:id/printer-ack { success: true }
          On print failure: publishes KOT_PRINT_FAILED, KOT stays pending
```

All three modes funnel through `acknowledgeKot()` — idempotent, cancels pending auto-ack job.
`kot_ack_mode` fetched from tenant-service at order placement (cached 30min).

### KOT Status Flow

pending → acknowledged → preparing → ready → served

### Item Status (within KOT)

pending → preparing → ready → served | cancelled

### Thermal Printer

node-thermal-printer. Connects via TCP/IP: tcp://PRINTER_IP:9100
Printer IP configured per branch. Auto-prints on KOT creation.
Reprints available from KDS and POS.

---

## KDS SYSTEM

Full-screen React web app (apps/kds/).
Runs on ANY browser — tablet, TV, monitor, old phone.
No Redux — React useState + Socket.io only.
Config saved to localStorage (one-time 6-digit setup code).

### Card Colors

White=pending, Blue=preparing, Yellow=>70% target time, Red+pulse=overdue

### KDS Sounds

new_kot.mp3, modified.mp3, overdue.mp3, all_clear.mp3

---

## TABLE LIFECYCLE

```
available (🟢) → pending_confirmation (Types 2,3) → occupied (🟡)
→ ordering (🟡 + badge) → billed (🔴) → available (🟢)
```

### On Table Close

- Table available (Socket.io floor map)
- Inventory deducted (deductStockForSession)
- Commission calculated + recorded
- Receipt to customer (email + in-app)
- Kitchen performance + session analytics recorded

---

## GST SYSTEM

### Two Modes

```
GST_REGISTERED:   Tax Invoice, CGST+SGST or IGST, INV-YYYY-XXXX
NON_REGISTERED:   Receipt, total only, RCP-YYYY-XXXX
```

Tenant model: gst.isRegistered, gstin, stateCode, defaultRate
Item model: gst.rate (0/5/12/18/28), gst.hsn, gst.isTaxInclusive
calculateGST() handles intra/interstate logic automatically

---

## REFUND & CANCELLATION

Cancellation: pending (anyone), acknowledged (staff+), preparing (owner only)
Refund types: full | partial | item_level
Methods: razorpay_auto | cash | tab_deduction
Owner must approve all refunds. Online = auto Razorpay API call.

---

## PAYMENT SYSTEM

Provider Per Region:
- India (IN): Razorpay — UPI + cards + wallets + COD + BNPL + EMI
- US/Global: Stripe — cards + Apple Pay + Google Pay + ACH + BNPL

Abstraction Layer:
getPaymentProvider(tenantCountry) returns correct provider class
All providers implement: createOrder(), verifyPayment(), initiateRefund(), getSupportedMethods()

Commission Split:
- India: Razorpay Route — auto at checkout
- US: Stripe Connect Express — auto at checkout

COD: India only. Conditions: tenant.country===IN + codEnabled + delivery order
Currency: stored per tenant (country, currency, symbol, position)
All DB amounts in smallest unit (paise/cents)

Tenant Payment Accounts:
- India: Razorpay linked account (bank+IFSC+PAN, KYC 1-2 days)
- US: Stripe Connect Express (Stripe-hosted KYC)
- Stored: tenant.paymentAccounts.razorpay / .stripe

### Payment Security

Signature Verification (NEVER skip):
- Razorpay: HMAC-SHA256(orderId|paymentId) vs signature
- Stripe: stripe.webhooks.constructEvent() with raw body
- Use crypto.timingSafeEqual() — prevents timing attacks
- Invalid: reject + log security event

Webhook Idempotency:
- Redis key: webhook:EVENTID, TTL 24hr
- Skip if already processed — prevents double charges

Raw card/UPI data NEVER reaches your servers — provider handles PCI-DSS L1.
