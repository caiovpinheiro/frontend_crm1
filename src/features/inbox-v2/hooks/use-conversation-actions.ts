"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ConversationActionError,
  markConversationRead,
  postBulkAction,
  postConversationAction,
  type BulkAction,
} from "../api";
import { messagesKey } from "./use-messages";

/** Atribuir conversa (assign) — comportamento otimista. */
export function useAssignConversation() {
  const qc = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof postConversationAction>>,
    Error,
    { conversationId: string; assignedToId: string | null }
  >({
    mutationFn: (vars) =>
      postConversationAction(vars.conversationId, {
        action: "assign",
        assignedToId: vars.assignedToId,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      qc.invalidateQueries({ queryKey: messagesKey(vars.conversationId) });
      qc.invalidateQueries({
        queryKey: ["conversation-timeline", vars.conversationId],
      });
    },
    onError: (err) => toast.error(err.message || "Falha ao atribuir"),
  });
}

/**
 * Transferir conversa para um AGENTE e/ou um DEPARTAMENTO.
 *
 * Ao informar `departmentId`, o backend define `conversation.departmentId` e
 * aciona a Distribuição Inteligente escopada a esse departamento (um agente
 * elegível recebe a conversa). Ao informar `assignedToId`, atribui direto.
 */
export function useTransferConversation() {
  const qc = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof postConversationAction>>,
    Error,
    {
      conversationId: string;
      assignedToId?: string | null;
      departmentId?: string | null;
    }
  >({
    mutationFn: (vars) =>
      postConversationAction(vars.conversationId, {
        action: "transfer",
        ...(vars.assignedToId !== undefined
          ? { assignedToId: vars.assignedToId }
          : {}),
        ...(vars.departmentId !== undefined
          ? { departmentId: vars.departmentId }
          : {}),
      }),
    onSuccess: (data, vars) => {
      const dist = data.distribution;
      if (vars.departmentId != null) {
        toast.success(
          dist?.success && dist.selectedUserName
            ? `Transferida ao departamento — atribuída a ${dist.selectedUserName}`
            : "Conversa transferida para o departamento",
        );
      } else {
        toast.success("Conversa transferida");
      }

      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: messagesKey(vars.conversationId) });
      qc.invalidateQueries({
        queryKey: ["conversation-timeline", vars.conversationId],
      });
      qc.invalidateQueries({ queryKey: ["deal-detail-v2"] });
      qc.invalidateQueries({ queryKey: ["deal-timeline-v2"] });
      qc.invalidateQueries({ queryKey: ["activity-feed"] });
      qc.invalidateQueries({ queryKey: ["distribution"] });
    },
    onError: (err) => toast.error(err.message || "Falha ao transferir"),
  });
}

/**
 * Resolver / reabrir conversa.
 *
 * Modelo de ticket (15/jul/26): `reopen` NAO reabre o mesmo registro —
 * o backend cria uma nova conversa (#N+1) vinculada ao mesmo contato/canal
 * e retorna o id novo em `data.conversation.id`. Callers podem passar
 * `onNewConversation` para redirecionar/selecionar a nova conversa na UI
 * (ex.: inbox seleciona o id novo e a URL vira `?c=<number>`; pipeline confia na invalidacao do
 * `deal-detail-v2` que ja traz `conversations[0]` mais recente).
 */
