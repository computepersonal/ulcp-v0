import { randomUUID } from "crypto";
import type { Logger } from "pino";
import { getLogContext, isValidCorrelationId, runWithLogContext } from "./context";

export const CORRELATION_HEADER = "x-correlation-id";

// Structural types so shared does not depend on Fastify; Fastify's request/reply satisfy them.
interface HookRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
}
interface HookReply {
  header(name: string, value: string): unknown;
  statusCode: number;
}

/**
 * Fastify hooks for every service:
 *   app.addHook("onRequest", hooks.onRequest);
 *   app.addHook("onResponse", hooks.onResponse);
 *
 * onRequest takes X-Correlation-ID from the caller when it is valid (otherwise generates one)
 * and always generates a fresh ServiceRequestId - a client can never choose that one.
 */
export function createRequestLogHooks(logger: Logger, options: { quietPaths?: string[] } = {}) {
  const quiet = new Set(options.quietPaths ?? ["/health"]);
  const startedAt = new WeakMap<object, bigint>();

  return {
    onRequest(request: HookRequest, reply: HookReply, done: () => void): void {
      const incoming = request.headers[CORRELATION_HEADER];
      const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
      const CorrelationId = isValidCorrelationId(candidate) ? candidate : randomUUID();
      reply.header("X-Correlation-ID", CorrelationId);
      startedAt.set(request, process.hrtime.bigint());
      runWithLogContext({ CorrelationId, ServiceRequestId: randomUUID() }, done);
    },

    onResponse(request: HookRequest, reply: HookReply, done: () => void): void {
      const path = request.url.split("?")[0] ?? request.url;
      if (!quiet.has(path)) {
        const start = startedAt.get(request);
        const durationMs = start === undefined ? undefined : Number((process.hrtime.bigint() - start) / 1_000_000n);
        logger.info({ method: request.method, path, statusCode: reply.statusCode, durationMs }, "Request completed");
      }
      done();
    },
  };
}

const patched = new WeakSet<object>();

/**
 * Makes every outgoing fetch() carry the current flow's X-Correlation-ID, so a downstream
 * service logs the same CorrelationId (and generates its own ServiceRequestId).
 * Call once at start-up.
 */
export function installFetchCorrelation(): void {
  const original = globalThis.fetch;
  if (patched.has(original)) return;

  const wrapped: typeof fetch = (input, init) => {
    const context = getLogContext();
    if (!context) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has(CORRELATION_HEADER)) headers.set("X-Correlation-ID", context.CorrelationId);
    return original(input, { ...init, headers });
  };
  patched.add(wrapped);
  globalThis.fetch = wrapped;
}
