import { describe, it, expect } from "vitest";
import { assertPublicHttpsUrl } from "./url-guard.js";
import { WordPressError } from "./errors.js";

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
