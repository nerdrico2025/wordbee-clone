import { describe, it, expect, vi, beforeEach } from "vitest";
import { lookup } from "node:dns/promises";
import { assertPublicHttpsUrl, assertSafeWordPressUrl } from "./url-guard.js";
import { WordPressError } from "./errors.js";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
const lookupMock = vi.mocked(lookup);

describe("assertPublicHttpsUrl (guarda anti-SSRF)", () => {
  it("aceita uma URL https pública normal", () => {
    const url = assertPublicHttpsUrl("https://meublog.com.br/");
    expect(url.hostname).toBe("meublog.com.br");
  });

  it("rejeita localhost", () => {
    expect(() => assertPublicHttpsUrl("http://localhost:8080")).toThrow(WordPressError);
  });

  it("rejeita 127.0.0.1", () => {
    expect(() => assertPublicHttpsUrl("http://127.0.0.1/wp")).toThrow(WordPressError);
  });

  it("rejeita faixas IPv4 privadas (10.x, 172.16-31.x, 192.168.x)", () => {
    for (const host of ["http://10.0.0.5", "http://172.16.0.1", "http://172.31.255.1", "http://192.168.1.1"]) {
      expect(() => assertPublicHttpsUrl(host)).toThrow(WordPressError);
    }
  });

  it("rejeita link-local (169.254.x)", () => {
    expect(() => assertPublicHttpsUrl("http://169.254.169.254/latest/meta-data")).toThrow(WordPressError);
  });

  it("não rejeita um IP público parecido mas fora das faixas privadas (ex.: 172.32.x, 172.15.x)", () => {
    expect(() => assertPublicHttpsUrl("http://172.32.0.1")).not.toThrow();
    expect(() => assertPublicHttpsUrl("http://172.15.0.1")).not.toThrow();
  });

  it("rejeita URL malformada", () => {
    expect(() => assertPublicHttpsUrl("não-é-uma-url")).toThrow(WordPressError);
  });

  it("rejeita protocolos não http/https", () => {
    expect(() => assertPublicHttpsUrl("ftp://meublog.com.br")).toThrow(WordPressError);
  });
});

describe("assertSafeWordPressUrl (guarda anti-SSRF com resolução de DNS)", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("aceita um domínio que resolve para IP público", async () => {
    lookupMock.mockResolvedValue([{ address: "203.0.113.10", family: 4 }] as never);
    const url = await assertSafeWordPressUrl("https://meublog.com.br");
    expect(url.hostname).toBe("meublog.com.br");
  });

  it("rejeita um domínio que resolve para IP privado (DNS rebinding)", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as never);
    await expect(assertSafeWordPressUrl("https://blog-malicioso.com")).rejects.toThrow(WordPressError);
  });

  it("rejeita se QUALQUER um dos endereços resolvidos for privado", async () => {
    lookupMock.mockResolvedValue([
      { address: "203.0.113.10", family: 4 },
      { address: "192.168.1.1", family: 4 },
    ] as never);
    await expect(assertSafeWordPressUrl("https://blog-multi-ip.com")).rejects.toThrow(WordPressError);
  });

  it("rejeita se a resolução de DNS falhar", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertSafeWordPressUrl("https://dominio-inexistente.test")).rejects.toThrow(WordPressError);
  });

  it("nem chega a resolver DNS se o hostname já é um IP privado literal", async () => {
    await expect(assertSafeWordPressUrl("http://127.0.0.1")).rejects.toThrow(WordPressError);
    expect(lookupMock).not.toHaveBeenCalled();
  });
});
