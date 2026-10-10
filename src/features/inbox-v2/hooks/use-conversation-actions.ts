"use client";

import { useCallback } from "react";
import {
  useMutation,
  useQueryClient,
  type MutateOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { refreshInboxLists } from "./inbox-list-refresh";
import { toast } from "sonner";

import {
  ConversationActionError,
  markConversationRead,
  postBulkAction,
  postConversationAction,
  type BulkAction,
  type ConversationListRow,
} from "../api";
import { distributionOutcomeToast } from "@/features/distribution/outcome-toast";
import {
  applyConversationFieldsToInboxCaches,
  applyInboxConversationRow,
  findCachedConversationRow,
} from "./apply-outbound-inbox-card";
import { scheduleThreadHydrate } from "./thread-hydrate";
import { findTeamUserById } from "./team-user-cache";

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
      applyConversationFieldsToInboxCaches(qc, vars.conversationId, {
        assignedToId: vars.assignedToId,
        assignedTo:
          vars.assignedToId == null
            ? null
            : { id: vars.assignedToId, name: "", type: "HUMAN" },
      });
      // 1 GET de mensagens (junta com o do evento SSE da linha do chat).
      scheduleThreadHydrate(qc, vars.conversationId, { force: true, immediate: true });
      qc.invalidateQueries({
        queryKey: ["conversation-timeline", vars.conversationId],
      });
    },
    onError: (err) => toast.error(err.message || "Falha ao atribuir"),
  });
}

/**
 * Estado final da transferência para o card (lista + cache da conversa).
 * A resposta do POST já traz o responsável COM nome e o departamento — inclusive
 * o que a distribuição escolheu ao transferir só para um departamento —, então
 * ela manda; o pedido (`vars`) só vale quando a resposta não diz. Sem objeto do
 * responsável, o nome vem da equipe em cache (nunca grava nome vazio).
 */
