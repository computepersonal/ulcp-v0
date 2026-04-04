import Redis from "ioredis";
import { logger } from "./logger";

const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6380";

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("connect", () => logger.info("Redis connected (procurement-service)"));
redis.on("error", (err: Error) => logger.error(err, "Redis error"));

export async function redisPublish(channel: string, message: string): Promise<void> {
  await redis.publish(channel, message);
}
