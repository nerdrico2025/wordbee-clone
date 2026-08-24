import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  signSessionToken,
  verifySessionToken,
  generateSessionId,
  hashSessionId,
} from "./session.js";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-please-be-at-least-32-chars-long";
});

describe("session tokens", () => {
  it("round-trip: verifies a token it just signed", async () => {
    const sessionId = generateSessionId();
    const token = await signSessionToken({ userId: "user_1", sessionId }, 60);
    const payload = await verifySessionToken(token);
    expect(payload?.sub).toBe("user_1");
    expect(payload?.sid).toBe(sessionId);
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    const sessionId = generateSessionId();
    const token = await signSessionToken({ userId: "user_1", sessionId }, 1);
    vi.setSystemTime(Date.now() + 5000);
    const payload = await verifySessionToken(token);
    expect(payload).toBeNull();
    vi.useRealTimers();
  });

  it("rejects a tampered token", async () => {
    const token = await signSessionToken({ userId: "user_1", sessionId: generateSessionId() }, 60);
    const tampered = token.slice(0, -2) + (token.slice(-2) === "aa" ? "bb" : "aa");
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
  });

  it("generateSessionId produces unique, unpredictable ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateSessionId()));
    expect(ids.size).toBe(50);
  });

  it("hashSessionId is deterministic and one-way-looking", () => {
    const id = generateSessionId();
    expect(hashSessionId(id)).toBe(hashSessionId(id));
    expect(hashSessionId(id)).not.toBe(id);
  });
});
