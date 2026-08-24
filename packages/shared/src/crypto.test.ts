import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt, getMasterKey, maskSecret, constantTimeEqual } from "./crypto.js";

const TEST_KEY = randomBytes(32);

describe("crypto (AES-256-GCM)", () => {
  it("round-trip: decrypt(encrypt(x)) === x", () => {
    const plaintext = "sk-super-secret-api-key-1234567890";
    const payload = encrypt(plaintext, TEST_KEY);
    expect(decrypt(payload, TEST_KEY)).toBe(plaintext);
  });

  it("round-trip works for empty and unicode strings", () => {
    for (const plaintext of ["", "áéíóú çãõ 🔑", "a".repeat(5000)]) {
      const payload = encrypt(plaintext, TEST_KEY);
      expect(decrypt(payload, TEST_KEY)).toBe(plaintext);
    }
  });

  it("produces a different IV (and ciphertext) on every call", () => {
    const a = encrypt("mesmo-texto", TEST_KEY);
    const b = encrypt("mesmo-texto", TEST_KEY);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("throws when the authTag has been tampered with", () => {
    const payload = encrypt("dado-sensivel", TEST_KEY);
    const tamperedTag = Buffer.from(payload.authTag, "base64");
    tamperedTag[0] = tamperedTag[0]! ^ 0xff;
    expect(() =>
      decrypt({ ...payload, authTag: tamperedTag.toString("base64") }, TEST_KEY)
    ).toThrow();
  });

  it("throws when the ciphertext has been tampered with", () => {
    const payload = encrypt("dado-sensivel", TEST_KEY);
    const tampered = Buffer.from(payload.ciphertext, "base64");
    tampered[0] = tampered[0]! ^ 0xff;
    expect(() =>
      decrypt({ ...payload, ciphertext: tampered.toString("base64") }, TEST_KEY)
    ).toThrow();
  });

  it("throws when decrypting with the wrong key", () => {
    const payload = encrypt("dado-sensivel", TEST_KEY);
    const wrongKey = randomBytes(32);
    expect(() => decrypt(payload, wrongKey)).toThrow();
  });

  it("getMasterKey validates length and presence", () => {
    expect(() => getMasterKey(undefined)).toThrow(/ENCRYPTION_KEY não configurada/);
    expect(() => getMasterKey(Buffer.from("too-short").toString("base64"))).toThrow(
      /ENCRYPTION_KEY inválida/
    );
    expect(() => getMasterKey(randomBytes(32).toString("base64"))).not.toThrow();
  });

  it("never leaks the raw plaintext through JSON serialization of the payload", () => {
    const plaintext = "sk-should-not-appear-anywhere-1234";
    const payload = encrypt(plaintext, TEST_KEY);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(plaintext);
  });

  it("maskSecret keeps only prefix + last 4 chars", () => {
    const masked = maskSecret("sk-abcdefghijklmnop4a2f");
    expect(masked.startsWith("sk-")).toBe(true);
    expect(masked.endsWith("4a2f")).toBe(true);
    expect(masked).not.toContain("abcdefghijklmnop");
  });

  it("maskSecret degrades safely for very short secrets", () => {
    const masked = maskSecret("short");
    expect(masked).not.toBe("short");
  });

  it("constantTimeEqual behaves like ===  for matching/mismatched strings", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});
