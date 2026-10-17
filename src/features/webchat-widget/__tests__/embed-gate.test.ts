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
});
