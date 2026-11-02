import { describe, expect, it } from "vitest";

import {
  closingLabels,
  dayLabel,
  effectiveAppearance,
  frameSizeFor,
  mergeSiteContext,
  normalizeAppearance,
  resolveContextBanner,
  safeHttpsUrl,
  type WebchatAppearance,
} from "../appearance";
import { normalizePublicConfig } from "../types";

const KEY = "wc_abcdefghijklmnopqrstuvwx";
const DEFAULT_FROM_API = {
  model: "compact",
  allowExpand: false,
  start: { topics: [] },
  contextBanner: { enabled: false },
  closing: { enabled: false },
};

describe("appearance na config pública", () => {
  it("API sem appearance ou com o padrão: widget como sempre foi", () => {
    expect(normalizePublicConfig({}, KEY).appearance).toBeNull();
    expect(normalizePublicConfig({ appearance: "x" }, KEY).appearance).toBeNull();
    expect(normalizePublicConfig({ appearance: DEFAULT_FROM_API }, KEY).appearance).toBeNull();
  });

  it("modelo escolhido ou qualquer botão configurado ativa o modelo", () => {
    expect(effectiveAppearance({ ...DEFAULT_FROM_API, model: "guided" })?.model).toBe("guided");
    expect(
      effectiveAppearance({ ...DEFAULT_FROM_API, closing: { enabled: true, resolvedLabel: "A" } }),
    ).not.toBeNull();
  });
});

describe("normalizeAppearance", () => {
  it("modelo desconhecido cai no compacto e faltas não quebram", () => {
    expect(normalizeAppearance({ model: "xpto" })).toEqual({
      model: "compact",
      allowExpand: false,
      start: { topics: [] },
      contextBanner: { enabled: false },
      closing: { enabled: false },
    });
  });

  it("descarta link que não é https e tópico sem rótulo; corta nos limites", () => {
    const a = normalizeAppearance({
      start: {
        topics: [
          { id: "a", label: "Link ruim", icon: "lock", action: { type: "open_url", url: "http://x.test" } },
          { id: "b", label: "Script", icon: "lock", action: { type: "open_url", url: "javascript:alert(1)" } },
          { id: "c", label: "Com senha", icon: "lock", action: { type: "open_url", url: "https://a:b@x.test" } },
          { id: "d", label: "  ", icon: "lock", action: { type: "write" } },
          { id: "e", label: "L".repeat(99), icon: "outro", action: { type: "write" } },
        ],
      },
    });
    expect(a?.start.topics).toEqual([
      { id: "e", label: "L".repeat(40), icon: "chat", action: { type: "write" } },
    ]);
  });

  it("no máximo 6 tópicos; follow-up sem opção válida é removido", () => {
    const topics = Array.from({ length: 9 }, (_, i) => ({
      id: `t${i}`,
      label: `T${i}`,
      icon: "chat",
      action: { type: "write" },
      followUp: { question: "Q", options: [{ id: "o", label: "O", action: { type: "nada" } }] },
    }));
    const a = normalizeAppearance({ start: { topics } });
    expect(a?.start.topics).toHaveLength(6);
    expect(a?.start.topics[0]?.followUp).toBeUndefined();
  });

  it("safeHttpsUrl", () => {
    expect(safeHttpsUrl("https://x.test/a")).toBe("https://x.test/a");
    expect(safeHttpsUrl("//x.test")).toBeNull();
    expect(safeHttpsUrl("data:text/html,x")).toBeNull();
  });
});

describe("regras do fluxo", () => {
  const base: WebchatAppearance = {
    model: "compact",
    allowExpand: false,
    start: { topics: [] },
    contextBanner: { enabled: true, titleKey: "assunto", subtitleKey: "codigo" },
    closing: { enabled: true, resolvedLabel: "Ok", needHelpLabel: "Ajuda" },
  };

  it("faixa de contexto: sem valor, some", () => {
    expect(resolveContextBanner(base, undefined)).toBeNull();
    expect(resolveContextBanner(base, { outra: "x" })).toBeNull();
    expect(resolveContextBanner(base, { assunto: "  " })).toBeNull();
    expect(resolveContextBanner(base, { codigo: 7 })).toEqual({ title: null, subtitle: "7" });
    expect(resolveContextBanner({ ...base, contextBanner: { enabled: false } }, { assunto: "x" })).toBeNull();
  });

  it("não lê propriedade herdada como contexto", () => {
    expect(
      resolveContextBanner(
        { ...base, contextBanner: { enabled: true, titleKey: "constructor" } },
        {},
      ),
    ).toBeNull();
  });

  it("contexto: patch funde e null remove", () => {
    expect(mergeSiteContext({ a: "1", b: "2" }, { b: null, c: 3 })).toEqual({ a: "1", c: 3 });
  });

  it("encerramento: só depois de o visitante falar e some depois de usado", () => {
    expect(closingLabels(base, [])).toBeNull();
    expect(closingLabels(base, ["oi"])).toEqual({ resolved: "Ok", needHelp: "Ajuda" });
    expect(closingLabels(base, ["oi", "Ok"])).toBeNull();
    expect(closingLabels(base, ["oi", "Ok", "voltei"])).not.toBeNull();
    expect(closingLabels({ ...base, closing: { enabled: true } }, ["oi"])).toBeNull();
  });

  it("separador de dia", () => {
    const now = new Date(2026, 10, 2, 15, 0);
    expect(dayLabel(new Date(2026, 10, 2, 8, 0).toISOString(), now)).toBe("Hoje");
    expect(dayLabel(new Date(2026, 10, 1, 23, 0).toISOString(), now)).toBe("Ontem");
    expect(dayLabel(new Date(2026, 9, 20, 8, 0).toISOString(), now)).toBe("20/10/2026");
  });

  it("tamanho do painel", () => {
    expect(frameSizeFor(null, false)).toBe("default");
    expect(frameSizeFor({ ...base, model: "assisted" }, false)).toBe("tall");
    expect(frameSizeFor(base, true)).toBe("expanded");
  });
});
