import { describe, expect, it } from "vitest";

import type { DashboardFiltersState } from "./api";
import { requestFilters } from "./painel-api";

const base: DashboardFiltersState = {
  period: "last_7",
  pipelineIds: ["p1"],
  userIds: [],
  stageIds: [],
  tagIds: [],
  ownerIds: [],
  sources: [],
};

describe("requestFilters (chave das queries do painel)", () => {
  it("trocar só o usuário não muda a chave (o GET não leva userIds)", () => {
    const a = JSON.stringify(requestFilters({ ...base, userIds: ["u1"] }));
    const b = JSON.stringify(requestFilters({ ...base, userIds: ["u2", "u3"] }));
    expect(a).toBe(b);
  });

  it("o que vai na URL continua mudando a chave", () => {
    const key = (patch: Partial<DashboardFiltersState>) =>
      JSON.stringify(requestFilters({ ...base, ...patch }));
    expect(key({ pipelineIds: ["p2"] })).not.toBe(key({}));
    expect(key({ stageIds: ["s1"] })).not.toBe(key({}));
    expect(key({ tagIds: ["t1"] })).not.toBe(key({}));
    expect(key({ ownerIds: ["o1"] })).not.toBe(key({}));
    expect(key({ sources: ["site"] })).not.toBe(key({}));
    expect(key({ period: "today" })).not.toBe(key({}));
  });

  it("datas só contam no período personalizado", () => {
    const withDates = { ...base, startDate: "2026-01-01", endDate: "2026-01-31" };
    expect(requestFilters(withDates)).not.toHaveProperty("startDate");
    const custom = requestFilters({ ...withDates, period: "custom" });
    expect(custom.startDate).toBe("2026-01-01");
    expect(custom.endDate).toBe("2026-01-31");
  });

  it("funil legado (pipelineId) entra como lista, igual ao que a URL envia", () => {
    expect(requestFilters({ ...base, pipelineIds: [], pipelineId: "p9" }).pipelineIds).toEqual(["p9"]);
  });
});
