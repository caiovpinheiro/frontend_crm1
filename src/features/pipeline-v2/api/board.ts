/*
 * Endpoints do Kanban v2.
 *
 * Espelha exatamente as URLs usadas pela tela legada
 * (`/api/pipelines/:id/board` GET com `?status=OPEN`) — preserva o
 * cache compartilhado por query key.
 */

import { apiUrl } from "@/lib/api";

import type { AdvancedDealFilters } from "@/components/pipeline/kanban-filters/types";

import type { BoardStageDto, PipelineListItemDto, StatusFilter } from "./types";

/** GET /api/pipelines */
export async function listPipelines(): Promise<PipelineListItemDto[]> {
  const res = await fetch(apiUrl("/api/pipelines"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar pipelines",
    );
  }
  return Array.isArray(data) ? data : data.pipelines ?? data.items ?? [];
}

/**
 * POST /api/pipelines/:id/archive — soft-archive do pipeline (ADMIN only).
 *
 * Exige senha de login no corpo (reautenticação); backend responde 403 se a
 * senha estiver errada e 409 se for o último pipeline restante. O pipeline
 * some das listagens (`listPipelines`/board) após sucesso, mas os dados
 * (stages/deals) permanecem no banco — não é um DELETE definitivo.
 */
export async function archivePipeline(pipelineId: string, password: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}/archive`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const fallback =
      res.status === 403
        ? "Senha incorreta."
        : res.status === 409
          ? "Não é possível apagar o único pipeline restante."
          : "Erro ao apagar pipeline.";
    throw new Error(typeof data?.message === "string" ? data.message : fallback);
  }
}

/**
 * Ordenação opcional dos cards dentro de cada coluna. Quando omitida,
 * o backend cai no default histórico (`position asc` = ordem manual
 * de drag-and-drop). Espelha os params aceitos pelo route handler em
 * `backend_crm1/src/app/api/pipelines/[id]/board/route.ts`.
 *
 * Hoje o frontend usa dois campos server-side:
 *   - `field: "createdAt"` — opções `created_newest`/`created_oldest`
 *     do kebab "Ordenar cards".
 *   - `field: "lastInteraction"` — opções `interaction_newest`/
 *     `interaction_oldest` (última atualização da conversa do contato).
 *
 * Para os demais sorts (`name_*`) a ordenação continua client-side
 * porque o backend ainda não suporta esses campos.
 */
export interface BoardSortParam {
  field: "createdAt" | "lastInteraction";
  direction: "asc" | "desc";
}

/** GET /api/pipelines/:id/board?status=OPEN[&sort=createdAt&direction=desc][&perStage=50] */
export async function getBoard(
  pipelineId: string,
  status: StatusFilter = "OPEN",
  sort?: BoardSortParam,
  perStage?: number,
): Promise<BoardStageDto[]> {
  const params = new URLSearchParams();
  if (status !== "OPEN") params.set("status", status);
  if (sort) {
    params.set("sort", sort.field);
    params.set("direction", sort.direction);
  }
  if (perStage) params.set("perStage", String(perStage));
  const q = params.toString();
  const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}/board${q ? `?${q}` : ""}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar quadro",
    );
  }
  if (Array.isArray(data)) return data as BoardStageDto[];
  return (Array.isArray(data.stages) ? data.stages : []) as BoardStageDto[];
}

/**
 * POST /api/pipelines/:id/board — busca/filtragem server-side varrendo
 * TODO o pipeline (não só os 100 primeiros por coluna do GET).
 *
 * Por que existe: o GET pagina 100 deals por coluna; quando a busca é
 * client-side em cima do que já carregou, deals nas posições 101+ nunca
 * aparecem (ex.: deal #4129 em coluna com 671 cards). O POST aceita
 * `filters.search` e usa `findContactIdsByPhoneDigits` server-side
 * (telefone normalizado) + match em `Deal.number` quando numérico —
 * achados que o filtro client-side jamais conseguiria.
 *
 * Modo de uso (de `useBoardSearch`): ativar SÓ quando há termo de busca
 * digitado (≥3 chars + debounce). Sem busca, continuar usando `getBoard`.
 */
export async function getBoardFiltered(
  pipelineId: string,
  opts: {
    status?: StatusFilter;
    filters?: AdvancedDealFilters;
    sort?: BoardSortParam;
    perStage?: number;
    /** "Carregar mais" cumulativo: stageId → quantos cards além de `perStage`. */
    offsetByStage?: Record<string, number>;
    signal?: AbortSignal;
  },
): Promise<BoardStageDto[]> {
  const body: Record<string, unknown> = {};
  // Espelha o GET /board: default OPEN. Nunca promover OPEN → ALL
  // (bug 24/jul/26: isso varria WON+LOST e explodia CPU/DB no POST).
  body.status = opts.status ?? "OPEN";
  if (opts.filters) body.filters = opts.filters;
  if (opts.sort) {
    body.sort = opts.sort.field;
    body.direction = opts.sort.direction;
  }
  if (opts.perStage) body.perStage = opts.perStage;
  if (opts.offsetByStage && Object.keys(opts.offsetByStage).length > 0) {
    body.offsetByStage = opts.offsetByStage;
  }

  const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}/board`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao buscar no quadro",
    );
  }
  if (Array.isArray(data)) return data as BoardStageDto[];
  return (Array.isArray(data.stages) ? data.stages : []) as BoardStageDto[];
}

/** PUT /api/pipelines/:id/stages — mesma carga de Configurações (`stageIds`). */
export async function reorderPipelineStages(
  pipelineId: string,
  stageIds: string[],
): Promise<void> {
  const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}/stages`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ stageIds }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Não foi possível reordenar as etapas.",
    );
  }
}

