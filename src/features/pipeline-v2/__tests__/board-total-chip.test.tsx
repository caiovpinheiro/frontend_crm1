/** @vitest-environment jsdom */
/**
 * L2 — chip "Contando…" do cabeçalho do Kanban: só quando não há total
 * nenhum. Com board em cache (ou total já mostrado), o número anterior fica.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import type { BoardStageDto } from "../api";
import {
  cachedBoardTotal,
  resolveBoardTotalChip,
  useBoardTotalChip,
} from "../board-total-chip";

function stage(id: string, totalCount: number): BoardStageDto {
  return { id, totalCount, deals: [] } as unknown as BoardStageDto;
}

function setup() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("resolveBoardTotalChip", () => {
  it("sem pedido em andamento mostra o total atual", () => {
    expect(
      resolveBoardTotalChip({ pending: false, total: 7, lastKnown: 3, cachedTotal: 5 }),
    ).toEqual({ value: 7, counting: false });
  });

  it("pendente sem total nenhum: Contando…", () => {
    expect(
      resolveBoardTotalChip({ pending: true, total: 0, lastKnown: null, cachedTotal: null }),
    ).toEqual({ value: null, counting: true });
  });

  it("pendente com total em cache: mostra o cache, não Contando…", () => {
    expect(
      resolveBoardTotalChip({ pending: true, total: 0, lastKnown: null, cachedTotal: 42 }),
    ).toEqual({ value: 42, counting: false });
  });

  it("pendente com último total mostrado: mantém o último", () => {
    expect(
      resolveBoardTotalChip({ pending: true, total: 0, lastKnown: 9, cachedTotal: 42 }),
    ).toEqual({ value: 9, counting: false });
  });
});

describe("useBoardTotalChip", () => {
  it("abre com board em cache e pedido pendente: mostra o total do cache", () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(["pipeline-board", "p1", "ALL"], [stage("a", 30), stage("b", 12)]);
    const { result } = renderHook(
      () => useBoardTotalChip({ pending: true, total: 0, pipelineId: "p1", status: "ALL" }),
      { wrapper },
    );
    expect(result.current).toEqual({ value: 42, counting: false });
  });

  it("abre sem nada em cache: Contando…", () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useBoardTotalChip({ pending: true, total: 0, pipelineId: "p1", status: "ALL" }),
      { wrapper },
    );
    expect(result.current.counting).toBe(true);
  });

  it("troca de recorte (pendente) depois de ter mostrado um total: mantém o anterior", () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      (p: { pending: boolean; total: number }) =>
        useBoardTotalChip({ ...p, pipelineId: "p1", status: "ALL" }),
      { wrapper, initialProps: { pending: false, total: 18 } },
    );
    expect(result.current).toEqual({ value: 18, counting: false });
    rerender({ pending: true, total: 0 });
    expect(result.current).toEqual({ value: 18, counting: false });
    rerender({ pending: false, total: 5 });
    expect(result.current).toEqual({ value: 5, counting: false });
  });
});

describe("cachedBoardTotal", () => {
  it("ignora boards de outro funil/status e boards vazios", () => {
    const { qc } = setup();
    qc.setQueryData(["pipeline-board", "p2", "ALL"], [stage("x", 99)]);
    qc.setQueryData(["pipeline-board", "p1", "OPEN"], [stage("x", 98)]);
    qc.setQueryData(["pipeline-board", "p1", "ALL"], []);
    expect(cachedBoardTotal(qc, "p1", "ALL")).toBeNull();
  });
});