export function useToggleConversationResolve(
  callbacks?: {
    onNewConversation?: (newConversationId: string, previousConversationId: string) => void;
    /** Encerrar: caller pode atualizar sticky/status local antes do refetch da lista. */
    onResolved?: (conversationId: string) => void;
    /**
     * Departamento exige tabulação e o resolve foi rejeitado (ou a UI
     * não tinha o flag hidratado). Caller abre o TabulationDialog.
     */
    onTabulationRequired?: (info: {
      conversationId: string;
      departmentId: string | null;
    }) => void;
  },
) {
  const qc = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof postConversationAction>>,
    ConversationActionError,
    {
      conversationId: string;
      action: "resolve" | "reopen";
      tabulationId?: string | null;
      /** Encerrar sem disparar automações (só ADMIN; backend ignora o resto). */
      skipAutomations?: boolean;
    }
  >({
    mutationFn: (vars) =>
      postConversationAction(
        vars.conversationId,
        vars.action === "resolve"
          ? {
              action: "resolve",
              tabulationId: vars.tabulationId ?? null,
              ...(vars.skipAutomations ? { skipAutomations: true } : {}),
            }
          : { action: vars.action },
      ),
    onSuccess: (data, vars) => {
      const isReopen = vars.action === "reopen";
      const newId =
        isReopen && data.previousConversationId ? data.conversation?.id : null;

      toast.success(
        isReopen
          ? newId
            ? `Novo ticket #${data.conversation?.number ?? "—"} aberto`
            : "Conversa reaberta"
          : "Conversa finalizada",
      );

      // Reabrir: troca o activeId ANTES das invalidates. Se invalidar primeiro,
      // a conversa resolvida some da aba ativa e o deep-link tenta carregar o
      // id antigo → toast "Erro ao carregar conversa".
      // Também semeia o cache do id novo: na aba Encerradas o ticket OPEN não
      // está na lista, e o deep-link precisa achar o row imediatamente.
      if (newId && data.previousConversationId) {
        if (data.conversation) {
          qc.setQueryData(["inbox-conversation", newId], data.conversation);
        }
        callbacks?.onNewConversation?.(newId, data.previousConversationId);
      } else if (!isReopen) {
        callbacks?.onResolved?.(vars.conversationId);
        // Mantém snapshot local coerente se a conversa sair do filtro da aba.
        qc.setQueryData(
          ["inbox-conversation", vars.conversationId],
          (old: { status?: string; closedAt?: string | null } | undefined) =>
            old
              ? {
                  ...old,
                  status: "RESOLVED",
                  closedAt: old.closedAt ?? new Date().toISOString(),
                }
              : old,
        );
      }

      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      // Atualiza timeline e activity-feed do deal vinculado à conversa.
      qc.invalidateQueries({ queryKey: ["deal-timeline-v2"] });
      qc.invalidateQueries({ queryKey: ["activity-feed"] });
      // Timeline propria da conversa (ConversationTimelineTab).
      qc.invalidateQueries({ queryKey: ["conversation-timeline", vars.conversationId] });
      if (newId) {
        qc.invalidateQueries({ queryKey: ["conversation-timeline", newId] });
      }
      // Detalhe do deal — inclui `contact.conversations[0].status/closedAt`,
      // que alimentam o chip "Encerrada" + marcador de fim de chat no
      // pipeline. Sem esta invalidacao a UI ficava travada ate refresh manual.
      qc.invalidateQueries({ queryKey: ["deal-detail-v2"] });
      // Deal-workspace antigo usa `["deal", id]` / `["contact", id]`.
      // Sincroniza também esses caches p/ o `contact.conversations`
      // refletir o novo ticket criado no reopen.
      qc.invalidateQueries({ queryKey: ["deal"] });
      qc.invalidateQueries({ queryKey: ["contact"] });
    },
    onError: (err, vars) => {
      if (
        err instanceof ConversationActionError &&
        err.code === "TABULATION_REQUIRED" &&
        vars.action === "resolve"
      ) {
        if (callbacks?.onTabulationRequired) {
          callbacks.onTabulationRequired({
            conversationId: vars.conversationId,
            departmentId: err.departmentId ?? null,
          });
          return;
        }
      }
      toast.error(err.message);
    },
  });
}

/** Após abrir/marcar lida, o webhook da Meta pode emitir
 *  `conversation_updated` e o inbox refetchava lista+counts. */
let suppressInboxListRefreshUntil = 0;
let suppressInboxListRefreshId: string | null = null;

