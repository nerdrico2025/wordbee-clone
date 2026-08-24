import type { Redis } from "ioredis";

const LOCK_TTL_MS = 10 * 60_000;

function lockKey(lineId: string): string {
  return `line-lock:${lineId}`;
}

/** Lock por linha (RF-29/RF-30): nunca duas execuções simultâneas da mesma linha. */
export async function acquireLineLock(redis: Redis, lineId: string): Promise<boolean> {
  const result = await redis.set(lockKey(lineId), "1", "PX", LOCK_TTL_MS, "NX");
  return result === "OK";
}

export async function releaseLineLock(redis: Redis, lineId: string): Promise<void> {
  await redis.del(lockKey(lineId));
}
