"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  addDealTag,
  createDeal,
  deleteDeal,
  getDealTimeline,
  listTags,
  moveDeal,
  removeDealTag,
  setDealStatus,
  updateDeal,
  type BoardDealDto,
  type BoardStageDto,
  type CreateDealPayload,
  type DealStatus,
  type DealTag,
  type DealTimelineEvent,
  type StatusFilter,
  type TeamUser,
  type UpdateDealPayload,
} from "../api";
import { boardKey } from "./use-board";
import { dealDetailKey } from "./use-deal-detail";

import { useTeamUsersQuery } from "@/features/shared/queries/team-users";

export interface MoveVars {
  dealId: string;
  fromStageId: string;
  toStageId: string;
  toIndex?: number;
  /** Motivo da perda — obrigatório no fluxo de mover para o estágio Perdido. */
  lostReason?: string;
  /**
   * Funil de destino quando diferente do atual — usado para invalidar
   * o cache do board do funil destino após a mutação e desabilitar o
   * update otimista local (que assume board único).
   */
  toPipelineId?: string | null;
}

/**
 * Move um deal entre estágios — com update otimista do cache do
 * board ativo. Em erro, reverte ao snapshot anterior.
 */
export function useMoveDeal(pipelineId: string | null, status: StatusFilter = "OPEN") {
  const qc = useQueryClient();
  const key = boardKey(pipelineId, status);

  // Bug 18/jul/26 — a aside do deal (Pipeline + Inbox) mostrava o toast
  // "Fase atualizada" mas continuava exibindo a fase antiga ate F5. Causa:
  // o `_v2-client` do pipeline monta o board com 3 query keys distintas
  // (`pipeline-board`, `pipeline-board-filtered`, `pipeline-board-search`)
  // dependendo de sort/filtro/busca ativos, e o `onMutate`/`onSettled` so'
  // enxergava a variante `pipeline-board`. Otimista era descartado e o
  // refetch ignorava as outras variantes. Solucao: aplicar o otimista em
  // TODAS as caches do tipo `BoardStageDto[]` que contenham o deal e
  // refetch por predicate cobrindo todas as variantes.
  const BOARD_KEY_PREFIXES = [
    "pipeline-board",
    "pipeline-board-filtered",
    "pipeline-board-search",
  ] as const;

  function isBoardCacheKey(k: readonly unknown[]): boolean {
    return typeof k[0] === "string" && (BOARD_KEY_PREFIXES as readonly string[]).includes(k[0] as string);
  }

  function applyOptimisticMove(
    stages: BoardStageDto[],
    vars: MoveVars,
  ): { next: BoardStageDto[]; matched: boolean } {
    const dealIsHere = stages.some((s) => s.deals.some((d) => d.id === vars.dealId));
    if (!dealIsHere) return { next: stages, matched: false };
    const next = stages.map((s) => ({ ...s, deals: [...s.deals] }));
    const fromIdx = next.findIndex((s) => s.id === vars.fromStageId);
    const toIdx = next.findIndex((s) => s.id === vars.toStageId);
    // Cross-pipeline (destino fora do board): so' remove do estagio origem.
    if (fromIdx !== -1 && toIdx === -1) {
      const dealIdx = next[fromIdx].deals.findIndex((d) => d.id === vars.dealId);
      if (dealIdx !== -1) {
        next[fromIdx].deals.splice(dealIdx, 1);
        next[fromIdx].totalCount =
          (next[fromIdx].totalCount ?? next[fromIdx].deals.length + 1) - 1;
      }
      return { next, matched: true };
    }
    if (fromIdx === -1 || toIdx === -1) return { next: stages, matched: false };
    const dealIdx = next[fromIdx].deals.findIndex((d) => d.id === vars.dealId);
    if (dealIdx === -1) return { next: stages, matched: false };
    const [moved] = next[fromIdx].deals.splice(dealIdx, 1);
    const insertAt = vars.toIndex ?? next[toIdx].deals.length;
    next[toIdx].deals.splice(Math.min(insertAt, next[toIdx].deals.length), 0, moved);
    next[fromIdx].totalCount = (next[fromIdx].totalCount ?? next[fromIdx].deals.length + 1) - 1;
    next[toIdx].totalCount = (next[toIdx].totalCount ?? next[toIdx].deals.length - 1) + 1;
    return { next, matched: true };
  }

  return useMutation<
    { deal: BoardDealDto },
    Error,
    MoveVars,
    { snapshots: Array<{ queryKey: readonly unknown[]; data: BoardStageDto[] }> }
  >({
    mutationFn: (vars) => {
      // Backend exige `position` (inteiro >= 0). Quando o caller nao
      // sabe a posicao (ex.: StagePicker do detail panel), calculamos
      // o "fim da coluna destino" a partir do cache atual. Para moves
      // cross-pipeline, o board do funil destino pode nao estar
      // carregado — usamos posicao 0 como fallback (backend clampa).
      let pos = vars.toIndex;
      if (pos == null) {
        const board = qc.getQueryData<BoardStageDto[]>(key);
        const target = board?.find((s) => s.id === vars.toStageId);
        if (target) {
          const hasSelf = target.deals.some((d) => d.id === vars.dealId);
          pos = Math.max(0, target.deals.length - (hasSelf ? 1 : 0));
        } else {
          pos = 0;
        }
      }
      return moveDeal(vars.dealId, {
        stageId: vars.toStageId,
        position: pos,
        lostReason: vars.lostReason,
      });
    },
    onMutate: async (vars) => {
      // Cancela refetches em voo de qualquer variante do board pra evitar
      // que uma resposta stale sobrescreva o otimista logo apos aplicado.
      await qc.cancelQueries({
        predicate: (q) => isBoardCacheKey(q.queryKey),
      });
      const snapshots: Array<{ queryKey: readonly unknown[]; data: BoardStageDto[] }> = [];
      const boards = qc.getQueriesData<BoardStageDto[]>({
        predicate: (q) => isBoardCacheKey(q.queryKey),
      });
      for (const [queryKey, data] of boards) {
        if (!data) continue;
        const { next, matched } = applyOptimisticMove(data, vars);
        if (!matched) continue;
        snapshots.push({ queryKey, data });
        qc.setQueryData(queryKey, next);
      }
      return { snapshots };
    },
    onError: (err, _vars, ctx) => {
      // Rollback: restaura TODAS as caches que foram tocadas no otimista.
      if (ctx?.snapshots) {
        for (const snap of ctx.snapshots) {
          qc.setQueryData(snap.queryKey, snap.data);
        }
      }
      toast.error(err.message || "Falha ao mover deal");
    },
    onSuccess: (data, vars) => {
      // IB1: feedback visivel — antes a UI atualizava (ou nao) sem
      // qualquer toast e o operador nao tinha certeza de que tinha
      // funcionado. O backend POST /move retorna o deal direto
      // (NextResponse.json(deal)) — nao envelopado em { deal }. O
      // tipo do front diz `{ deal: BoardDealDto }`, mas na pratica
      // o campo `stage.name` e `stage.pipeline` vem no nivel raiz.
      const root = data as
        | {
            stage?: { name?: string; pipeline?: { id?: string; name?: string } | null };
            deal?: { stage?: { name?: string; pipeline?: { id?: string; name?: string } | null } };
          }
        | undefined;
      const toStage = root?.stage ?? root?.deal?.stage;
      const toName = toStage?.name ?? null;
      const toPipeName = toStage?.pipeline?.name ?? null;
      const crossPipeline =
        !!vars.toPipelineId && vars.toPipelineId !== pipelineId;
      toast.success(
        crossPipeline && toPipeName
          ? `Movido para "${toPipeName} → ${toName ?? "fase"}"`
          : toName
            ? `Fase atualizada para "${toName}"`
            : "Fase atualizada",
      );
    },
    onSettled: (_data, _err, vars) => {
      // Refetch de TODAS as variantes do board (normal + filtered + search),
      // ativas — o `_v2-client` alterna entre elas conforme sort/filtros/busca
      // e o refetch por prefixo unico deixava a UI com dado stale ate F5.
      qc.refetchQueries({
        type: "active",
        predicate: (q) => isBoardCacheKey(q.queryKey),
      });
      qc.refetchQueries({ queryKey: ["contact-sidebar"], type: "active" });
      qc.refetchQueries({ queryKey: dealDetailKey(vars.dealId), type: "active" });
      // Boards inativos (aberto em outra aba/tela) so' marcam stale.
      qc.invalidateQueries({
        type: "inactive",
        predicate: (q) => isBoardCacheKey(q.queryKey),
      });
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// updateDeal — usado pelo AssigneePopover (ownerId), inline-edit de
// Origem/Previsão/Notas e qualquer outro campo escalar do deal.
// ─────────────────────────────────────────────────────────────────

interface UpdateDealVars {
  dealId: string;
  payload: UpdateDealPayload;
}

type BoardOwner = BoardDealDto["owner"];

/**
 * PUT /api/deals/:id responde com o deal na RAIZ (`NextResponse.json(deal)`),
 * não envelopado em `{ deal }`. O tipo do client diz `{ deal }` por legado,
 * então normalizamos aqui antes de ler o `owner`.
 */
function ownerFromUpdateResponse(data: unknown): BoardOwner | undefined {
  const root = data as { owner?: BoardOwner; deal?: { owner?: BoardOwner } } | null;
  if (!root) return undefined;
  if (root.deal && "owner" in root.deal) return root.deal.owner ?? null;
  if ("owner" in root) return root.owner ?? null;
  return undefined;
}

export function useUpdateDeal(pipelineId: string | null, status: StatusFilter = "OPEN") {
  const qc = useQueryClient();
  const key = boardKey(pipelineId, status);
  const BOARD_KEY_PREFIXES = [
    "pipeline-board",
    "pipeline-board-filtered",
    "pipeline-board-search",
  ] as const;

  function isBoardKey(k: readonly unknown[]): boolean {
    return (
      typeof k[0] === "string" &&
      (BOARD_KEY_PREFIXES as readonly string[]).includes(k[0] as string)
    );
  }

  /** Escreve o owner do deal em TODAS as variantes de board em cache. */
  function patchOwnerInBoards(
    dealId: string,
    owner: BoardOwner,
  ): Array<{ queryKey: readonly unknown[]; data: BoardStageDto[] }> {
    const snapshots: Array<{ queryKey: readonly unknown[]; data: BoardStageDto[] }> = [];
    const boards = qc.getQueriesData<BoardStageDto[]>({
      predicate: (q) => isBoardKey(q.queryKey),
    });
    for (const [queryKey, data] of boards) {
      if (!Array.isArray(data)) continue;
      let touched = false;
      const next = data.map((stage) => ({
        ...stage,
        deals: stage.deals.map((d) => {
          if (d.id !== dealId) return d;
          touched = true;
          return { ...d, owner };
        }),
      }));
      if (!touched) continue;
      snapshots.push({ queryKey, data });
      qc.setQueryData(queryKey, next);
    }
    return snapshots;
  }

  return useMutation<
    { deal: BoardDealDto },
    Error,
    UpdateDealVars,
    { snapshots: Array<{ queryKey: readonly unknown[]; data: BoardStageDto[] }> }
  >({
    mutationFn: ({ dealId, payload }) => updateDeal(dealId, payload),
    onMutate: async (vars) => {
      if (vars.payload.ownerId === undefined) return { snapshots: [] };
      await qc.cancelQueries({ predicate: (q) => isBoardKey(q.queryKey) });
      const nextOwner =
        vars.payload.ownerId === null
          ? null
          : { id: vars.payload.ownerId, name: "…", avatarUrl: null as string | null };
      return { snapshots: patchOwnerInBoards(vars.dealId, nextOwner) };
    },
    onSuccess: (data, vars) => {
      // Escreve o owner REAL (com nome/avatar) vindo da resposta antes de
      // qualquer refetch. Sem isso o card dependia só do GET /board, que
      // pode voltar de cache-aside e reverter a troca de responsável.
      if (vars.payload.ownerId !== undefined) {
        const owner = ownerFromUpdateResponse(data);
        if (owner !== undefined) patchOwnerInBoards(vars.dealId, owner);
        toast.success(
          vars.payload.ownerId === null
            ? "Responsável removido"
            : `Responsável: ${owner?.name ?? "atualizado"}`,
        );
      }
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: dealDetailKey(vars.dealId) });
    },
    onError: (err, _vars, ctx) => {
      // Rollback exato — invalidar aqui refetcharia o board e reintroduziria
      // a race que o otimista tenta evitar.
      if (ctx?.snapshots) {
        for (const s of ctx.snapshots) qc.setQueryData(s.queryKey, s.data);
      }
      toast.error(err.message || "Falha ao atualizar negocio");
    },
    onSettled: (_data, _err, vars) => {
      // Reconciliação: refetch das variantes ATIVAS (invalidate sozinho só
      // marca stale nas inativas e deixava a visível sem atualizar).
      qc.refetchQueries({ type: "active", predicate: (q) => isBoardKey(q.queryKey) });
      qc.invalidateQueries({ type: "inactive", predicate: (q) => isBoardKey(q.queryKey) });
      qc.invalidateQueries({ queryKey: dealDetailKey(vars.dealId) });
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// status do deal — botões Ganhar / Perder / Reabrir
// ─────────────────────────────────────────────────────────────────

interface SetStatusVars {
  dealId: string;
  status: DealStatus;
  lostReason?: string;
}

export function useSetDealStatus(pipelineId: string | null, status: StatusFilter = "OPEN") {
  const qc = useQueryClient();
  const key = boardKey(pipelineId, status);

  return useMutation<{ deal: BoardDealDto }, Error, SetStatusVars>({
    mutationFn: (vars) =>
      setDealStatus(vars.dealId, { status: vars.status, lostReason: vars.lostReason }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: dealDetailKey(vars.dealId) });
      const label =
        vars.status === "WON" ? "Negocio marcado como ganho" :
        vars.status === "LOST" ? "Negocio marcado como perdido" :
        "Negocio reaberto";
      toast.success(label);
    },
    onError: (err) => toast.error(err.message || "Falha ao alterar status"),
  });
}

// ─────────────────────────────────────────────────────────────────
// tags do deal
// ─────────────────────────────────────────────────────────────────

export function useDealTags(enabled = true) {
  return useQuery<DealTag[]>({
    queryKey: ["deal-tags-v2"],
    queryFn: listTags,
    staleTime: 60_000,
    enabled,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Chaves de cache que carregam `BoardStageDto[]` — precisamos cobrir
 * todas porque o board visível pode vir de qualquer uma dependendo do
 * modo (normal, busca, filtros avançados). Patchar/invalidar só a
 * regular deixava o clique do popover de tags "invertendo" (add↔remove)
 * porque `currentIds` derivava de cache stale.
 */
const BOARD_CACHE_KEYS = [
  ["pipeline-board"],
  ["pipeline-board-search"],
  ["pipeline-board-filtered"],
] as const;

/**
 * Patcha tags de um deal em TODOS os caches de board (regular, busca,
 * filtrado). Usado por add/remove tag pra update otimista instantâneo.
 * Retorna snapshots (`queryKey` + `data` originais) pra rollback exato
 * em `onError` — invalidar dispararia refetch e re-introduziria a race
 * que este mecanismo tenta evitar.
 */
function patchDealTagsInBoards(
  qc: ReturnType<typeof useQueryClient>,
  dealId: string,
  patch: (
    tags: { id: string; name: string; color: string }[],
  ) => { id: string; name: string; color: string }[],
): Array<{ queryKey: readonly unknown[]; data: BoardStageDto[] }> {
  const snapshots: Array<{ queryKey: readonly unknown[]; data: BoardStageDto[] }> = [];
  for (const rootKey of BOARD_CACHE_KEYS) {
    const boards = qc.getQueriesData<BoardStageDto[]>({ queryKey: rootKey });
    for (const [key, data] of boards) {
      if (!Array.isArray(data)) continue;
      let touched = false;
      const next = data.map((stage) => {
        const nextDeals = stage.deals.map((d) => {
          if (d.id !== dealId) return d;
          touched = true;
          return { ...d, tags: patch(d.tags ?? []) };
        });
        return { ...stage, deals: nextDeals };
      });
      if (touched) {
        snapshots.push({ queryKey: key, data });
        qc.setQueryData(key, next);
      }
    }
  }
  return snapshots;
}

/** Invalida todos os caches de board (regular, busca, filtrado). */
function invalidateAllBoards(qc: ReturnType<typeof useQueryClient>) {
  for (const rootKey of BOARD_CACHE_KEYS) {
    qc.invalidateQueries({ queryKey: rootKey });
  }
}

/**
 * Cancela refetches em voo em TODOS os caches de board.
 *
 * Bug 25/jul/26 — o `useBoard` mantém `refetchInterval: 30_000` (poll).
 * Se um refetch periódico (ou de invalidação concorrente de outra mutação)
 * estiver em voo no exato momento em que o usuário clica numa tag, sua
 * resposta stale (pré-mutação) aterrissa DEPOIS do patch otimista e
 * sobrescreve o cache — o card visualmente reverte, depois o `onSettled`
 * refeta e volta ao estado final. Efeito descrito pelo operador: "clico
 * uma vez e a tag some / volta / some" (a "ação dobrada"). Cancelar as
 * queries antes do patch elimina essa janela — mesma estratégia usada em
 * `useMoveDeal`.
 */
async function cancelAllBoards(qc: ReturnType<typeof useQueryClient>) {
  for (const rootKey of BOARD_CACHE_KEYS) {
    await qc.cancelQueries({ queryKey: rootKey });
  }
}

type TagMutationContext = {
  snapshots: Array<{ queryKey: readonly unknown[]; data: BoardStageDto[] }>;
};

export function useAddDealTag(_pipelineId: string | null, _status: StatusFilter = "OPEN") {
  const qc = useQueryClient();

  return useMutation<
    { ok: true },
    Error,
    { dealId: string; tagId?: string; tagName?: string; color?: string },
    TagMutationContext
  >({
    mutationFn: ({ dealId, ...payload }) => addDealTag(dealId, payload),
    // Update otimista: se `tagId` foi passado (tag existente), buscamos
    // nome/cor do catálogo em cache e injetamos no card imediatamente.
    // Para `tagName` (criação), pulamos o otimista — o refetch cuida.
    onMutate: async (vars) => {
      // Cancela refetches em voo (poll de 30s / invalidações concorrentes)
      // ANTES de patchar — evita que uma resposta stale sobrescreva o
      // otimista e cause a "ação dobrada" visual.
      await cancelAllBoards(qc);
      if (!vars.tagId) return { snapshots: [] };
      const catalog =
        qc.getQueryData<DealTag[]>(["deal-tags-v2"]) ??
        qc.getQueryData<DealTag[]>(["tags"]) ??
        [];
      const meta = catalog.find((t) => t.id === vars.tagId);
      if (!meta) return { snapshots: [] };
      const snapshots = patchDealTagsInBoards(qc, vars.dealId, (tags) =>
        tags.some((t) => t.id === vars.tagId!)
          ? tags
          : [
              ...tags,
              {
                id: vars.tagId!,
                name: meta.name,
                color: (meta.color ?? "#6366f1") as string,
              },
            ],
      );
      return { snapshots };
    },
    onError: (err, _vars, ctx) => {
      // Rollback exato via snapshot — invalidar aqui dispararia refetch
      // e o cache mostraria "vaziando" antes de voltar, reintroduzindo a
      // race que estamos evitando.
      if (ctx?.snapshots) {
        for (const s of ctx.snapshots) qc.setQueryData(s.queryKey, s.data);
      }
      toast.error(err.message || "Falha ao adicionar tag");
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["deal-tags-v2"] });
      qc.invalidateQueries({ queryKey: dealDetailKey(vars.dealId) });
      invalidateAllBoards(qc);
    },
  });
}

export function useRemoveDealTag(_pipelineId: string | null, _status: StatusFilter = "OPEN") {
  const qc = useQueryClient();

  return useMutation<
    { ok: true },
    Error,
    { dealId: string; tagId: string },
    TagMutationContext
  >({
    mutationFn: ({ dealId, tagId }) => removeDealTag(dealId, tagId),
    onMutate: async (vars) => {
      await cancelAllBoards(qc);
      const snapshots = patchDealTagsInBoards(qc, vars.dealId, (tags) =>
        tags.filter((t) => t.id !== vars.tagId),
      );
      return { snapshots };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshots) {
        for (const s of ctx.snapshots) qc.setQueryData(s.queryKey, s.data);
      }
      toast.error(err.message || "Falha ao remover tag");
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: dealDetailKey(vars.dealId) });
      invalidateAllBoards(qc);
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// usuários (team picker)
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// create / delete deal
// ─────────────────────────────────────────────────────────────────

export function useCreateDeal(pipelineId: string | null, status: StatusFilter = "OPEN") {
  const qc = useQueryClient();
  const key = boardKey(pipelineId, status);
  return useMutation<{ deal: BoardDealDto }, Error, CreateDealPayload>({
    mutationFn: (payload) => createDeal(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Negocio criado");
    },
    onError: (err) => toast.error(err.message || "Falha ao criar negocio"),
  });
}

export function useDeleteDeal(pipelineId: string | null, status: StatusFilter = "OPEN") {
  const qc = useQueryClient();
  const key = boardKey(pipelineId, status);
  return useMutation<void, Error, { dealId: string }>({
    mutationFn: ({ dealId }) => deleteDeal(dealId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: dealDetailKey(vars.dealId) });
      toast.success("Negocio excluido");
    },
    onError: (err) => toast.error(err.message || "Falha ao excluir negocio"),
  });
}

export function useTeamUsers(enabled: boolean = true, opts?: { includeAi?: boolean }) {
  // Key canônica compartilhada (inbox-v2, settings, automações…) — dedupe
  // GET /api/users quando várias telas montam juntas.
  return useTeamUsersQuery<TeamUser>(enabled, opts);
}

// ─────────────────────────────────────────────────────────────────
// timeline do deal (tab Timeline do DealDetailPanel)
// ─────────────────────────────────────────────────────────────────

export function useDealTimeline(dealId: string | null) {
  return useQuery<DealTimelineEvent[]>({
    queryKey: ["deal-timeline-v2", dealId],
    queryFn: () => getDealTimeline(dealId as string),
    enabled: !!dealId,
    staleTime: 15_000,
  });
}
