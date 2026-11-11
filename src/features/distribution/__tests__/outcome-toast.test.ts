import { describe, expect, it } from "vitest";

import {
  distributionOutcomeToast,
  normalizeExecuteDistributionResult,
} from "../outcome-toast";

describe("distributionOutcomeToast", () => {
  it("202 queued não é o toast genérico de falha", () => {
    expect(distributionOutcomeToast({ queued: true }, "Atendimento")).toEqual({
      tone: "info",
      message: "Distribuição em andamento em Atendimento.",
    });
  });

  it("mapeia canal aposentado", () => {
    expect(
      distributionOutcomeToast({
        success: false,
        reason: "RETIRED_WHATSAPP_CHANNEL",
      }),
    ).toMatchObject({ tone: "error" });
  });
});

describe("distributionOutcomeToast — Por Leads", () => {
  it("NO_ELIGIBLE_PARTICIPANT avisa que ninguém do departamento está no rodízio", () => {
    const t = distributionOutcomeToast(
      { success: false, reason: "NO_ELIGIBLE_PARTICIPANT" },
      "Academico",
    );
    expect(t.tone).toBe("warning");
    expect(t.message).toContain("Academico");
    expect(t.message).toContain("rodízio por leads");
  });
});

describe("normalizeExecuteDistributionResult", () => {
  it("converte { queued: true } em QUEUED de sucesso", () => {
    expect(normalizeExecuteDistributionResult({ queued: true, jobId: "j1" })).toEqual({
      success: true,
      reason: "QUEUED",
      selectedUserId: null,
      selectedUserName: null,
      evaluated: [],
    });
  });
});
