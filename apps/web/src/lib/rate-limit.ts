import { getRedis } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Rate limit de janela fixa por chave (ex.: "login:{ip}"), usando Redis.
 * Padrão do login: 5 tentativas / 15 min por IP (RF de segurança do PRD).
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = getRedis();
  const redisKey = `ratelimit:${key}`;

  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  const ttl = await redis.ttl(redisKey);

  return {
    allowed: count <= maxAttempts,
    remaining: Math.max(0, maxAttempts - count),
    retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}

export async function resetRateLimit(key: string): Promise<void> {
  await getRedis().del(`ratelimit:${key}`);
}
