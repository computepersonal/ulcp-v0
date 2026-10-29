# ULCP logging

How every ULCP service logs, how to search the logs, and how to run the central log stack.
This is the handover document for whoever owns the platform: nothing here depends on the
original author's machine.

## 1. The rule

Every log event is **one JSON line on stdout** with exactly these nine top-level fields. The
platform (Docker now, Kubernetes later) collects stdout; services never write log files and
never call a log server.

| Field | Meaning |
|---|---|
| `Timestamp` | UTC, ISO-8601, when the service emitted the event |
| `ApplicationName` | The product: `ULCP` (from `APP_NAME`). The same schema is used by the owner's other products, so one stack serves them all |
| `ServiceName` | The service: `order-service`, `identity-service`, ... |
| `MachineName` | The **real host** (not the container id). From `LOG_HOST_NAME`; a container refuses to start without it |
| `Message` | The fully rendered human message |
| `Severity` | `Trace`, `Debug`, `Information`, `Warning`, `Error`, `Critical` |
| `CorrelationId` | One id for a whole flow, shared by every service it touches. `null` outside a flow (start-up, shutdown) |
| `ServiceRequestId` | A fresh UUID for each operation inside one service. `null` outside a flow. A client can never choose it |
| `CustomDimensions` | JSON object with everything needed to debug: your structured properties, `Environment`, `Exception` (stack text) |

Example:

```json
{
  "Severity": "Information",
  "Timestamp": "2026-10-29T07:46:15.136Z",
  "ApplicationName": "ULCP",
  "ServiceName": "identity-service",
  "MachineName": "VEDODDA-DEV-1",
  "CorrelationId": "flow-22251-test",
  "ServiceRequestId": "ca1329fe-56ea-4ba8-853e-517bbe27d909",
  "CustomDimensions": { "Environment": "production", "method": "POST", "path": "/api/v1/auth/register", "statusCode": 201, "durationMs": 224 },
  "Message": "Request completed"
}
```

## 2. How it works in the code

All of it lives in `packages/shared/src/logging/`:

| File | Does |
|---|---|
| `logger.ts` | `createLogger(serviceName)` — Pino configured to emit the schema above; redacts secrets (`password`, `token`, `otp`, `pin`, `authorization`, `secret`, ...) |
| `context.ts` | `AsyncLocalStorage` holding `CorrelationId` + `ServiceRequestId` for the current operation; `runInNewOperation()` |
| `http.ts` | Fastify hooks (`onRequest`/`onResponse`) and `installFetchCorrelation()` |

Wiring in each service (already done for all five V0 services):

```ts
// src/lib/logger.ts
export const logger = createLogger("order-service");

// src/index.ts, right after creating the Fastify app
installFetchCorrelation();
const hooks = createRequestLogHooks(logger);
app.addHook("onRequest", hooks.onRequest);
app.addHook("onResponse", hooks.onResponse);
```

What that gives you for free:

1. **Incoming request** — `X-Correlation-ID` is accepted if it is 1–128 chars of
   `A-Z a-z 0-9 . _ -`, otherwise a new UUID is generated. A new `ServiceRequestId` is always
   generated. Both appear on every log line written while handling the request, and the
   correlation id is echoed in the `X-Correlation-ID` response header.
2. **Outgoing HTTP** — every `fetch()` made inside a request carries the same
   `X-Correlation-ID`, so the next service logs the same `CorrelationId` and makes its own
   `ServiceRequestId`.
3. **Redis events** — `publish()` adds `correlation_id` to object payloads; `subscribe()`
   handlers run as their own operation inside the publisher's flow.
4. One `Request completed` line per request (method, path, status, duration). `/health` is skipped.

### Writing log statements

```ts
logger.info({ orderId, tenantId, total }, "Order created");          // structured props -> CustomDimensions
logger.error({ err, orderId }, "Failed to charge payment");           // err -> CustomDimensions.Exception
```

- Put values in the **object**, not into the message string, so they are searchable.
- Never use these names as property keys: `ApplicationName`, `ServiceName`, `MachineName`,
  `CorrelationId`, `ServiceRequestId` (they are renamed with a leading `_` if you do).
- Never log secrets, OTPs, full tokens, card data or customer personal data. The redaction list
  is a safety net, not permission.
- Outside a request (a cron job, a queue worker) start an operation explicitly:

```ts
import { runInNewOperation } from "@ulcp/shared";
await runInNewOperation(async () => { logger.info("Nightly reset started"); /* ... */ });
```

- `LOG_LEVEL` (`trace|debug|info|warn|error|fatal`) sets verbosity; default `info` in production.
- Do not use `console.log` in services.

Tests: `pnpm --filter @ulcp/shared test` (schema, IDs, redaction, header propagation).

## 3. Where the logs go

```
service stdout (JSON) -> Docker json-file -> Alloy docker collector -> Loki  <- Grafana
```

Docker Compose gives every container the labels the collector turns into Loki labels:

| Loki label | Value |
|---|---|
| `project` | `ulcp` (the Compose project name — this is how you select ULCP) |
| `service_name` | The Compose service, e.g. `order-service` |
| `container` | e.g. `ulcp-order-service` |

Everything else (`ServiceName`, `Severity`, `CorrelationId`, ...) is inside the JSON line and is
queried with `| json`.

### Searching (Grafana → Explore → Loki)

```logql
{project="ulcp"} | json | Severity=~"Error|Critical"
{project="ulcp"} | json | ServiceName="order-service" | Severity="Warning"
{project="ulcp"} |= "PASTE-A-CORRELATION-ID"
{project="ulcp"} | json | CustomDimensions_statusCode >= 500
```

Tracing a customer complaint: find the failing line, copy its `CorrelationId`, search for it —
you get that request's lines from every service, in order.

### Retention

14 days in Loki (`retention_period: 336h` in `observability/loki.yml`). Old data is deleted
asynchronously by the compactor.

## 4. Running the central stack

The stack is shared infrastructure (Grafana, Loki, Prometheus, Alloy). A reference copy of its
configuration is in [`observability/`](../../observability/README.md), with the steps to start it.
It is deliberately **not** part of the ULCP application compose file: it serves more than one
product and must keep running when ULCP is redeployed.

## 5. Kubernetes (V0 target)

- Keep logging to stdout; do not add log files or sidecars to the services.
- Inject the node name as `LOG_HOST_NAME` from the downward API:
  `valueFrom: { fieldRef: { fieldPath: spec.nodeName } }`.
- Run a collector as a **DaemonSet** (Alloy or Promtail) that tails container logs and ships to
  Loki; map the pod's namespace/app to the `project` and `service_name` labels so the same
  queries keep working.
- Probe path `/health` is excluded from request logging.

## 6. Known limits

- Browser (frontend) errors are not shipped to the central log yet.
- No traces or metrics from the services yet (only host/container metrics from the stack).
- The start-up `prisma db push` banner lines are plain text, not JSON.
- Pre-existing `logger` calls inside services were left as they were; they now emit the schema
  automatically, but many carry little context. Improve them as you touch the code.
