/**
 * `deal_moved` no cache do board: move local, sem refetch e sem duplicar.
 */
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { toDealCard } from "@/features/pipeline-v2/adapters";
import type { BoardDealDto, BoardStageDto } from "@/features/pipeline-v2/api";
import {
  applyDealMoved,
  applyDealMovedToBoards,
} from "@/features/pipeline-v2/hooks/use-pipeline-realtime";
import type { RealtimePayload } from "@/lib/realtime-contract";

const T0 = "2026-10-05T10:00:00.000Z";
const T1 = "2026-10-05T12:00:00.000Z";
const T2 = "2026-10-05T13:00:00.000Z";

function deal(id: string, position: number, extra: Partial<BoardDealDto> = {}): BoardDealDto {
  return {
    id,
    title: extra.title ?? id,
    value: 0,
    status: "OPEN",
    expectedClose: null,
    createdAt: T0,
    updatedAt: T0,
    isRotting: false,
    contact: { id: `c-${id}`, name: id, email: null },
    owner: null,
    lastMessage: extra.lastMessage ?? { id: `m-${id}`, content: "oi", createdAt: T0, direction: "in" },
    unreadCount: 0,
    ...extra,
    position: extra.position ?? position,
  };
}

function stage(
  id: string,
  deals: BoardDealDto[],
  extra: Partial<BoardStageDto> = {},
): BoardStageDto {
  return {
    id,
    name: id,
    color: "#000",
    position: 0,
    winProbability: 0,
    rottingDays: 0,
    totalCount: deals.length,
    deals,
    ...extra,
  };
}

function moved(
  partial: Partial<RealtimePayload<"deal_moved">> &
    Pick<
      RealtimePayload<"deal_moved">,
      "dealId" | "fromPipelineId" | "toPipelineId" | "fromStageId" | "toStageId" | "position"
    >,
): RealtimePayload<"deal_moved"> {
  return {
    organizationId: "org-1",
    updatedAt: T1,
    ...partial,
  };
}

