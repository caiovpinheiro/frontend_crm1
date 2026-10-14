import { describe, expect, it } from "vitest";

import type { DashboardFiltersState } from "./api";
import { dashboardFiltersToPipelineHref } from "./dashboard-to-pipeline";

const filters: DashboardFiltersState = {
  period: "today",
  pipelineIds: ["pipe"],
  userIds: ["usuario-painel"],
  stageIds: [],
  tagIds: ["tag-calouro"],
  ownerIds: ["joao"],
  sources: ["instagram"],
  idleMinutes: 180,
  lastMessageDirection: "in",
};

describe("dashboardFiltersToPipelineHref", () => {
  it("abre a lista com os filtros estruturais e a etapa clicada", () => {
    const href = dashboardFiltersToPipelineHref({
      filters,
      pipelineRef: "1",
      stageId: "aguardando",
    });
    const q = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/pipeline/list?")).toBe(true);
    expect(q.get("pipeline")).toBe("1");
    expect(q.get("stages")).toBe("aguardando");
    expect(q.get("owner")).toBe("joao");
    expect(q.get("source")).toBe("instagram");
    expect(q.get("tags")).toBe("tag-calouro");
    expect(q.get("idle")).toBe("180");
    expect(q.get("dir")).toBe("in");
    expect(q.get("sort")).toBe("interaction_oldest");
    expect(q.has("created")).toBe(false);
    expect(q.get("owner")).not.toBe("usuario-painel");
  });

  it("sem tempo parado não força a ordenação", () => {
    const href = dashboardFiltersToPipelineHref({
      filters: { ...filters, idleMinutes: undefined, lastMessageDirection: undefined },
      pipelineRef: "1",
      stageId: "s1",
    });
    expect(href).not.toContain("sort=");
    expect(href).not.toContain("idle=");
  });
});
