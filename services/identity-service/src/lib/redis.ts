import Redis from "ioredis";
import { logger } from "./logger";

const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err: Error) => logger.error(err, "Redis error"));

/** Store a value with TTL in seconds */
export async function redisSet(
  key: string,
  value: string,
  ttlSeconds: number
): Promise<void> {
  await redis.set(key, value, "EX", ttlSeconds);
}

/** Get a value */
export async function redisGet(key: string): Promise<string | null> {
  return redis.get(key);
}

/** Delete a key */
export async function redisDel(key: string): Promise<void> {
  await redis.del(key);
}

/** Check existence */
export async function redisExists(key: string): Promise<boolean> {
  const result = await redis.exists(key);
  return result === 1;
}
