import Redis from "ioredis";
import { EventName } from "../constants/events";
import { getLogContext, runInNewOperation } from "../logging/context";

type EventHandler = (payload: unknown) => Promise<void> | void;

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

export function initEventBus(redisUrl: string): void {
  publisher = new Redis(redisUrl);
  subscriber = new Redis(redisUrl);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function publish(event: EventName, payload: unknown): Promise<void> {
  if (!publisher) throw new Error("EventBus not initialized");
  // Carry the flow's CorrelationId to subscribers (additive field; existing consumers ignore it)
  const correlationId = getLogContext()?.CorrelationId;
  const body = correlationId && isPlainObject(payload) ? { ...payload, correlation_id: correlationId } : payload;
  await publisher.publish(event, JSON.stringify(body));
}

export function subscribe(event: EventName, handler: EventHandler): void {
  if (!subscriber) throw new Error("EventBus not initialized");
  subscriber.subscribe(event);
  subscriber.on("message", (channel, message) => {
    if (channel === event) {
      try {
        const payload: unknown = JSON.parse(message);
        const correlationId = isPlainObject(payload) ? payload["correlation_id"] : undefined;
        // Each handled event is its own service operation inside the publisher's flow
        void runInNewOperation(
          () => handler(payload),
          typeof correlationId === "string" ? correlationId : undefined
        );
      } catch {
        // ignore parse errors
      }
    }
  });
}

export function closeEventBus(): void {
  publisher?.disconnect();
  subscriber?.disconnect();
}
