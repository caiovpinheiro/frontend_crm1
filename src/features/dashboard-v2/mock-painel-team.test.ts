import { describe, expect, it } from "vitest";

import { mockPainelTeam } from "./mock-painel";

const scope = { departmentIds: [], userIds: [] };

describe("mockPainelTeam (contrato de /api/painel/team)", () => {
  it("sem `sections` devolve os três blocos", () => {
    const r = mockPainelTeam({ period: "last_7" }, "business", scope);
    expect(r.deptHour.ok).toBe(true);
    expect(r.ranking.ok).toBe(true);
    expect(r.transfers.ok).toBe(true);
    expect(r.rangeClamped).toBe(false);
  });

  it("bloco não pedido volta omitido, como no backend", () => {
    const r = mockPainelTeam({ period: "last_7" }, "business", scope, ["ranking"]);
    expect(r.ranking.ok).toBe(true);
    expect(r.deptHour).toEqual({ ok: false, error: "omitido" });
    expect(r.transfers).toEqual({ ok: false, error: "omitido" });
  });

  it("período acima de 90 dias vem cortado, com o início efetivo", () => {
    const r = mockPainelTeam(
      { period: "custom", startDate: "2026-01-01", endDate: "2026-09-30" },
      "business",
      scope,
    );
    expect(r.rangeClamped).toBe(true);
    expect(r.effectiveFrom).toBe("2026-07-03");
  });

  it("mapa de calor tem 24 horas por departamento e totais coerentes", () => {
    const r = mockPainelTeam({ period: "last_30" }, "business", scope);
    if (!r.deptHour.ok) throw new Error("esperava ok");
    const { rows, totals, total } = r.deptHour.data;
    expect(rows.every((row) => row.hours.length === 24)).toBe(true);
    expect(totals).toHaveLength(24);
    expect(totals.reduce((a, b) => a + b, 0)).toBe(total);
  });
});
