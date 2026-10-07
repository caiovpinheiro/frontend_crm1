import { describe, expect, it } from "vitest";

import { sortUsage, usageDelta, usageSummary } from "./usage-stats";

const rows = [
  { id: "a", name: "Ana", seconds: 4 * 3600 },
  { id: "b", name: "Bruno", seconds: 2 * 3600 },
  { id: "c", name: "Carla", seconds: 0 },
];

describe("usageSummary", () => {
  it("total, média por usuário e quem está na média ou acima", () => {
    expect(usageSummary(rows)).toEqual({
      total: 6 * 3600,
      average: 2 * 3600,
      active: 3,
      atOrAbove: 2,
    });
  });

  it("sem usuários não divide por zero", () => {
    expect(usageSummary([])).toEqual({ total: 0, average: 0, active: 0, atOrAbove: 0 });
  });
});

describe("usageDelta", () => {
  it("tolera até 5 minutos como 'na média'", () => {
    expect(usageDelta(7200 + 299, 7200)).toEqual({ kind: "on" });
    expect(usageDelta(7200 - 299, 7200)).toEqual({ kind: "on" });
  });

  it("acima e abaixo trazem a diferença em segundos", () => {
    expect(usageDelta(7200 + 1800, 7200)).toEqual({ kind: "above", seconds: 1800 });
    expect(usageDelta(7200 - 3600, 7200)).toEqual({ kind: "below", seconds: 3600 });
  });
});

describe("sortUsage", () => {
  it("por tempo (desempate pelo nome) ou A–Z, sem mutar a entrada", () => {
    const input = [...rows, { id: "d", name: "Abel", seconds: 2 * 3600 }];
    expect(sortUsage(input, "time").map((r) => r.id)).toEqual(["a", "d", "b", "c"]);
    expect(sortUsage(input, "name").map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
    expect(input.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
});
