"use client";

import { useQuery } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";

/**
 * Status canônicos vindos do backend (`BulkOperationStatus` no Prisma).
 * Mantemos como union de string literal para que o discriminator funcione
 * em consumidores TS sem precisar importar o enum do Prisma no client.
 */
export type BulkOperationStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

/**
 * Tipos canônicos de operação em massa (`BulkOperationType` no Prisma).
 * Lista intencionalmente curta — só os que o frontend hoje cria/exibe.
 * Outras strings continuam aceitas para forward-compat com novos tipos
 * no backend (ver `string & {}` no fallback).
 */
export type BulkOperationType =
  | "DEAL_BULK_MOVE_STAGE"
  | "DEAL_BULK_UPDATE_FIELDS"
  | (string & {});

export type BulkOperationErrorEntry = {
  itemId: string;
  message: string;
  attempt: number;
  at: string;
};

/**
 * Shape exato retornado por `GET /api/bulk-operations/[id]` no backend
 * (ver `src/app/api/bulk-operations/[id]/route.ts`). `progressPercent`
 * vem pré-computado pelo backend (0..100). `errors` já vem truncado em
 * até 100 entradas e `errorsTruncated` indica se houve corte.
 */
export type BulkOperationStatusResponse = {
  id: string;
  type: BulkOperationType;
  status: BulkOperationStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  progressPercent: number;
  errors: BulkOperationErrorEntry[];
  errorsTruncated: boolean;
  createdById: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  payload: unknown;
};

/**
 * Status considerados "ativos" — enquanto a operação estiver em um
 * deles, o hook continua repollando. Quando terminar (COMPLETED,
 * PARTIAL, FAILED, CANCELLED), o polling para automaticamente.
 */
const ACTIVE_STATUSES: ReadonlySet<BulkOperationStatus> = new Set([
  "PENDING",
  "PROCESSING",
]);

export const TERMINAL_STATUSES: ReadonlySet<BulkOperationStatus> = new Set([
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);

export function isBulkOperationFinished(
  status: BulkOperationStatus | undefined,
): boolean {
  return !!status && TERMINAL_STATUSES.has(status);
}

type UseBulkOperationOptions = {
  /** Intervalo em ms entre polls enquanto ativa. Default 2000ms. */
  pollIntervalMs?: number;
  /** Pausa o polling (ex.: dialog fechado). Default false. */
  paused?: boolean;
};

/**
 * Hook de polling para `BulkOperation`. Faz GET no endpoint do backend
 * a cada `pollIntervalMs` enquanto status estiver em PENDING/PROCESSING
 * e para automaticamente nos status terminais. Reaproveita o cache do
 * react-query por `operationId`, então abrir o mesmo dialog duas vezes
 * já mostra o último estado conhecido instantaneamente.
 *
 * Convenções do projeto seguidas:
 * - Path relativo via `apiUrl()` para passar pelo rewrite do Next e
 *   manter cookies same-origin (decisão 2026-05-14 em AGENT.md).
 * - QueryClient global já configurado em `src/app/providers.tsx`.
 */
export function useBulkOperation(
  operationId: string | null | undefined,
  options: UseBulkOperationOptions = {},
) {
  const { pollIntervalMs = 2000, paused = false } = options;

  return useQuery<BulkOperationStatusResponse>({
    queryKey: ["bulk-operation", operationId],
    enabled: !!operationId && !paused,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/bulk-operations/${operationId}`));
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message ?? "Falha ao consultar operação.",
        );
      }
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return pollIntervalMs;
      return ACTIVE_STATUSES.has(data.status) ? pollIntervalMs : false;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });
}
