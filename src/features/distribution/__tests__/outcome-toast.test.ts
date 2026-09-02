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
