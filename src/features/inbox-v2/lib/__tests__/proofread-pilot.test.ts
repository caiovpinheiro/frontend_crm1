import { describe, expect, it } from "vitest";

import {
  applyPilotReplacements,
  findBuiltinPtBrMatches,
  isIgnoredExcerpt,
  prepareProofreadText,
} from "@/features/inbox-v2/lib/proofread-pilot";

describe("applyPilotReplacements", () => {
  it("troca mi escrevi por me inscrevi", () => {
    expect(
      applyPilotReplacements("Mi escrevi no vestibular", [
        { from: "mi escrevi", to: "me inscrevi" },
      ]),
    ).toBe("me inscrevi no vestibular");
  });
});

describe("findBuiltinPtBrMatches", () => {
  it("troca vasta olhar por basta olhar", () => {
    const text = "Jose, o procedimento esta errado, vasta olhar o mouse";
    const matches = findBuiltinPtBrMatches(text);
    expect(matches.map((m) => [m.excerpt, m.replacements[0]])).toEqual([
      ["vasta", "basta"],
    ]);
    expect(prepareProofreadText(text, [], []).prepared).toBe(
      "Jose, o procedimento esta errado, basta olhar o mouse",
    );
  });

  it("separa vastaolhar grudado", () => {
    expect(prepareProofreadText("vastaolhar o pontinho", [], []).prepared).toBe(
      "basta olhar o pontinho",
    );
  });

  it("não troca adjetivo vasta sem infinitivo", () => {
    expect(findBuiltinPtBrMatches("uma área vasta no mapa")).toEqual([]);
  });
});

describe("isIgnoredExcerpt", () => {
  it("ignora trecho cadastrado", () => {
    expect(isIgnoredExcerpt("fcee", ["fcee", "peidos"])).toBe(true);
    expect(isIgnoredExcerpt("geito", ["fcee"])).toBe(false);
  });
});
