import { describe, expect, it } from "vitest";

import {
  growSections,
  serviceSectionsFor,
  splitServiceWaves,
  teamSectionsFor,
} from "./visible-sections";

describe("serviceSectionsFor", () => {
  it("só pede o que os widgets visíveis leem", () => {
    expect(serviceSectionsFor(["volume"])).toEqual(["volume"]);
    expect(serviceSectionsFor(["tempo", "exceptions"]).sort()).toEqual(["exceptions", "tempo"]);
  });

  it("heatmap e tabelas dependem de por departamento; sem duplicar", () => {
    expect(serviceSectionsFor(["heatmap"]).sort()).toEqual(["byDepartment", "heatmap"]);
    expect(serviceSectionsFor(["summaries", "attendants"]).sort()).toEqual([
      "attendants",
      "byDepartment",
    ]);
  });

  it("ignora widgets sem bloco de serviço (agora, tabulações, equipe)", () => {
    expect(serviceSectionsFor(["agora", "kpis", "top", "deptHour", "teamRankings"])).toEqual([]);
    expect(serviceSectionsFor([])).toEqual([]);
  });
});

describe("teamSectionsFor", () => {
  it("mapeia widget para bloco do /api/painel/team", () => {
    expect(teamSectionsFor(["deptHour", "transfers"]).sort()).toEqual(["deptHour", "transfers"]);
    expect(teamSectionsFor(["teamRankings"])).toEqual(["ranking"]);
  });

  it("nada visível, nada pedido", () => {
    expect(teamSectionsFor(["volume", "tempo"])).toEqual([]);
  });
});

describe("splitServiceWaves", () => {
  it("reparte nas ondas mantendo a ordem delas", () => {
    expect(
      splitServiceWaves(["channels", "exceptions", "volume", "heatmap", "tempo"]),
    ).toEqual({
      volume: ["volume"],
      rest: ["heatmap", "exceptions"],
      heavy: ["tempo", "channels"],
    });
  });

  it("onda sem seção fica vazia (nenhum GET)", () => {
    expect(splitServiceWaves(["tempo"])).toEqual({ volume: [], rest: [], heavy: ["tempo"] });
    expect(splitServiceWaves([])).toEqual({ volume: [], rest: [], heavy: [] });
  });
});

describe("growSections", () => {
  it("esconder não encolhe a lista (mesma referência, mesma chave de query)", () => {
    const prev = ["deptHour", "ranking"] as const;
    expect(growSections(prev, ["ranking"])).toBe(prev);
    expect(growSections(prev, [])).toBe(prev);
  });

  it("mostrar um novo widget acrescenta o bloco, ordenado", () => {
    expect(growSections(["ranking"], ["transfers", "ranking"])).toEqual(["ranking", "transfers"]);
    expect(growSections([], ["transfers", "deptHour"])).toEqual(["deptHour", "transfers"]);
  });
});
