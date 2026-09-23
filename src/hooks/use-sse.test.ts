import { describe, expect, it } from "vitest";

import { sseReconnectDelayMs } from "./use-sse";

const mid = () => 0.5; // jitter neutro
const low = () => 0; // -30%
const high = () => 1; // +30%

describe("sseReconnectDelayMs", () => {
  it("dobra a cada falha a partir de 5s", () => {
    expect([0, 1, 2, 3].map((n) => sseReconnectDelayMs(n, mid))).toEqual([
      5_000, 10_000, 20_000, 40_000,
    ]);
  });

  it("para em 60s", () => {
    expect(sseReconnectDelayMs(4, mid)).toBe(60_000);
    expect(sseReconnectDelayMs(20, mid)).toBe(60_000);
  });

  it("espalha ±30% para as abas não voltarem juntas", () => {
    expect(sseReconnectDelayMs(0, low)).toBe(3_500);
    expect(sseReconnectDelayMs(0, high)).toBe(6_500);
    expect(sseReconnectDelayMs(10, high)).toBe(78_000);
  });
});
