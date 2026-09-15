/*
 * Tipos compartilhados pela camada de API do /pipeline/kanban-v2.
 * Espelham os DTOs reais do backend (mantemos o shape exato usado
 * pelo `/api/pipelines/:id/board` para preservar invalidação cruzada
 * com a tela legada).
 */

export type StatusFilter = "OPEN" | "WON" | "LOST" | "ALL";

export interface BoardDealDto {
  id: string;
  number?: number;
  title: string;
  value: number | string;
  status: string;
  /** Motivo da perda (tabulação) — preenchido quando status = LOST. */
  lostReason?: string | null;
  position: number;
  expectedClose: string | null;
  createdAt: string;
  updatedAt: string;
  isRotting: boolean;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  contact: {
    id: string;
    /** Número sequencial do contato por org (1, 2, 3…). */
    number?: number | null;
    name: string;
    email: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
  } | null;
  owner: { id: string; name: string; avatarUrl?: string | null; type?: string | null } | null;
  lastMessage: {
    /** Id interno da Message — casa com `internalId` do SSE message_status. */
    id?: string;
    /** wamid / externalId — casa com `messageId` do SSE (bolha no chat). */
    externalId?: string | null;
    content: string;
    createdAt: string;
    direction: string;
    /** Status de entrega (outbound). Espelha Message.sendStatus. */
    sendStatus?: string | null;
    /** Motivo quando sendStatus=failed. */
    sendError?: string | null;
  } | null;
  /**
   * Inbounds aguardando resposta (até 5), ordem cronológica.
   * Alimenta o tooltip em balões no DealCard quando unread > 1.
   */
  awaitingMessages?: Array<{ content: string; createdAt: string }> | null;
  channel?: string | null;
  productName?: string | null;
  productType?: "PRODUCT" | "SERVICE" | null;
  tags?: { id: string; name: string; color: string }[];
  pendingActivities?: number;
  hasOverdueActivity?: boolean;
  unreadCount?: number;
}

export interface BoardStageDto {
  id: string;
  name: string;
  /** Número sequencial no funil para `?stage=3`. */
  number?: number;
  /** Slug legado — leitura de bookmarks antigos; não gravar na URL. */
  slug?: string;
  color: string;
  position: number;
  winProbability: number;
  rottingDays: number;
  pipelineId?: string;
  isIncoming?: boolean;
  /** Estágios terminais fixos (estilo Kommo) — sempre os 2 últimos. */
  isWon?: boolean;
  isLost?: boolean;
  conversionRate?: number;
  avgDaysInStage?: number;
  totalCount?: number;
  loadedCount?: number;
  hasMore?: boolean;
  offset?: number;
  deals: BoardDealDto[];
}

export interface PipelineListItemDto {
  id: string;
  name: string;
  /** Número sequencial por org para `?pipeline=12`. */
  number?: number;
  /** Slug legado — leitura de bookmarks antigos; não gravar na URL. */
  slug?: string;
  isDefault?: boolean;
  /**
   * Estágios do funil (retornados pelo GET /api/pipelines) — usados
   * pelo MoveToStageMenu para permitir troca cross-pipeline sem uma
   * segunda requisição por funil.
   */
  stages?: PipelineListStageDto[];
}

export interface PipelineListStageDto {
  id: string;
  name: string;
  /** Número sequencial no funil para `?stage=3`. */
  number?: number;
  /** Slug legado — leitura de bookmarks antigos; não gravar na URL. */
  slug?: string;
  color: string | null;
  position: number;
  isWon?: boolean;
  isLost?: boolean;
  /** Total de negócios na etapa (GET /api/pipelines). */
  dealCount?: number;
}
