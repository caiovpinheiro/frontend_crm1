import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/mobile-release/route";

import {
  publicApkUrl,
  publicMobileReleaseManifest,
  resolveMobileReleasePublicBaseUrl,
} from "./mobile-release-config";

const INTERNAL = "https://releases.interno.test";
const MANIFEST = {
  versionCode: 11,
  versionName: "1.0.10",
  apkUrl: `${INTERNAL}/releases/app-1.0.10.apk`,
  force: false,
  notes: "nota",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubUpstream(manifest: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(manifest)),
  );
}

describe("base pública do APK (env)", () => {
  it("sem env: null — o apkUrl segue como veio (default atual, app mobile não quebra)", () => {
    vi.stubEnv("MOBILE_RELEASE_PUBLIC_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_MOBILE_RELEASE_PUBLIC_BASE_URL", "");
    expect(resolveMobileReleasePublicBaseUrl()).toBeNull();
    expect(publicApkUrl(MANIFEST.apkUrl)).toBe(MANIFEST.apkUrl);
    expect(publicMobileReleaseManifest(MANIFEST)).toBe(MANIFEST);
  });

  it("env de servidor tem precedência sobre a NEXT_PUBLIC e ignora barra final", () => {
    vi.stubEnv("MOBILE_RELEASE_PUBLIC_BASE_URL", "https://downloads.publico.test/");
    vi.stubEnv("NEXT_PUBLIC_MOBILE_RELEASE_PUBLIC_BASE_URL", "https://outro.test");
    expect(resolveMobileReleasePublicBaseUrl()).toBe("https://downloads.publico.test");
  });

  it("valor inválido ou não-http(s) é ignorado", () => {
    vi.stubEnv("NEXT_PUBLIC_MOBILE_RELEASE_PUBLIC_BASE_URL", "");
    for (const bad of ["nao-e-url", "javascript:alert(1)", "ftp://x.test"]) {
      vi.stubEnv("MOBILE_RELEASE_PUBLIC_BASE_URL", bad);
      expect(resolveMobileReleasePublicBaseUrl()).toBeNull();
    }
  });

  it("troca só a origem: caminho e query do arquivo ficam iguais", () => {
    expect(publicApkUrl(`${INTERNAL}/releases/app.apk?v=2`, "https://dl.publico.test")).toBe(
      "https://dl.publico.test/releases/app.apk?v=2",
    );
    expect(publicApkUrl(`${INTERNAL}/releases/app.apk`, "https://publico.test/app")).toBe(
      "https://publico.test/app/releases/app.apk",
    );
  });

  it("apkUrl relativo/ inválido não é mexido", () => {
    expect(publicApkUrl("/releases/app.apk", "https://dl.publico.test")).toBe("/releases/app.apk");
    expect(publicApkUrl("", "https://dl.publico.test")).toBe("");
  });
});

describe("GET /api/mobile-release", () => {
  it("sem env: repassa o manifesto como veio", async () => {
    vi.stubEnv("MOBILE_RELEASE_PUBLIC_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_MOBILE_RELEASE_PUBLIC_BASE_URL", "");
    stubUpstream(MANIFEST);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(MANIFEST);
  });

  it("com a base pública: o host interno do serviço de releases não aparece na resposta", async () => {
    vi.stubEnv("MOBILE_RELEASE_PUBLIC_BASE_URL", "https://downloads.publico.test");
    stubUpstream(MANIFEST);
    const res = await GET();
    const text = await res.text();
    expect(text).not.toContain("releases.interno.test");
    expect(JSON.parse(text)).toEqual({
      ...MANIFEST,
      apkUrl: "https://downloads.publico.test/releases/app-1.0.10.apk",
    });
  });

  it("upstream fora do ar: 502 genérico, sem vazar a URL de origem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(`connect ECONNREFUSED ${INTERNAL}`);
      }),
    );
    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("interno");
  });
});
