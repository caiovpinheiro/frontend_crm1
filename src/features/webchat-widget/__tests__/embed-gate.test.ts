import { describe, expect, it, vi } from "vitest";

import { normalizePublicConfig } from "../types";
import { verifyEmbed } from "../webchat-root";
import {
  isOriginAllowed,
  normalizeOrigin,
  webchatFrameAncestors,
  webchatPageKeyFromPath,
} from "@/lib/webchat-origin";
import {
  clearWebchatFramePolicyCache,
  loadWebchatAllowedOrigins,
} from "@/lib/webchat-frame-policy";

const KEY = "wc_abcdefghijklmnopqrstuvwx";
const config = normalizePublicConfig(
  { allowedOrigins: ["https://www.cliente.com.br"] },
  KEY,
);

function run(over: Partial<Parameters<typeof verifyEmbed>[0]> = {}) {
  return verifyEmbed({
    publicKey: KEY,
    host: "https://www.cliente.com.br",
    referrer: "https://www.cliente.com.br/produtos?x=1",
    handshake: vi.fn().mockResolvedValue({ page: "https://www.cliente.com.br/produtos" }),
    loadConfig: vi.fn().mockResolvedValue(config),
    ...over,
  });
}

describe("página /webchat/[publicKey] — gate do embed", () => {
  it("aprova host permitido + referrer + handshake", async () => {
    const res = await run();
    expect(res.ok).toBe(true);
  });

  it("recusa host fora de allowedOrigins", async () => {
    const res = await run({
      host: "https://evil.example",
      referrer: "https://evil.example/",
    });
    expect(res).toEqual({ ok: false, reason: "origin" });
  });

  it("recusa quando o referrer não bate com o host declarado", async () => {
    const res = await run({ referrer: "https://evil.example/" });
    expect(res).toEqual({ ok: false, reason: "referrer" });
  });

  it("recusa sem handshake do loader", async () => {
    const res = await run({ handshake: vi.fn().mockResolvedValue(null) });
    expect(res).toEqual({ ok: false, reason: "handshake" });
  });

  it("recusa quando o backend nega a config (403)", async () => {
    const res = await run({ loadConfig: vi.fn().mockRejectedValue(new Error("403")) });
    expect(res).toEqual({ ok: false, reason: "config" });
  });

  it("recusa host malformado", async () => {
    const res = await run({ host: "*" });
    expect(res).toEqual({ ok: false, reason: "bad_host" });
  });
});

