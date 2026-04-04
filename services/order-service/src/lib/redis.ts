import Redis from "ioredis";
import { logger } from "./logger";

const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("connect", () => logger.info("Redis connected (order-service)"));
redis.on("error", (err: Error) => logger.error(err, "Redis error"));

export async function redisSet(
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<void> {
  if (ttlSeconds) {
    await redis.set(key, value, "EX", ttlSeconds);
  } else {
    await redis.set(key, value);
  }
}

export async function redisGet(key: string): Promise<string | null> {
  return redis.get(key);
}

export async function redisDel(key: string): Promise<void> {
  await redis.del(key);
}

export async function redisPublish(
  channel: string,
  message: string
): Promise<void> {
  await redis.publish(channel, message);
}
