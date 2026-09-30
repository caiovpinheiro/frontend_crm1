import { describe, expect, it } from "vitest";

import {
  DEV_ONLY_PUBLIC_PATHS,
  devOnlyRouteDecision,
  isDevOnlyPath,
} from "../dev-only-routes";

describe("isDevOnlyPath", () => {
  it("reconhece /test-bulk-bar, /dev e tudo sob /dev/", () => {
    expect(isDevOnlyPath("/test-bulk-bar")).toBe(true);
    expect(isDevOnlyPath("/dev")).toBe(true);
    expect(isDevOnlyPath("/dev/campaigns-cards-preview")).toBe(true);
    expect(isDevOnlyPath("/dev/fluxo")).toBe(true);
    expect(isDevOnlyPath("/dev/timeline-preview/x")).toBe(true);
  });

  it("não confunde com rotas reais do app", () => {
    expect(isDevOnlyPath("/developers")).toBe(false);
    expect(isDevOnlyPath("/devices")).toBe(false);
    expect(isDevOnlyPath("/test-bulk-bar/x")).toBe(false);
    expect(isDevOnlyPath("/inbox")).toBe(false);
    expect(isDevOnlyPath("/")).toBe(false);
  });
});

describe("devOnlyRouteDecision (SEC-25)", () => {
  it("em produção bloqueia (404) toda rota de dev, pública ou não", () => {
    expect(devOnlyRouteDecision("/test-bulk-bar", true)).toBe("block");
    expect(devOnlyRouteDecision("/dev/campaigns-cards-preview", true)).toBe("block");
    expect(devOnlyRouteDecision("/dev/fluxo", true)).toBe("block");
    expect(devOnlyRouteDecision("/dev", true)).toBe("block");
  });

  it("fora de produção só as listadas ficam públicas; o resto de /dev exige sessão", () => {
    for (const path of DEV_ONLY_PUBLIC_PATHS) {
      expect(devOnlyRouteDecision(path, false)).toBe("public");
    }
    expect(devOnlyRouteDecision("/dev/fluxo", false)).toBe("none");
    expect(devOnlyRouteDecision("/dev", false)).toBe("none");
  });

  it("rotas normais nunca são caso especial", () => {
    expect(devOnlyRouteDecision("/developers", true)).toBe("none");
    expect(devOnlyRouteDecision("/inbox", false)).toBe("none");
    expect(devOnlyRouteDecision("/login", true)).toBe("none");
  });

  it("a lista pública de dev contém exatamente as duas rotas conhecidas", () => {
    expect([...DEV_ONLY_PUBLIC_PATHS].sort()).toEqual([
      "/dev/campaigns-cards-preview",
      "/test-bulk-bar",
    ]);
  });
});
