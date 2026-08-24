import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing (argon2)", () => {
  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("minha-senha-forte-123");
    expect(await verifyPassword(hash, "minha-senha-forte-123")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("minha-senha-forte-123");
    expect(await verifyPassword(hash, "senha-errada")).toBe(false);
  });

  it("never stores the plaintext password inside the hash", async () => {
    const hash = await hashPassword("segredo-nao-deve-vazar");
    expect(hash).not.toContain("segredo-nao-deve-vazar");
  });

  it("produces a different hash for the same password each time (random salt)", async () => {
    const [a, b] = await Promise.all([hashPassword("mesma-senha"), hashPassword("mesma-senha")]);
    expect(a).not.toBe(b);
  });
});
