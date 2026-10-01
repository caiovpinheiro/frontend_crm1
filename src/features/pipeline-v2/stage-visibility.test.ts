import { describe, expect, it } from "vitest";

import { filtersForVisibleStages, visibleBoardStages } from "./stage-visibility";

const stages = [
  { id: "novo", isWon: false, isLost: false },
  { id: "proposta" },
  { id: "ganho", isWon: true, isLost: false },
  { id: "perdido", isWon: false, isLost: true },
];

const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe("visibleBoardStages", () => {
  it("oculta Ganho e Perdido por padrão", () => {
    expect(ids(visibleBoardStages(stages, {}))).toEqual(["novo", "proposta"]);
    expect(ids(visibleBoardStages(stages, null))).toEqual(["novo", "proposta"]);
  });

  it("exibe todas as fases", () => {
    expect(visibleBoardStages(stages, { showAllStages: true })).toBe(stages);
  });

  it("multi-seleção mostra só as etapas escolhidas (inclusive terminais)", () => {
    expect(
      ids(visibleBoardStages(stages, { stageIds: ["proposta", "ganho"] })),
    ).toEqual(["proposta", "ganho"]);
  });

  it("seleção de outro funil cai no padrão", () => {
    expect(ids(visibleBoardStages(stages, { stageIds: ["x"] }))).toEqual([
      "novo",
      "proposta",
    ]);
  });

  it("status/motivo/fechamento revelam a etapa terminal correspondente", () => {
    expect(ids(visibleBoardStages(stages, { statuses: ["WON"] }))).toEqual([
      "novo",
      "proposta",
      "ganho",
    ]);
    expect(ids(visibleBoardStages(stages, { lostReasons: ["Preço"] }))).toEqual([
      "novo",
      "proposta",
      "perdido",
    ]);
    expect(
      visibleBoardStages(stages, { closedAt: { from: "2026-01-01" } }),
    ).toBe(stages);
  });
});

describe("filtersForVisibleStages", () => {
  it("restringe o escopo às colunas visíveis", () => {
    const visible = visibleBoardStages(stages, {});
    expect(filtersForVisibleStages({ ownerIds: ["u1"] }, visible, stages)).toEqual({
      ownerIds: ["u1"],
      stageIds: ["novo", "proposta"],
    });
  });

  it("não mexe nos filtros quando nada está oculto", () => {
    const f = { ownerIds: ["u1"] };
    expect(filtersForVisibleStages(f, stages, stages)).toBe(f);
  });
});
