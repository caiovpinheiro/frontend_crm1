import { describe, expect, it } from "vitest";

import { applyLanguageToolReplacements } from "@/lib/language-tool";

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
