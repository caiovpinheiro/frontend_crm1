import { describe, expect, it } from "vitest";

import { isNumericDealRef, stableDealIdForEffects } from "./deal-deep-link-gate";

describe("deal deep-link gate", () => {
  it("número da URL ainda não é id estável", () => {
    expect(isNumericDealRef("103")).toBe(true);
    expect(stableDealIdForEffects("103")).toBeNull();
  });

  it("CUID (ou id legado) libera presença e leitura", () => {
    expect(isNumericDealRef("cm1abc2def3ghi4jkl5mno6pq")).toBe(false);
    expect(stableDealIdForEffects("cm1abc2def3ghi4jkl5mno6pq")).toBe(
      "cm1abc2def3ghi4jkl5mno6pq",
    );
  });

  it("sem negócio aberto devolve null", () => {
    expect(stableDealIdForEffects(null)).toBeNull();
    expect(stableDealIdForEffects("")).toBeNull();
    expect(isNumericDealRef(null)).toBe(false);
  });
});
