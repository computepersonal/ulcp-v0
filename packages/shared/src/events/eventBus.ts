import Redis from "ioredis";
import { EventName } from "../constants/events";

type EventHandler = (payload: unknown) => Promise<void> | void;

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

export function initEventBus(redisUrl: string): void {
  publisher = new Redis(redisUrl);
  subscriber = new Redis(redisUrl);
}

export async function publish(event: EventName, payload: unknown): Promise<void> {
  if (!publisher) throw new Error("EventBus not initialized");
  await publisher.publish(event, JSON.stringify(payload));
}

export function subscribe(event: EventName, handler: EventHandler): void {
  if (!subscriber) throw new Error("EventBus not initialized");
  subscriber.subscribe(event);
  subscriber.on("message", (channel, message) => {
    if (channel === event) {
      try {
        const payload: unknown = JSON.parse(message);
        void handler(payload);
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
