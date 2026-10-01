import { describe, expect, it } from "vitest";

import { stagesForList } from "./list-stages";

const pipelines = [
  {
    id: "p1",
    stages: [
      { id: "s1", name: "Novo", color: "#111", isLost: false },
      { id: "s2", name: "Perdido", color: null, isLost: true },
    ],
  },
  { id: "p2", stages: [] },
];

describe("stagesForList", () => {
  it("deriva id/nome/cor/isLost das etapas do funil selecionado", () => {
    expect(stagesForList(pipelines, "p1")).toEqual([
      { id: "s1", name: "Novo", color: "#111", isLost: false },
      { id: "s2", name: "Perdido", color: undefined, isLost: true },
    ]);
  });

  it("devolve lista vazia sem funil selecionado ou sem lista carregada", () => {
    expect(stagesForList(pipelines, null)).toEqual([]);
    expect(stagesForList(undefined, "p1")).toEqual([]);
    expect(stagesForList(pipelines, "p2")).toEqual([]);
    expect(stagesForList(pipelines, "nope")).toEqual([]);
  });
});