function transferredCardFields(
  qc: QueryClient,
  vars: { assignedToId?: string | null; departmentId?: string | null },
  conversation: Partial<ConversationListRow> | null | undefined,
): Partial<ConversationListRow> {
  const fields: Partial<ConversationListRow> = {};
  const existing = findCachedConversationRow(qc, conversation?.id ?? "");

  const assignedToId =
    conversation?.assignedToId !== undefined
      ? conversation.assignedToId
      : vars.assignedToId;
  if (assignedToId !== undefined) {
    fields.assignedToId = assignedToId;
    if (assignedToId == null) {
      fields.assignedTo = null;
    } else {
      const fromResponse =
        conversation?.assignedTo?.id === assignedToId ? conversation.assignedTo : null;
      const prev = existing?.assignedTo;
      const team = findTeamUserById(qc, assignedToId);
      const name = fromResponse?.name || team?.name || "";
      fields.assignedTo = {
        id: assignedToId,
        name,
        ...(fromResponse?.email ? { email: fromResponse.email } : {}),
        avatarUrl: fromResponse?.avatarUrl ?? team?.avatarUrl ?? null,
        type:
          fromResponse?.type ??
          team?.type ??
          (prev?.id === assignedToId ? prev.type : null) ??
          "HUMAN",
      };
    }
  }

  const departmentId =
    conversation?.departmentId !== undefined
      ? conversation.departmentId
      : vars.departmentId;
  if (departmentId !== undefined) {
    fields.departmentId = departmentId;
    if (conversation?.department !== undefined) {
      fields.department = conversation.department;
    } else if (departmentId == null || existing?.department?.id !== departmentId) {
      // Departamento mudou e a resposta não descreve o novo: não deixa o
      // objeto do anterior (nome, exigência de tabulação) no card.
      fields.department = null;
    }
  }
  return fields;
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
        if (dist?.reason === "QUEUED") {
          toast.info("Transferida para o departamento. Distribuição em andamento.");
        } else if (dist && dist.success === false) {
          const mapped = distributionOutcomeToast(dist);
          toast[mapped.tone](mapped.message);
        } else {
          toast.success(
            dist?.success && dist.selectedUserName
              ? `Transferida ao departamento — atribuída a ${dist.selectedUserName}`
              : "Conversa transferida para o departamento",
          );
        }
      } else {
        toast.success("Conversa transferida");
      }

      applyConversationFieldsToInboxCaches(
        qc,
        vars.conversationId,
        transferredCardFields(qc, vars, {
          ...data.conversation,
          id: vars.conversationId,
        }),
      );
      // 1 GET de mensagens (junta com o do evento SSE da linha do chat).
      scheduleThreadHydrate(qc, vars.conversationId, { force: true, immediate: true });
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
    onFollowedUp?: (conversationId: string) => void;
    /**
     * Departamento exige tabulação e o resolve foi rejeitado (ou a UI
     * não tinha o flag hidratado). Caller abre o TabulationDialog.
     */
    onTabulationRequired?: (info: {
      conversationId: string;
      departmentId: string | null;
      userId?: string | null;
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
      followUp?: boolean;
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
              ...(vars.followUp ? { followUp: true } : {}),
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
          : vars.followUp
            ? "Conversa em acompanhamento"
            : "Conversa finalizada",
      );

      // Reabrir: troca o activeId ANTES das invalidates. Se invalidar primeiro,
      // a conversa resolvida some da aba ativa e o deep-link tenta carregar o
      // id antigo → toast "Erro ao carregar conversa".
      // Também semeia o cache do id novo: na aba Encerradas o ticket OPEN não
      // está na lista, e o deep-link precisa achar o row imediatamente.
      if (newId && data.previousConversationId) {
        if (data.conversation) {
          const prev = qc.getQueryData<Record<string, unknown>>([
            "inbox-conversation",
            data.previousConversationId,
          ]);
          const seeded =
            prev && typeof prev === "object"
              ? {
                  ...prev,
                  ...data.conversation,
                  contact:
                    data.conversation.contact ??
                    (prev.contact as ConversationListRow["contact"] | undefined),
                  tags: data.conversation.tags ?? prev.tags,
                  department:
                    data.conversation.department ?? prev.department,
                  departmentId:
                    data.conversation.departmentId ?? prev.departmentId,
                }
              : data.conversation;
          qc.setQueryData(["inbox-conversation", newId], seeded);
          if (data.conversation.number != null) {
            qc.setQueryData(
              ["inbox-conversation", String(data.conversation.number)],
              seeded,
            );
          }
        }
        callbacks?.onNewConversation?.(newId, data.previousConversationId);
      } else if (!isReopen) {
        if (vars.followUp) {
          callbacks?.onFollowedUp?.(vars.conversationId);
        } else {
          callbacks?.onResolved?.(vars.conversationId);
        }
        // Mantém snapshot local coerente se a conversa sair do filtro da aba.
        qc.setQueryData(
          ["inbox-conversation", vars.conversationId],
          (old: {
            status?: string;
            closedAt?: string | null;
            followUpAt?: string | null;
          } | undefined) =>
            old
              ? vars.followUp
                ? {
                    ...old,
                    status: "OPEN",
                    closedAt: null,
                    followUpAt: old.followUpAt ?? new Date().toISOString(),
                  }
                : {
                    ...old,
                    status: "RESOLVED",
                    closedAt: old.closedAt ?? new Date().toISOString(),
                    followUpAt: null,
                  }
              : old,
        );
      }

      if (newId && data.conversation) {
        applyConversationFieldsToInboxCaches(qc, vars.conversationId, {
          status: "RESOLVED",
          closedAt: new Date().toISOString(),
          followUpAt: null,
        });
        const seeded = qc.getQueryData<ConversationListRow>([
          "inbox-conversation",
          newId,
        ]);
        if (seeded) applyInboxConversationRow(qc, seeded);
      } else if (!isReopen) {
        applyConversationFieldsToInboxCaches(
          qc,
          vars.conversationId,
          vars.followUp
            ? {
                status: "OPEN",
                closedAt: null,
                followUpAt: new Date().toISOString(),
              }
            : {
                status: "RESOLVED",
                closedAt: new Date().toISOString(),
                followUpAt: null,
              },
        );
      }
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
            userId: err.userId ?? null,
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

/** `POST /read` em voo por conversa — a abertura não manda o segundo por cima. */
const readInFlight = new Set<string>();

type ListUnreadCache =
  | { pages?: Array<{ items?: Array<{ id: string; number?: number | null; unreadCount?: number }> }> }
  | undefined;

/**
 * Zera o contador da conversa em TODO cache que o guard lê: páginas da lista
 * e a cópia individual (`["inbox-conversation", id|número]`) — que os patches
 * de evento/mutação mantêm e `findCachedConversationRow` prefere. Zerar só a
 * lista deixava a cópia com as não lidas antigas: o "voltar à conversa" achava
 * que ainda havia o que marcar e mandava outro POST.
 */
function zeroConversationUnread(qc: QueryClient, conversationId: string): void {
  const want = String(conversationId);
  qc.setQueriesData<ListUnreadCache>(
    { queryKey: ["inbox-conversations"] },
    (old) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items?.map((item) =>
            String(item.id) === want || (item.number != null && String(item.number) === want)
              ? { ...item, unreadCount: 0 }
              : item,
          ),
        })),
      };
    },
  );
  const known = findCachedConversationRow(qc, want);
  const keys = new Set<string>([want]);
  if (known) {
    keys.add(String(known.id));
    if (known.number != null) keys.add(String(known.number));
  }
  for (const key of keys) {
    qc.setQueryData<ConversationListRow | undefined>(["inbox-conversation", key], (old) =>
      old && (old.unreadCount ?? 0) !== 0 ? { ...old, unreadCount: 0 } : old,
    );
  }
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
    mutationFn: async (conversationId) => {
      readInFlight.add(conversationId);
      try {
        await markConversationRead(conversationId);
      } finally {
        readInFlight.delete(conversationId);
      }
    },
    onMutate: async (conversationId) => {
      noteInboxConversationOpened(conversationId);
      const previous = [
        ...qc.getQueriesData({ queryKey: ["inbox-conversations"] }),
        ...qc.getQueriesData({ queryKey: ["inbox-conversation"] }),
      ];
      // Zera JÁ (síncrono): dois gatilhos no mesmo tick não mandam dois POST.
      zeroConversationUnread(qc, conversationId);
      await qc.cancelQueries({ queryKey: ["inbox-conversations"] });
      // O cancelamento pode devolver a lista ao estado de antes do fetch em voo.
      zeroConversationUnread(qc, conversationId);
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

/**
 * Não lidas da conversa no cache da lista do Inbox; `null` quando a lista
 * não a conhece (chat do board sem a lista montada).
 */
export function cachedConversationUnread(
  qc: QueryClient,
  conversationId: string,
): number | null {
  const row = findCachedConversationRow(qc, conversationId);
  return row ? (row.unreadCount ?? 0) : null;
}

/**
 * Marcar como lida AO ABRIR, só quando há o que marcar: a conversa tem
 * `unreadCount > 0` no cache da lista, ou a lista não a conhece (não dá
 * para saber — manda, como antes). Voltar a uma conversa já lida não manda
 * `POST /read` (ele também avisa a Meta — visto azul). Mensagem nova
 * chegando com a conversa aberta é tratada à parte
 * (`useInboxRealtime` → `onOpenConversationInbound`).
 *
 * Devolve `true` quando o POST saiu.
 */
export function useMarkConversationReadIfUnread() {
  const qc = useQueryClient();
  const { mutate } = useMarkConversationRead();
  return useCallback(
    (
      conversationId: string,
      options?: MutateOptions<void, Error, string, { previous: Array<[unknown, unknown]> }>,
    ): boolean => {
      if (cachedConversationUnread(qc, conversationId) === 0) return false;
      if (readInFlight.has(conversationId)) return false;
      mutate(conversationId, options);
      return true;
    },
    [qc, mutate],
  );
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
      void refreshInboxLists(qc);
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
      void refreshInboxLists(qc);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations", "tab-counts"] });
      qc.invalidateQueries({ queryKey: ["distribution-responsibles"] });
      qc.invalidateQueries({ queryKey: ["distribution-pending"] });
    },
    onError: (err) => toast.error(err.message || "Falha ao reatribuir"),
  });
}
