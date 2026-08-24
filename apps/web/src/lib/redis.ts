import { Redis } from "ioredis";

let client: Redis | undefined;

/** Cliente Redis do processo web, usado para rate limiting (Node.js runtime only). */
export function getRedis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL não configurada.");
    client = new Redis(url, { maxRetriesPerRequest: null });
  }
  return client;
}
