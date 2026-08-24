import { describe, it, expect, vi } from "vitest";
import { acquireLineLock, releaseLineLock } from "./lock.js";

function fakeRedis() {
  return {
    set: vi.fn(),
    del: vi.fn(),
  };
}

describe("acquireLineLock / releaseLineLock", () => {
  it("adquire o lock com SET NX e retorna true quando consegue", async () => {
    const redis = fakeRedis();
    redis.set.mockResolvedValue("OK");

    const acquired = await acquireLineLock(redis as never, "line-1");

    expect(acquired).toBe(true);
    expect(redis.set).toHaveBeenCalledWith("line-lock:line-1", "1", "PX", expect.any(Number), "NX");
  });

  it("retorna false quando o lock já está ocupado (SET NX falha)", async () => {
    const redis = fakeRedis();
    redis.set.mockResolvedValue(null);

    const acquired = await acquireLineLock(redis as never, "line-1");

    expect(acquired).toBe(false);
  });

  it("release remove a chave certa", async () => {
    const redis = fakeRedis();
    await releaseLineLock(redis as never, "line-42");
    expect(redis.del).toHaveBeenCalledWith("line-lock:line-42");
  });
});
