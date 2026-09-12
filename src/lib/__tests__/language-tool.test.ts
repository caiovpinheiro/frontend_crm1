import { describe, expect, it } from "vitest";

import {
  applyLanguageToolReplacements,
  describeLanguageToolHttpError,
  isWhatsappUsefulMatch,
  shouldFallbackLanguageTool,
} from "@/lib/language-tool";

describe("applyLanguageToolReplacements", () => {
  it("aplica o primeiro replacement da direita para a esquerda", () => {
    const text = "teh cat and teh dog";
    const next = applyLanguageToolReplacements(text, [
      { offset: 0, length: 3, replacements: ["the"] },
      { offset: 12, length: 3, replacements: ["the"] },
    ]);
    expect(next).toBe("the cat and the dog");
  });

  it("ignora match sobreposto ao já aplicado à direita", () => {
    const text = "abc";
    const next = applyLanguageToolReplacements(text, [
      { offset: 0, length: 3, replacements: ["XYZ"] },
      { offset: 1, length: 2, replacements: ["Q"] },
    ]);
    expect(next).toBe("aQ");
  });

  it("ignora match sem replacement", () => {
    expect(
      applyLanguageToolReplacements("ola", [
        { offset: 0, length: 3, replacements: [] },
      ]),
    ).toBe("ola");
  });

  it("aplica maiúscula e ortografia no mesmo texto", () => {
    const text = "esta e uma menssagem sem nenhum assento";
    expect(
      applyLanguageToolReplacements(text, [
        { offset: 0, length: 4, replacements: ["Esta"] },
        { offset: 11, length: 9, replacements: ["mensagem"] },
      ]),
    ).toBe("Esta e uma mensagem sem nenhum assento");
  });

  it("aplica pontuação (interjeição e ponto final)", () => {
    const text =
      "Oi Marcelo, tudo bem Entao vou tentar de ajudar por aqui, tem um geito melhor de fazer isso";
    expect(
      applyLanguageToolReplacements(text, [
        { offset: 0, length: 2, replacements: ["Oi,", "Oi!"] },
        { offset: 65, length: 5, replacements: ["jeito"] },
        { offset: 87, length: 4, replacements: ["isso.", "isso?"] },
      ]),
    ).toBe(
      "Oi, Marcelo, tudo bem Entao vou tentar de ajudar por aqui, tem um jeito melhor de fazer isso.",
    );
  });

  it("não deixa um no-op no mesmo span tapar o ponto final", () => {
    const text = "fazer isso";
    expect(
      applyLanguageToolReplacements(text, [
        { offset: 6, length: 4, replacements: ["isso"] },
        { offset: 6, length: 4, replacements: ["isso.", "isso?"] },
      ]),
    ).toBe("fazer isso.");
  });

  it("aplica inserção com length 0", () => {
    expect(
      applyLanguageToolReplacements("ola", [
        { offset: 3, length: 0, replacements: ["."] },
      ]),
    ).toBe("ola.");
  });
});

describe("isWhatsappUsefulMatch", () => {
  it("descarta pra→para formal", () => {
    expect(
      isWhatsappUsefulMatch(
        {
          offset: 3,
          length: 3,
          categoryId: "FORMAL",
          issueType: "style",
          ruleId: "FORMAL_PRA_PARA",
        },
        "Da pra mim poder te ajudar por aki",
      ),
    ).toBe(false);
  });

  it("mantém ortografia aki→aqui", () => {
    expect(
      isWhatsappUsefulMatch(
        {
          offset: 31,
          length: 3,
          categoryId: "TYPOS",
          issueType: "misspelling",
          ruleId: "MORFOLOGIK_RULE_PT_BR",
        },
        "Da pra mim poder te ajudar por aki",
      ),
    ).toBe(true);
  });

  it("no exemplo do inbox só aplica aki→aqui", () => {
    const text = "Da pra mim poder te ajudar por aki";
    const matches = [
      {
        offset: 3,
        length: 3,
        replacements: ["para"],
        categoryId: "FORMAL",
        issueType: "style",
        ruleId: "FORMAL_PRA_PARA",
      },
      {
        offset: 31,
        length: 3,
        replacements: ["aqui"],
        categoryId: "TYPOS",
        issueType: "misspelling",
        ruleId: "MORFOLOGIK_RULE_PT_BR",
      },
    ].filter((m) => isWhatsappUsefulMatch(m, text));
    expect(applyLanguageToolReplacements(text, matches)).toBe(
      "Da pra mim poder te ajudar por aqui",
    );
  });

  it("não “corrige” vc no chat", () => {
    expect(
      isWhatsappUsefulMatch(
        {
          offset: 0,
          length: 2,
          categoryId: "TYPOS",
          issueType: "misspelling",
          ruleId: "MORFOLOGIK_RULE_PT_BR",
        },
        "vc pode confirmar",
      ),
    ).toBe(false);
  });
});

describe("shouldFallbackLanguageTool", () => {
  const worker = "https://crm-languagetool-worker.ca31ey.easypanel.host/v2/check";

  it("cai na API pública no 502 EasyPanel", () => {
    expect(
      shouldFallbackLanguageTool(worker, {
        status: 502,
        body: "<html>Service is not reachable</html>",
      }),
    ).toBe(true);
  });

  it("cai na API pública se o worker não responde", () => {
    expect(shouldFallbackLanguageTool(worker, { networkError: true })).toBe(true);
  });

  it("não faz loop se já é a API pública", () => {
    expect(
      shouldFallbackLanguageTool("https://api.languagetool.org/v2/check", {
        status: 502,
        networkError: true,
      }),
    ).toBe(false);
  });
});

describe("describeLanguageToolHttpError", () => {
  it("detecta 502 do EasyPanel", () => {
    expect(
      describeLanguageToolHttpError(
        502,
        "crm-languagetool-worker.ca31ey.easypanel.host",
        "<html><title>Not Found</title>Service is not reachable</html>",
      ),
    ).toMatch(/EasyPanel não alcança/);
  });

  it("detecta HTML genérico", () => {
    expect(
      describeLanguageToolHttpError(404, "example.com", "<!DOCTYPE html><html>"),
    ).toMatch(/HTML em vez de JSON/);
  });
});
