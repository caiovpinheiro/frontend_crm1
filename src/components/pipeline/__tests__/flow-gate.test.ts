import { describe, expect, it } from "vitest";

import {
  FLOW_ERROR_LOAD_FAILED,
  FLOW_ERROR_NO_PIPELINES,
  resolveFlowGate,
  type FlowGateInput,
} from "../flow-gate";

const base: FlowGateInput = {
  sessionStatus: "authenticated",
  pipelineId: null,
  pipelinesError: false,
  pipelinesEmpty: false,
  stuck: false,
};

describe("resolveFlowGate", () => {
  it("renderiza o Flow quando o funil resolveu (F5 com ?pipeline=9)", () => {
    expect(resolveFlowGate({ ...base, pipelineId: "cmrxn1r19" })).toEqual({
      kind: "ready",
    });
  });

  it("mostra o shell enquanto a sessão carrega", () => {
    expect(resolveFlowGate({ ...base, sessionStatus: "loading" })).toEqual({
      kind: "pending",
    });
  });

  it("não renderiza nada sem sessão (middleware redireciona)", () => {
    expect(resolveFlowGate({ ...base, sessionStatus: "unauthenticated" })).toEqual({
      kind: "none",
    });
  });

  // Regressão: `GET /api/pipelines` 500 prendia o Flow no FlowPendingShell
  // para sempre (spinner infinito + "Todos …").
  it("vira erro quando a lista de funis falha", () => {
    expect(resolveFlowGate({ ...base, pipelinesError: true })).toEqual({
      kind: "error",
      message: FLOW_ERROR_LOAD_FAILED,
    });
  });

  it("vira erro quando a organização não tem funis", () => {
    expect(resolveFlowGate({ ...base, pipelinesEmpty: true })).toEqual({
      kind: "error",
      message: FLOW_ERROR_NO_PIPELINES,
    });
  });

  // Regressão: query `idle` que nunca dispara não tem `isError`; sem o
  // timeout a tela girava indefinidamente.
  it("vira erro quando o shell estoura o timeout sem erro de query", () => {
    expect(resolveFlowGate({ ...base, stuck: true })).toEqual({
      kind: "error",
      message: FLOW_ERROR_LOAD_FAILED,
    });
  });

  it("erro de rede não sobrepõe um funil já resolvido", () => {
    expect(
      resolveFlowGate({ ...base, pipelineId: "cmr1", pipelinesError: true, stuck: true }),
    ).toEqual({ kind: "ready" });
  });

  // Invariante central: nenhuma combinação pode ficar em "pending" depois
  // do timeout — é isso que impede o spinner infinito de voltar.
  it("nunca fica pendente depois do timeout", () => {
    const statuses = ["loading", "authenticated", "unauthenticated"] as const;
    const bools = [false, true];
    for (const sessionStatus of statuses) {
      for (const pipelinesError of bools) {
        for (const pipelinesEmpty of bools) {
          for (const pipelineId of [null, "cmr1"]) {
            const gate = resolveFlowGate({
              sessionStatus,
              pipelineId,
              pipelinesError,
              pipelinesEmpty,
              stuck: true,
            });
            expect(gate.kind, JSON.stringify({ sessionStatus, pipelineId, pipelinesError, pipelinesEmpty })).not.toBe("pending");
          }
        }
      }
    }
  });
});
