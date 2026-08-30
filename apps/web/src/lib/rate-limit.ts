import { getRedis } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Rate limit de janela fixa por chave (ex.: "login:{ip}"), usando Redis.
 * Padrão do login: 5 tentativas / 15 min por IP (RF de segurança do PRD).
 *
 * Só busca o TTL real (1 comando Redis a mais) quando o pedido já está
 * bloqueado — é o único caso em que `retryAfterSeconds` é de fato lido por
 * algum chamador (ver `api/auth/login/route.ts`); quando `allowed` é
 * `true` esse campo nunca é usado, então cai pro valor aproximado
 * (`windowSeconds`) sem gastar o comando TTL. Ver DECISIONS.md "redução de
 * comandos Redis" (2026-08-29).
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
  const allowed = count <= maxAttempts;
  const retryAfterSeconds = allowed ? windowSeconds : await redis.ttl(redisKey).then((ttl) => (ttl > 0 ? ttl : windowSeconds));

  return {
    allowed,
    remaining: Math.max(0, maxAttempts - count),
    retryAfterSeconds,
  };
}

export async function resetRateLimit(key: string): Promise<void> {
  await getRedis().del(`ratelimit:${key}`);
}