export function noteInboxConversationOpened(conversationId: string) {
  suppressInboxListRefreshId = conversationId;
  suppressInboxListRefreshUntil = Date.now() + 4000;
}

export function shouldSuppressInboxListRefresh(conversationId?: string | null) {
  if (!conversationId || Date.now() >= suppressInboxListRefreshUntil) return false;
  return conversationId === suppressInboxListRefreshId;
}

/** Marcar conversa como lida (swipe / ao abrir). */
export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    string,
    { previous: Array<[unknown, unknown]> }
  >({
    mutationFn: (conversationId) => markConversationRead(conversationId),
    onMutate: async (conversationId) => {
      noteInboxConversationOpened(conversationId);
      await qc.cancelQueries({ queryKey: ["inbox-conversations"] });
      const previous = qc.getQueriesData({ queryKey: ["inbox-conversations"] });
      qc.setQueriesData(
        { queryKey: ["inbox-conversations"] },
        (old: { pages?: Array<{ items?: Array<{ id: string; unreadCount?: number }> }> } | undefined) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items?.map((item) =>
                item.id === conversationId ? { ...item, unreadCount: 0 } : item,
              ),
            })),
          };
        },
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      // silencioso — marcar como lida não deve incomodar o operador
      if (!ctx?.previous) return;
      for (const [key, data] of ctx.previous) {
        qc.setQueryData(key as Parameters<typeof qc.setQueryData>[0], data);
      }
    },
  });
}

/** Ações em lote (bulk) — usadas no modo de seleção. */
export function useBulkConversationAction() {
  const qc = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof postBulkAction>>,
    Error,
    {
      ids: string[];
      action: BulkAction;
      /** true = encerrar TODAS as conversas do filtro atual (todas as páginas). */
      allInFilter?: boolean;
      tab?: string;
      search?: string;
      filters?: Record<string, unknown>;
      /** Folha do modal de tabulação (mesmo id do encerramento individual). */
      tabulationId?: string | null;
      /** ADMIN: não dispara automações de encerramento. */
      skipAutomations?: boolean;
    }
  >({
    mutationFn: (vars) =>
      postBulkAction(
        vars.ids,
        vars.action,
        {
          ...(vars.allInFilter
            ? {
                allInFilter: true,
                tab: vars.tab,
                search: vars.search,
                filters: vars.filters,
              }
            : {}),
          ...(vars.tabulationId ? { tabulationId: vars.tabulationId } : {}),
          ...(vars.skipAutomations ? { skipAutomations: true } : {}),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations", "tab-counts"] });
      // Toast do resultado fica no caller (`handleBulkAction`) para não
      // empilhar com "Nenhuma conversa para encerrar" / "em segundo plano".
    },
    onError: (err) => toast.error(err.message),
  });
}

/**
 * Reatribuir / remover responsável em massa via POST /api/conversations/bulk.
 * Lotes pequenos persistem na API (`updated`); só lotes enormes devolvem
 * `operationId` para a UI acompanhar com toast.loading.
 */
export function useBulkAssignConversations() {
  const qc = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof postBulkAction>>,
    Error,
    {
      ids: string[];
      assignedToId: string | null;
      allInFilter?: boolean;
      tab?: string;
      search?: string;
      filters?: Record<string, unknown>;
    }
  >({
    mutationFn: (vars) =>
      postBulkAction(
        vars.ids,
        "assign",
        vars.allInFilter
          ? {
              allInFilter: true,
              assignedToId: vars.assignedToId,
              tab: vars.tab,
              search: vars.search,
              filters: vars.filters,
            }
          : { assignedToId: vars.assignedToId },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations", "tab-counts"] });
      qc.invalidateQueries({ queryKey: ["distribution-responsibles"] });
      qc.invalidateQueries({ queryKey: ["distribution-pending"] });
    },
    onError: (err) => toast.error(err.message || "Falha ao reatribuir"),
  });
}
