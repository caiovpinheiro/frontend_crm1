import { describe, expect, it } from "vitest";

import { dashboardFiltersSettled } from "./dashboard-filters-gate";

const pipelines = [{ id: "p1" }, { id: "p2" }];

describe("dashboardFiltersSettled", () => {
  it("espera o restore do localStorage e a lista de funis", () => {
    expect(
      dashboardFiltersSettled({ restored: false, pipelines, pipelineIds: ["p1"] }),
    ).toBe(false);
    expect(
      dashboardFiltersSettled({ restored: true, pipelines: undefined, pipelineIds: ["p1"] }),
    ).toBe(false);
  });

  it("não dispara com pipelineIds vazio (o efeito de funil padrão ainda vai reescrever)", () => {
    expect(dashboardFiltersSettled({ restored: true, pipelines, pipelineIds: [] })).toBe(false);
  });

  it("não dispara com funil da URL que não existe na lista", () => {
    expect(
      dashboardFiltersSettled({ restored: true, pipelines, pipelineIds: ["zzz"] }),
    ).toBe(false);
  });

  it("não dispara com mais de um funil (o painel usa sempre um)", () => {
    expect(
      dashboardFiltersSettled({ restored: true, pipelines, pipelineIds: ["p1", "p2"] }),
    ).toBe(false);
  });

  it("dispara com exatamente um funil válido", () => {
    expect(dashboardFiltersSettled({ restored: true, pipelines, pipelineIds: ["p2"] })).toBe(
      true,
    );
  });

  it("org sem funis conta como assentado (backend cai no padrão)", () => {
    expect(dashboardFiltersSettled({ restored: true, pipelines: [], pipelineIds: [] })).toBe(
      true,
    );
  });
});
