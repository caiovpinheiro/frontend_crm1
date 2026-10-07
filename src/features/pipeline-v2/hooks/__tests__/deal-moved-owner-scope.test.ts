/**
 * F5 — `deal_moved` para quem só vê os próprios negócios (modo "own").
 *
 * O evento sai para a organização inteira. Quem só enxerga os negócios que são
 * seus recebia o card de OUTRO responsável inserido no board (e o card que
 * trocou de dono para outra pessoa seguia na coluna) até o refetch. Com
 * `ownerId` no evento (backend novo), o cliente remove em vez de inserir.
 * Sem `ownerId` (backend atual) ou com escopo desconhecido: nada muda.
 */
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardDealDto, BoardStageDto } from "@/features/pipeline-v2/api";
import { applyDealMoved } from "@/features/pipeline-v2/hooks/use-pipeline-realtime";
import { setInboxViewerScope } from "@/features/inbox-v2/inbox-viewer-scope";
import type { RealtimePayload } from "@/lib/realtime-contract";

const T0 = "2026-10-07T10:00:00.000Z";
const T1 = "2026-10-07T12:00:00.000Z";
const ME = "u_me";

function deal(id: string, position: number, extra: Partial<BoardDealDto> = {}): BoardDealDto {
  return {
    id,
    title: id,
    value: 0,
    status: "OPEN",
    expectedClose: null,
    createdAt: T0,
    updatedAt: T0,
    isRotting: false,
    contact: { id: `c-${id}`, name: id, email: null },
    owner: null,
    lastMessage: null,
    unreadCount: 0,
    position,
    ...extra,
  };
}

function stage(id: string, deals: BoardDealDto[]): BoardStageDto {
  return {
    id,
    name: id,
    color: "#000",
    position: 0,
    winProbability: 0,
    rottingDays: 0,
    totalCount: deals.length,
    deals,
  };
}

function moved(
  extra: Partial<RealtimePayload<"deal_moved">> = {},
): RealtimePayload<"deal_moved"> {
  return {
    organizationId: "org-1",
    dealId: "d9",
    fromPipelineId: "p1",
    toPipelineId: "p2",
    fromStageId: "s-a",
    toStageId: "s-b",
    position: 1,
    updatedAt: T1,
    card: { id: "d9", title: "Negócio 9", owner: { id: "u_bia", name: "Bia" } },
    ...extra,
  };
}

const KEY_P1 = ["pipeline-board", "p1", "OPEN"] as const;
const KEY_P2 = ["pipeline-board", "p2", "OPEN"] as const;

function idsOf(qc: QueryClient, key: readonly unknown[]): string[] {
  return (qc.getQueryData<BoardStageDto[]>(key) ?? []).flatMap((s) => s.deals.map((d) => d.id));
}

let qc: QueryClient;
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { structuralSharing: false } } });
  qc.setQueryData(KEY_P1, [stage("s-a", [deal("d9", 0), deal("meu", 1)])]);
  qc.setQueryData(KEY_P2, [stage("s-b", [deal("x", 0)])]);
});

describe("deal_moved com ownerId (F5)", () => {
  it("só os meus: negócio de OUTRO responsável saiu do funil de origem e NÃO entra no destino", () => {
    setInboxViewerScope(qc, { userId: ME, ownOnly: true });
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    expect(applyDealMoved(qc, moved({ ownerId: "u_bia" }))).toBe(true);

    expect(idsOf(qc, KEY_P1)).toEqual(["meu"]);
    expect(idsOf(qc, KEY_P2)).toEqual(["x"]);
    expect(qc.getQueryData<BoardStageDto[]>(KEY_P1)![0]!.totalCount).toBe(1);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("só os meus: negócio MEU entra no destino normalmente", () => {
    setInboxViewerScope(qc, { userId: ME, ownOnly: true });

    expect(applyDealMoved(qc, moved({ ownerId: ME }))).toBe(true);

    expect(idsOf(qc, KEY_P1)).toEqual(["meu"]);
    expect(idsOf(qc, KEY_P2)).toEqual(["x", "d9"]);
  });

  it("negócio sem responsável (pool livre) não é removido por escopo", () => {
    setInboxViewerScope(qc, { userId: ME, ownOnly: true });

    applyDealMoved(qc, moved({ ownerId: null }));

    expect(idsOf(qc, KEY_P2)).toEqual(["x", "d9"]);
  });

  it("backend atual (evento sem ownerId): não remove nada, mesmo em modo 'own'", () => {
    setInboxViewerScope(qc, { userId: ME, ownOnly: true });

    applyDealMoved(qc, moved());

    expect(idsOf(qc, KEY_P1)).toEqual(["meu"]);
    expect(idsOf(qc, KEY_P2)).toEqual(["x", "d9"]);
  });

  it("vê tudo ou escopo desconhecido: insere como sempre", () => {
    setInboxViewerScope(qc, { userId: ME, ownOnly: false });
    applyDealMoved(qc, moved({ ownerId: "u_bia" }));
    expect(idsOf(qc, KEY_P2)).toEqual(["x", "d9"]);

    const other = new QueryClient({ defaultOptions: { queries: { structuralSharing: false } } });
    other.setQueryData(KEY_P2, [stage("s-b", [deal("x", 0)])]);
    applyDealMoved(other, moved({ ownerId: "u_bia" }));
    expect(idsOf(other, KEY_P2)).toEqual(["x", "d9"]);
  });
});
