import { describe, expect, it } from "vitest";

import { shouldBlockReturnToAi } from "../block-return-to-ai";
import { defaultAttendanceScope } from "../steering";

describe("shouldBlockReturnToAi", () => {
  it("bloqueia por pipeline/etapa no escopo do agente", () => {
    const scope = {
      ...defaultAttendanceScope(),
      blockedPipelineIds: ["pipe-acolh"],
      blockedStageIds: ["st-x"],
    };
    expect(
      shouldBlockReturnToAi({
        deals: [{ pipelineId: "pipe-acolh", stageId: "st-1" }],
        scope,
        acolhimentoAliases: [],
      }),
    ).toBe(true);
    expect(
      shouldBlockReturnToAi({
        deals: [{ pipelineId: "other", stageId: "st-x" }],
        scope,
        acolhimentoAliases: [],
      }),
    ).toBe(true);
  });

  it("casa aliases configurados, sem regex /acolh/", () => {
    expect(
      shouldBlockReturnToAi({
        deals: [{ pipelineName: "Funil Acolhedor" }],
        acolhimentoAliases: ["acolhimento"],
      }),
    ).toBe(false);
    expect(
      shouldBlockReturnToAi({
        deals: [{ pipelineName: "Funil Acolhimento 2026" }],
        acolhimentoAliases: ["acolhimento"],
      }),
    ).toBe(true);
  });

  it("sem labels não bloqueia", () => {
    expect(
      shouldBlockReturnToAi({
        deals: [],
        acolhimentoAliases: [],
      }),
    ).toBe(false);
  });
});
