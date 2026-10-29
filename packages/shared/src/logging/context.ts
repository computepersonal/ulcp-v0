import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

/**
 * Per-operation logging identity.
 *  - CorrelationId: one id for the whole flow, shared by every service the flow touches.
 *  - ServiceRequestId: a fresh id for each operation inside one service.
 */
export interface LogContext {
  CorrelationId: string;
  ServiceRequestId: string;
}

const storage = new AsyncLocalStorage<LogContext>();

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value);
}

export function getLogContext(): LogContext | undefined {
  return storage.getStore();
}

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Start a new service operation: fresh ServiceRequestId, CorrelationId inherited from the
 * enclosing flow (or `correlationId`, or a new one when there is no flow).
 */
export function runInNewOperation<T>(fn: () => T, correlationId?: string): T {
  const inherited = storage.getStore()?.CorrelationId;
  const chosen = isValidCorrelationId(correlationId) ? correlationId : inherited ?? randomUUID();
  return storage.run({ CorrelationId: chosen, ServiceRequestId: randomUUID() }, fn);
}
