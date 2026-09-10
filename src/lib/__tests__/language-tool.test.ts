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
});
