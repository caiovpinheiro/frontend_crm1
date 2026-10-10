import { describe, expect, it } from "vitest";

import { belowAverageTone, heatFill, isBelowAverage, openTone } from "./measure-colors";

describe("cores por medida", () => {
  it("abaixo da média só quando é menor", () => {
    expect(isBelowAverage(59, 60)).toBe(true);
    expect(isBelowAverage(60, 60)).toBe(false);
  });

  it("misturas partem da superfície do card", () => {
    expect(openTone("var(--measure-time)")).toBe("color-mix(in oklch, var(--measure-time) 34%, var(--card))");
    expect(belowAverageTone("var(--measure-time)")).toBe(
      "color-mix(in oklch, var(--measure-time) 50%, var(--card))",
    );
  });

  it("faixa 0 do mapa de calor é vazia; a 5 é a cor cheia", () => {
    expect(heatFill("var(--x)", 0)).toBeUndefined();
    expect(heatFill("var(--x)", 5)).toBe("color-mix(in oklch, var(--x) 100%, var(--card))");
    expect(heatFill("var(--x)", 1)).toBe("color-mix(in oklch, var(--x) 16%, var(--card))");
    expect(heatFill("var(--x)", 99)).toBe("color-mix(in oklch, var(--x) 100%, var(--card))");
  });
});