describe("applyDealMoved", () => {
  it("stage A → stage B respeita position e não mexe na coluna alheia", () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { structuralSharing: false } },
    });
    const idle = stage("s-idle", [deal("outro", 0)]);
    const origin = stage("s-a", [deal("d1", 0), deal("fica", 1)]);
    const dest = stage("s-b", [deal("antes", 0), deal("depois", 2)]);
    const board = [origin, dest, idle];
    const key = ["pipeline-board", "p1", "OPEN"] as const;
    qc.setQueryData(key, board);
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const refetch = vi.spyOn(qc, "refetchQueries");

    expect(
      applyDealMoved(
        qc,
        moved({
          dealId: "d1",
          fromPipelineId: "p1",
          toPipelineId: "p1",
          fromStageId: "s-a",
          toStageId: "s-b",
          position: 1,
        }),
      ),
    ).toBe(true);

    const after = qc.getQueryData<BoardStageDto[]>(key)!;
    expect(after[2]).toBe(idle);
    expect(after[0].deals.map((d) => d.id)).toEqual(["fica"]);
    expect(after[0].deals[0]).toBe(origin.deals[1]);
    expect(after[1].deals.map((d) => d.id)).toEqual(["antes", "d1", "depois"]);
    expect(after[1].deals[0]).toBe(dest.deals[0]);
    expect(after[1].deals[2]).toBe(dest.deals[1]);
    expect(after[1].deals[1].position).toBe(1);
    expect(after[1].deals[1].lastMessage).toEqual({
      id: "m-d1",
      content: "oi",
      createdAt: T0,
      direction: "in",
    });
    expect(after[0].totalCount).toBe(1);
    expect(after[1].totalCount).toBe(3);
    expect(invalidate).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("pipeline A → pipeline B: sai da origem e entra no destino", () => {
    const qc = new QueryClient();
    const originKey = ["pipeline-board", "pA", "OPEN"] as const;
    const destKey = ["pipeline-board", "pB", "OPEN"] as const;
    const otherKey = ["pipeline-board", "pC", "OPEN"] as const;
    const other = [stage("s-c", [deal("z", 0)])];
    qc.setQueryData(originKey, [stage("s-a", [deal("d1", 0)])]);
    qc.setQueryData(destKey, [stage("s-b", [deal("b", 0)])]);
    qc.setQueryData(otherKey, other);

    applyDealMoved(
      qc,
      moved({
        dealId: "d1",
        fromPipelineId: "pA",
        toPipelineId: "pB",
        fromStageId: "s-a",
        toStageId: "s-b",
        position: 0.5,
        card: {
          id: "d1",
          title: "Lead novo",
          status: "OPEN",
          position: 0.5,
          contact: { id: "c-d1", name: "Ana", email: null },
        },
      }),
    );

    expect(qc.getQueryData<BoardStageDto[]>(originKey)![0].deals).toEqual([]);
    const dest = qc.getQueryData<BoardStageDto[]>(destKey)!;
    expect(dest[0].deals.map((d) => d.id)).toEqual(["b", "d1"]);
    expect(dest[0].deals[1].title).toBe("d1");
    expect(dest[0].deals[1].lastMessage?.content).toBe("oi");
    expect(qc.getQueryData(otherKey)).toBe(other);
  });

  it("duas sessões: origem perde o card e destino ganha, sem cache do outro funil", () => {
    const origin = new QueryClient();
    const dest = new QueryClient();
    origin.setQueryData(["pipeline-board", "pA", "OPEN"], [stage("s-a", [deal("d1", 4)])]);
    dest.setQueryData(["pipeline-board", "pB", "OPEN"], [stage("s-b", [deal("b", 1)])]);

    const event = moved({
      dealId: "d1",
      fromPipelineId: "pA",
      toPipelineId: "pB",
      fromStageId: "s-a",
      toStageId: "s-b",
      position: 0,
      card: { id: "d1", title: "Entrou", status: "OPEN" },
    });
    applyDealMoved(origin, event);
    applyDealMoved(dest, event);

    expect(origin.getQueryData<BoardStageDto[]>(["pipeline-board", "pA", "OPEN"])![0].deals).toEqual(
      [],
    );
    expect(origin.getQueryData(["pipeline-board", "pB", "OPEN"])).toBeUndefined();
    expect(
      dest.getQueryData<BoardStageDto[]>(["pipeline-board", "pB", "OPEN"])![0].deals.map((d) => d.id),
    ).toEqual(["d1", "b"]);
    expect(dest.getQueryData<BoardStageDto[]>(["pipeline-board", "pB", "OPEN"])![0].deals[0].title).toBe(
      "Entrou",
    );
  });

  it("otimista já na coluna destino + SSE não duplica", () => {
    const qc = new QueryClient();
    const key = ["pipeline-board", "p1", "OPEN"] as const;
    const placed = deal("d1", 0);
    qc.setQueryData(key, [stage("s-a", [deal("fica", 1)]), stage("s-b", [deal("antes", 0), placed])]);

    applyDealMoved(
      qc,
      moved({
        dealId: "d1",
        fromPipelineId: "p1",
        toPipelineId: "p1",
        fromStageId: "s-a",
        toStageId: "s-b",
        position: 0.5,
      }),
    );

    const ids = qc.getQueryData<BoardStageDto[]>(key)!.flatMap((s) => s.deals.map((d) => d.id));
    expect(ids.filter((id) => id === "d1")).toEqual(["d1"]);
    expect(qc.getQueryData<BoardStageDto[]>(key)![1].deals.map((d) => d.id)).toEqual([
      "antes",
      "d1",
    ]);
  });

  it("cópia na origem e no destino colapsa num card só", () => {
    const qc = new QueryClient();
    const key = ["pipeline-board", "p1", "OPEN"] as const;
    qc.setQueryData(key, [
      stage("s-a", [deal("d1", 0)]),
      stage("s-b", [deal("d1", 0), deal("x", 1)]),
    ]);
    applyDealMoved(
      qc,
      moved({
        dealId: "d1",
        fromPipelineId: "p1",
        toPipelineId: "p1",
        fromStageId: "s-a",
        toStageId: "s-b",
        position: 2,
      }),
    );
    const after = qc.getQueryData<BoardStageDto[]>(key)!;
    expect(after.flatMap((s) => s.deals.map((d) => d.id)).filter((id) => id === "d1")).toEqual([
      "d1",
    ]);
    expect(after[1].deals.map((d) => d.id)).toEqual(["x", "d1"]);
  });

  it("evento repetido não duplica e não troca a referência do board", () => {
    const qc = new QueryClient();
    const key = ["pipeline-board", "p1", "OPEN"] as const;
    qc.setQueryData(key, [stage("s-a", [deal("d1", 0)]), stage("s-b", [deal("x", 1)])]);
    const event = moved({
      dealId: "d1",
      fromPipelineId: "p1",
      toPipelineId: "p1",
      fromStageId: "s-a",
      toStageId: "s-b",
      position: 2,
    });
    applyDealMoved(qc, event);
    const once = qc.getQueryData(key);
    expect(applyDealMoved(qc, event)).toBe(false);
    expect(qc.getQueryData(key)).toBe(once);
    expect(once).toBeDefined();
    const deals = (once as BoardStageDto[]).flatMap((s) => s.deals.filter((d) => d.id === "d1"));
    expect(deals).toHaveLength(1);
  });

  it("evento atrasado não desfaz um move mais novo", () => {
    const qc = new QueryClient();
    const key = ["pipeline-board", "p1", "OPEN"] as const;
    const board = [stage("s-b", [deal("d1", 3, { updatedAt: T2 })])];
    qc.setQueryData(key, board);
    expect(
      applyDealMoved(
        qc,
        moved({
          dealId: "d1",
          fromPipelineId: "p1",
          toPipelineId: "p1",
          fromStageId: "s-b",
          toStageId: "s-a",
          position: 0,
          updatedAt: T1,
        }),
      ),
    ).toBe(false);
    expect(qc.getQueryData(key)).toBe(board);
  });

  it("board OPEN solta o card que virou WON; o board ALL recebe", () => {
    const qc = new QueryClient();
    const openKey = ["pipeline-board", "p1", "OPEN"] as const;
    const allKey = ["pipeline-board", "p1", "ALL"] as const;
    qc.setQueryData(openKey, [stage("s-a", [deal("d1", 0)]), stage("s-won", [])]);
    qc.setQueryData(allKey, [stage("s-a", []), stage("s-won", [])]);
    applyDealMoved(
      qc,
      moved({
        dealId: "d1",
        fromPipelineId: "p1",
        toPipelineId: "p1",
        fromStageId: "s-a",
        toStageId: "s-won",
        position: 0,
        card: { id: "d1", title: "d1", status: "WON" },
      }),
    );
    expect(qc.getQueryData<BoardStageDto[]>(openKey)!.flatMap((s) => s.deals)).toEqual([]);
    expect(qc.getQueryData<BoardStageDto[]>(allKey)![1].deals.map((d) => d.status)).toEqual(["WON"]);
  });

  it("busca não ganha card que não estava no resultado", () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { structuralSharing: false } },
    });
    const searchKey = ["pipeline-board-search", "pB", "OPEN", "ana", "default", 200] as const;
    const search = [stage("s-b", [deal("ana", 0)])];
    qc.setQueryData(["pipeline-board", "pB", "OPEN"], [stage("s-b", [deal("b", 1)])]);
    qc.setQueryData(searchKey, search);
    applyDealMoved(
      qc,
      moved({
        dealId: "d1",
        fromPipelineId: "pA",
        toPipelineId: "pB",
        fromStageId: "s-a",
        toStageId: "s-b",
        position: 0,
        card: { id: "d1", title: "João", status: "OPEN" },
      }),
    );
    expect(qc.getQueryData(searchKey)).toBe(search);
    expect(
      qc.getQueryData<BoardStageDto[]>(["pipeline-board", "pB", "OPEN"])![0].deals.map((d) => d.id),
    ).toEqual(["d1", "b"]);
  });

  it("funil que não está no evento permanece a mesma referência", () => {
    const qc = new QueryClient();
    const other = [stage("s-z", [deal("z", 0)])];
    const otherKey = ["pipeline-board", "pZ", "OPEN"] as const;
    qc.setQueryData(["pipeline-board", "p1", "OPEN"], [stage("s-a", [deal("d1", 0)]), stage("s-b", [])]);
    qc.setQueryData(otherKey, other);
    applyDealMoved(
      qc,
      moved({
        dealId: "d1",
        fromPipelineId: "p1",
        toPipelineId: "p1",
        fromStageId: "s-a",
        toStageId: "s-b",
        position: 0,
      }),
    );
    expect(qc.getQueryData(otherKey)).toBe(other);
  });

  it("sort por criação não reordena os cards que ficaram na coluna", () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { structuralSharing: false } },
    });
    const key = ["pipeline-board", "p1", "OPEN", "createdAt:desc"] as const;
    const older = deal("old", 0, { createdAt: T0 });
    const newer = deal("new", 1, { createdAt: T2 });
    qc.setQueryData(key, [
      stage("s-a", [deal("d1", 5, { createdAt: T1 })]),
      stage("s-b", [newer, older]),
    ]);
    applyDealMoved(
      qc,
      moved({
        dealId: "d1",
        fromPipelineId: "p1",
        toPipelineId: "p1",
        fromStageId: "s-a",
        toStageId: "s-b",
        position: 9,
      }),
    );
    const dest = qc.getQueryData<BoardStageDto[]>(key)![1].deals;
    expect(dest.map((d) => d.id)).toEqual(["new", "d1", "old"]);
    expect(dest[0]).toBe(newer);
    expect(dest[2]).toBe(older);
  });

  describe("negócio criado (sem origem)", () => {
    const card = {
      id: "novo",
      title: "Lead novo",
      status: "OPEN",
      position: 1.5,
      contact: { id: "c-novo", name: "Ana", email: null },
    };
    const created = (extra: Partial<RealtimePayload<"deal_moved">> = {}) =>
      moved({
        dealId: "novo",
        fromPipelineId: null,
        toPipelineId: "p1",
        fromStageId: null,
        toStageId: "s-b",
        position: 1.5,
        ownerId: null,
        card,
        ...extra,
      });
    const filteredKey = ["pipeline-board-filtered", "p1", "OPEN", '{"tagIds":["t1"]}', "default", 50] as const;
    const searchKey = ["pipeline-board-search", "p1", "OPEN", "ana", "default", 200] as const;

    function boards(qc: QueryClient) {
      const paged = [stage("s-a", [deal("a", 0)]), stage("s-b", [deal("b1", 1), deal("b2", 2)], { totalCount: 40 })];
      qc.setQueryData(["pipeline-board", "p1", "OPEN"], paged);
      return paged;
    }

    it("fromStageId null: entra na etapa certa pela position, o total da etapa sobe, sem GET", () => {
      const qc = new QueryClient({ defaultOptions: { queries: { structuralSharing: false } } });
      const paged = boards(qc);
      const invalidate = vi.spyOn(qc, "invalidateQueries");
      const refetch = vi.spyOn(qc, "refetchQueries");

      expect(applyDealMoved(qc, created())).toBe(true);

      const after = qc.getQueryData<BoardStageDto[]>(["pipeline-board", "p1", "OPEN"])!;
      expect(after[0]).toBe(paged[0]);
      expect(after[1].deals.map((d) => d.id)).toEqual(["b1", "novo", "b2"]);
      expect(after[1].deals[1]).toMatchObject({ title: "Lead novo", status: "OPEN", position: 1.5 });
      expect(after[1].totalCount).toBe(41);
      expect(invalidate).not.toHaveBeenCalled();
      expect(refetch).not.toHaveBeenCalled();
    });

    it("card com número: o negócio inserido mostra #número, não o prefixo do id", () => {
      const qc = new QueryClient();
      boards(qc);

      applyDealMoved(qc, created({ card: { ...card, id: "cmv3abc", number: 49338 }, dealId: "cmv3abc" }));

      const inserted = qc
        .getQueryData<BoardStageDto[]>(["pipeline-board", "p1", "OPEN"])![1]
        .deals.find((d) => d.id === "cmv3abc")!;
      expect(inserted.number).toBe(49338);
      expect(toDealCard(inserted).dealNumber).toBe("#49338");
    });

    it("card sem número (backend antigo) ou com número nulo: mantém o prefixo do id", () => {
      for (const extra of [{}, { number: null }]) {
        const qc = new QueryClient();
        boards(qc);

        applyDealMoved(qc, created({ card: { ...card, id: "cmv3abc", ...extra }, dealId: "cmv3abc" }));

        const inserted = qc
          .getQueryData<BoardStageDto[]>(["pipeline-board", "p1", "OPEN"])![1]
          .deals.find((d) => d.id === "cmv3abc")!;
        expect(inserted.number).toBeUndefined();
        expect(toDealCard(inserted).dealNumber).toBe("#cmv3");
      }
    });

    it("forma alternativa: fromStageId ausente + created: true", () => {
      const qc = new QueryClient();
      boards(qc);
      const event = created();
      delete event.fromStageId;
      delete event.fromPipelineId;

      expect(applyDealMoved(qc, { ...event, created: true })).toBe(true);
      const after = qc.getQueryData<BoardStageDto[]>(["pipeline-board", "p1", "OPEN"])!;
      expect(after[1].deals.map((d) => d.id)).toEqual(["b1", "novo", "b2"]);
    });

    it("evento repetido não duplica nem soma o total duas vezes", () => {
      const qc = new QueryClient();
      boards(qc);
      applyDealMoved(qc, created());
      const once = qc.getQueryData(["pipeline-board", "p1", "OPEN"]);
      expect(applyDealMoved(qc, created())).toBe(false);
      expect(qc.getQueryData(["pipeline-board", "p1", "OPEN"])).toBe(once);
      expect((once as BoardStageDto[])[1].totalCount).toBe(41);
    });

    it("board filtrado do funil recebe o card e pede recarga adiada; busca não recebe", () => {
      const qc = new QueryClient();
      boards(qc);
      const filtered = [stage("s-a", []), stage("s-b", [deal("b1", 1)])];
      const search = [stage("s-a", []), stage("s-b", [deal("ana", 0)])];
      qc.setQueryData(filteredKey, filtered);
      qc.setQueryData(searchKey, search);

      const result = applyDealMovedToBoards(qc, created());

      expect(result.wrote).toBe(true);
      expect(result.filteredRefresh).toEqual(["p1"]);
      expect(qc.getQueryData<BoardStageDto[]>(filteredKey)![1].deals.map((d) => d.id)).toEqual([
        "b1",
        "novo",
      ]);
      expect(qc.getQueryData(searchKey)).toBe(search);
    });

    it("move comum (com origem) não entra no board filtrado nem pede recarga", () => {
      const qc = new QueryClient();
      boards(qc);
      const filtered = [stage("s-a", []), stage("s-b", [])];
      qc.setQueryData(filteredKey, filtered);

      const result = applyDealMovedToBoards(
        qc,
        created({ fromStageId: "s-x", fromPipelineId: "p9" }),
      );

      expect(result.filteredRefresh).toEqual([]);
      expect(qc.getQueryData(filteredKey)).toBe(filtered);
    });

    it("sem card (lote acima do teto, ou usuário que não vê o negócio): nada entra", () => {
      const qc = new QueryClient();
      const paged = boards(qc);
      const event = created();
      delete event.card;

      expect(applyDealMovedToBoards(qc, event)).toEqual({ wrote: false, filteredRefresh: [] });
      expect(qc.getQueryData(["pipeline-board", "p1", "OPEN"])).toBe(paged);
    });

    it("board de WON não recebe o negócio criado aberto", () => {
      const qc = new QueryClient();
      const won = [stage("s-a", []), stage("s-b", [])];
      qc.setQueryData(["pipeline-board", "p1", "WON"], won);

      applyDealMoved(qc, created());
      expect(qc.getQueryData(["pipeline-board", "p1", "WON"])).toBe(won);
    });
  });

  it("automação (mesmo deal_moved): a outra sessão atualiza sem GET e sem duplicar", () => {
    const other = new QueryClient({
      defaultOptions: { queries: { structuralSharing: false } },
    });
    const key = ["pipeline-board", "p1", "OPEN"] as const;
    other.setQueryData(key, [stage("s-a", [deal("d1", 4)]), stage("s-b", [deal("x", 0), deal("y", 2)])]);
    const invalidate = vi.spyOn(other, "invalidateQueries");
    const refetch = vi.spyOn(other, "refetchQueries");
    const event = moved({
      dealId: "d1",
      fromPipelineId: "p1",
      toPipelineId: "p1",
      fromStageId: "s-a",
      toStageId: "s-b",
      position: 1,
      updatedAt: T1,
    });

    applyDealMoved(other, event);
    const once = other.getQueryData(key);
    expect(applyDealMoved(other, event)).toBe(false);
    expect(other.getQueryData(key)).toBe(once);

    const board = once as BoardStageDto[];
    expect(board[0].deals.map((d) => d.id)).toEqual([]);
    expect(board[1].deals.map((d) => d.id)).toEqual(["x", "d1", "y"]);
    expect(board.flatMap((s) => s.deals.filter((d) => d.id === "d1"))).toHaveLength(1);
    expect(invalidate).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
  });
});
