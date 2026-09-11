import { describe, expect, it } from "vitest";

import {
  applyPilotReplacements,
  isIgnoredExcerpt,
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

describe("isIgnoredExcerpt", () => {
  it("ignora trecho cadastrado", () => {
    expect(isIgnoredExcerpt("fcee", ["fcee", "peidos"])).toBe(true);
    expect(isIgnoredExcerpt("geito", ["fcee"])).toBe(false);
  });
});