describe("webchat-origin", () => {
  it("normaliza origens e rejeita curingas/esquemas perigosos", () => {
    expect(normalizeOrigin("https://WWW.Site.com.br/")).toBe("https://www.site.com.br");
    expect(normalizeOrigin("https://site.com:443")).toBe("https://site.com");
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("https://*.site.com")).toBeNull();
    expect(normalizeOrigin("https://a.com; script-src *")).toBeNull();
    expect(isOriginAllowed("https://site.com", ["https://site.com/"])).toBe(true);
  });

  it("CSP frame-ancestors só com origens válidas", () => {
    expect(webchatFrameAncestors(["https://a.com", "bad value", "http://b.test:8080"])).toBe(
      "frame-ancestors 'self' https://a.com http://b.test:8080",
    );
    expect(webchatFrameAncestors([])).toBe("frame-ancestors 'self'");
  });

  it("só /webchat/{wc_…} é a página do iframe", () => {
    expect(webchatPageKeyFromPath(`/webchat/${KEY}`)).toBe(KEY);
    expect(webchatPageKeyFromPath("/webchat/embed.js")).toBeNull();
    expect(webchatPageKeyFromPath(`/webchat/${KEY}/x`)).toBeNull();
  });

  it("middleware lê allowedOrigins do backend com cache", async () => {
    clearWebchatFramePolicyCache();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ allowedOrigins: ["https://a.com", "*"] }), { status: 200 }),
    );
    const opts = { apiBase: "http://api", fetchImpl, now: 1000 };
    expect(await loadWebchatAllowedOrigins(KEY, opts)).toEqual(["https://a.com"]);
    expect(await loadWebchatAllowedOrigins(KEY, opts)).toEqual(["https://a.com"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`http://api/api/public/webchat/config?key=${KEY}`);
  });

  it("host fora do cache rebusca (origem recém-liberada no painel), no máx. a cada 5 s", async () => {
    clearWebchatFramePolicyCache();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ allowedOrigins: ["https://a.com"] }), { status: 200 }))
      .mockResolvedValue(
        new Response(JSON.stringify({ allowedOrigins: ["https://a.com", "https://b.com"] }), { status: 200 }),
      );
    const base = { apiBase: "http://api", fetchImpl };
    expect(await loadWebchatAllowedOrigins(KEY, { ...base, now: 1000 })).toEqual(["https://a.com"]);
    // host já na lista → cache
    expect(await loadWebchatAllowedOrigins(KEY, { ...base, host: "https://a.com", now: 7000 })).toEqual(["https://a.com"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // host ausente, mas < 5 s desde a busca → ainda cache
    expect(await loadWebchatAllowedOrigins(KEY, { ...base, host: "https://b.com", now: 3000 })).toEqual(["https://a.com"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // host ausente e ≥ 5 s → rebusca e passa a liberar
    expect(await loadWebchatAllowedOrigins(KEY, { ...base, host: "https://b.com", now: 7000 })).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("backend fora do ar → sem origens (só 'self')", async () => {
    clearWebchatFramePolicyCache();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));
    expect(await loadWebchatAllowedOrigins(KEY, { apiBase: "http://api", fetchImpl })).toEqual([]);
  });

  describe("frame-ancestors com o backend instável (stale-if-error)", () => {
    const ok = (origins: string[]) =>
      new Response(JSON.stringify({ allowedOrigins: origins }), { status: 200 });
    const base = { apiBase: "http://api" };

    it("cache vencido: devolve a lista conhecida na hora e atualiza em segundo plano", async () => {
      clearWebchatFramePolicyCache();
      let release: (r: Response) => void = () => {};
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(ok(["https://a.com"]))
        .mockImplementationOnce(() => new Promise<Response>((r) => (release = r)));
      const waitUntil = vi.fn();
      expect(await loadWebchatAllowedOrigins(KEY, { ...base, fetchImpl, now: 1000 })).toEqual([
        "https://a.com",
      ]);
      // 61 s depois: não espera o backend (a busca fica pendurada).
      expect(
        await loadWebchatAllowedOrigins(KEY, { ...base, fetchImpl, waitUntil, now: 62_000 }),
      ).toEqual(["https://a.com"]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(waitUntil).toHaveBeenCalledTimes(1);
      release(ok(["https://a.com", "https://b.com"]));
      await waitUntil.mock.calls[0]![0];
      expect(await loadWebchatAllowedOrigins(KEY, { ...base, fetchImpl, now: 63_000 })).toEqual([
        "https://a.com",
        "https://b.com",
      ]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("timeout / 5xx / 429 com cache vencido → mantém a última lista (o widget não some)", async () => {
      clearWebchatFramePolicyCache();
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(ok(["https://a.com"]))
        .mockResolvedValueOnce(new Response("{}", { status: 503 }))
        .mockResolvedValueOnce(new Response("{}", { status: 429 }))
        .mockRejectedValue(new Error("timeout"));
      const run = async (now: number) => {
        const waitUntil = vi.fn();
        const origins = await loadWebchatAllowedOrigins(KEY, { ...base, fetchImpl, waitUntil, now });
        await Promise.all(waitUntil.mock.calls.map(([p]) => p));
        return origins;
      };
      expect(await run(1000)).toEqual(["https://a.com"]);
      expect(await run(70_000)).toEqual(["https://a.com"]); // 503
      expect(await run(80_000)).toEqual(["https://a.com"]); // 429
      expect(await run(90_000)).toEqual(["https://a.com"]); // timeout
      expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    it("origem nova (host fora da lista) com o backend fora → lista conhecida, sem travar", async () => {
      clearWebchatFramePolicyCache();
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(ok(["https://a.com"]))
        .mockRejectedValue(new Error("down"));
      await loadWebchatAllowedOrigins(KEY, { ...base, fetchImpl, now: 1000 });
      expect(
        await loadWebchatAllowedOrigins(KEY, { ...base, fetchImpl, host: "https://b.com", now: 70_000 }),
      ).toEqual(["https://a.com"]);
      // Falhou há < 5 s: nem tenta de novo.
      expect(
        await loadWebchatAllowedOrigins(KEY, { ...base, fetchImpl, host: "https://b.com", now: 72_000 }),
      ).toEqual(["https://a.com"]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("só 404 grava a lista vazia; 5xx sem lista conhecida não fica no cache", async () => {
      clearWebchatFramePolicyCache();
      const notFound = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
      expect(await loadWebchatAllowedOrigins(KEY, { ...base, fetchImpl: notFound, now: 1000 })).toEqual([]);
      expect(await loadWebchatAllowedOrigins(KEY, { ...base, fetchImpl: notFound, now: 2000 })).toEqual([]);
      expect(notFound).toHaveBeenCalledTimes(1);

      clearWebchatFramePolicyCache();
      const flaky = vi
        .fn()
        .mockResolvedValueOnce(new Response("{}", { status: 502 }))
        .mockResolvedValueOnce(ok(["https://a.com"]));
      expect(await loadWebchatAllowedOrigins(KEY, { ...base, fetchImpl: flaky, now: 1000 })).toEqual([]);
      // Depois da janela de 5 s, busca de novo e libera.
      expect(await loadWebchatAllowedOrigins(KEY, { ...base, fetchImpl: flaky, now: 7000 })).toEqual([
        "https://a.com",
      ]);
      expect(flaky).toHaveBeenCalledTimes(2);
    });

    it("sem lista conhecida, o middleware espera no máximo ~1,5 s", async () => {
      clearWebchatFramePolicyCache();
      vi.useFakeTimers();
      try {
        const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
        const p = loadWebchatAllowedOrigins(KEY, { ...base, fetchImpl, now: 1000 });
        await vi.advanceTimersByTimeAsync(1500);
        expect(await p).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
