/**
 * F4 (05/10) — vídeo do tutorial e APKs servidos pelo container do Next
 * saíam com `Cache-Control: public, max-age=0` (34 MB e 3–6 MB por
 * download) e passavam pelo middleware de auth.
 *
 *  - `headers()` do next.config: cache longo e imutável para
 *    `/tutorials/*` e `/releases/*` (nomes versionados), exceto o HTML do
 *    player, que tem nome fixo e revalida;
 *  - todo arquivo de `public/tutorials` e `public/releases` tem versão ou
 *    hash no nome (o cache imutável não pode servir conteúdo velho);
 *  - middleware fora de `.mp4`/`.webm`/`.apk`;
 *  - URL do player/vídeo configurável (`NEXT_PUBLIC_MEDIA_CDN_BASE_URL`),
 *    default = caminho local.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Mesmos compiladores de rota que o Next usa (`headers()` e matcher).
import { buildCustomRoute } from "next/dist/lib/build-custom-route";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";

import nextConfig from "../../../next.config";
import { config as middlewareConfig } from "@/middleware";
import {
  GOOGLE_KEEP_TUTORIAL_PLAYER_PATH,
  GOOGLE_KEEP_TUTORIAL_VIDEO_FILE,
  googleKeepTutorialPlayerUrl,
} from "@/features/keeps/keep-tutorial-assets";
import { mediaAssetUrl, resolveMediaCdnBaseUrl } from "@/lib/media-cdn";
import { publicApkUrl } from "@/lib/native/mobile-release-config";

const ROOT = path.resolve(__dirname, "../../..");
const IMMUTABLE = "public, max-age=31536000, immutable";

/** Cabeçalhos efetivos de `pathname`: regras na ordem, a última vence. */
async function headersFor(pathname: string): Promise<Record<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const out: Record<string, string> = {};
  for (const rule of rules) {
    const built = buildCustomRoute("header", rule);
    if (!new RegExp(built.regex).test(pathname)) continue;
    for (const h of rule.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
}

describe("Cache-Control de /tutorials e /releases (next.config)", () => {
  it("vídeo versionado e APKs: cache de 1 ano, imutável", async () => {
    expect((await headersFor(`/tutorials/${GOOGLE_KEEP_TUTORIAL_VIDEO_FILE}`))["cache-control"]).toBe(
      IMMUTABLE,
    );
    expect((await headersFor("/releases/eduit-crm-1.0.7.apk"))["cache-control"]).toBe(IMMUTABLE);
  });

  it("HTML do player (nome fixo) revalida — não fica preso por 1 ano", async () => {
    const h = await headersFor(GOOGLE_KEEP_TUTORIAL_PLAYER_PATH);
    expect(h["cache-control"]).toBe("public, max-age=0, must-revalidate");
  });

  it("o resto do app não ganha cache longo; cabeçalhos de segurança continuam", async () => {
    const h = await headersFor("/inbox");
    expect(h["cache-control"]).toBeUndefined();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect((await headersFor("/releases/eduit-crm-1.0.7.apk"))["x-frame-options"]).toBe("DENY");
  });
});

describe("nomes versionados em public/", () => {
  it("todo binário de /tutorials e /releases tem versão ou hash no nome", () => {
    const tutorials = readdirSync(path.join(ROOT, "public/tutorials")).filter(
      (f) => !f.endsWith(".html"),
    );
    const releases = readdirSync(path.join(ROOT, "public/releases"));
    expect(tutorials.length).toBeGreaterThan(0);
    for (const f of tutorials) expect(f).toMatch(/\.[0-9a-f]{8,}\.[a-z0-9]+$/);
    for (const f of releases) expect(f).toMatch(/-\d+\.\d+\.\d+\.apk$/);
  });

  it("o player aponta para o vídeo versionado, sem autoplay e com preload=metadata", () => {
    const html = readFileSync(path.join(ROOT, "public", GOOGLE_KEEP_TUTORIAL_PLAYER_PATH), "utf8");
    expect(html).toContain(`src="./${GOOGLE_KEEP_TUTORIAL_VIDEO_FILE}"`);
    expect(html).toContain('preload="metadata"');
    expect(html).not.toMatch(/\bautoplay\b/);
    expect(readdirSync(path.join(ROOT, "public/tutorials"))).toContain(
      GOOGLE_KEEP_TUTORIAL_VIDEO_FILE,
    );
  });
});

describe("middleware fora dos binários", () => {
  const match = getPathMatch(middlewareConfig.matcher[0]);
  const matcher = { test: (p: string) => match(p) !== false };

  it("não roda em .mp4, .webm e .apk", () => {
    expect(matcher.test(`/tutorials/${GOOGLE_KEEP_TUTORIAL_VIDEO_FILE}`)).toBe(false);
    expect(matcher.test("/tutorials/x.webm")).toBe(false);
    expect(matcher.test("/releases/eduit-crm-1.0.7.apk")).toBe(false);
  });

  it("segue rodando nas páginas e na API", () => {
    expect(matcher.test("/inbox")).toBe(true);
    expect(matcher.test("/api/conversations")).toBe(true);
    expect(matcher.test(GOOGLE_KEEP_TUTORIAL_PLAYER_PATH)).toBe(true);
  });
});

describe("URL configurável (Spaces/CDN)", () => {
  it("sem a variável: caminho local de sempre", () => {
    expect(resolveMediaCdnBaseUrl("")).toBeNull();
    expect(resolveMediaCdnBaseUrl(undefined)).toBeNull();
    expect(mediaAssetUrl("/tutorials/a.mp4", null)).toBe("/tutorials/a.mp4");
    expect(googleKeepTutorialPlayerUrl(null)).toBe(GOOGLE_KEEP_TUTORIAL_PLAYER_PATH);
  });

  it("com a variável: player na CDN (o vídeo vai junto, caminho relativo)", () => {
    const base = resolveMediaCdnBaseUrl("https://bwipo-media.nyc3.cdn.digitaloceanspaces.com/");
    expect(base).toBe("https://bwipo-media.nyc3.cdn.digitaloceanspaces.com");
    expect(googleKeepTutorialPlayerUrl(base)).toBe(
      `https://bwipo-media.nyc3.cdn.digitaloceanspaces.com${GOOGLE_KEEP_TUTORIAL_PLAYER_PATH}`,
    );
    // Prefixo de pasta no bucket.
    expect(
      mediaAssetUrl("/tutorials/a.mp4", resolveMediaCdnBaseUrl("https://cdn.bwipo.com/static")),
    ).toBe("https://cdn.bwipo.com/static/tutorials/a.mp4");
  });

  it("valor inválido é ignorado (cai no caminho local)", () => {
    expect(resolveMediaCdnBaseUrl("javascript:alert(1)")).toBeNull();
    expect(resolveMediaCdnBaseUrl("nao-e-url")).toBeNull();
  });

  it("APK: a base pública já existente (MOBILE_RELEASE_PUBLIC_BASE_URL) troca a origem", () => {
    const apk = "https://crm-mobile.7w7dai.easypanel.host/releases/bwipo-1.0.10.apk";
    expect(publicApkUrl(apk, null)).toBe(apk);
    expect(publicApkUrl(apk, "https://bwipo-media.nyc3.cdn.digitaloceanspaces.com")).toBe(
      "https://bwipo-media.nyc3.cdn.digitaloceanspaces.com/releases/bwipo-1.0.10.apk",
    );
  });
});
