"use client";

import { useCallback, useMemo } from "react";

import type { InboxFilters, InboxTab } from "../api";
import { inboxQueueSelectedCount } from "../inbox-queue-catalog";
import { sortInboxListRows } from "../inbox-list-order";
import { useConversations, useTabCounts } from "./use-conversations";

function inIsoDayRange(
  iso: string | null | undefined,
  from?: string,
  to?: string,
): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/**
 * Lista da coluna de conversas: busca paginada no servidor, filtros
 * client-side (direção/período da última msg, criação), ordenação e
 * contagens das filas.
 */
export function useInboxConversationList(params: {
  tab: InboxTab[];
  filters: InboxFilters;
  canFetchInbox: boolean;
  tabHydrated: boolean;
  filtersHydrated: boolean;
  sessionStatus: string;
}) {
  const { tab, filters, canFetchInbox, tabHydrated, filtersHydrated, sessionStatus } =
    params;

  // Ordenação e direção da última msg são CLIENT-SIDE (evita refetch).
  // `windowState` (Sessão da Meta Aberta/Fechada) vai ao servidor — senão o badge Erro
  // conta 233 e a lista filtra no cliente até ficar vazia.
  const {
    sortBy,
    sortOrder,
    lastMessageDirection,
    lastMessageFrom,
    lastMessageTo,
    createdFrom,
    createdTo,
    ...serverFilters
  } = filters;

  const {
    data: listData,
    listTiers,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
    isError: isListError,
  } = useConversations({
    tab,
    filters: serverFilters,
    search: "",
    // Prefs (URL/localStorage) travam o fetch da aba errada. Sessão
    // NextAuth "loading" não — o cookie já vale no GET.
    // Sem filas selecionadas → empty state (não busca).
    enabled: canFetchInbox && tabHydrated && filtersHydrated && tab.length > 0,
  });
  const handleLoadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || isPlaceholderData) return;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isPlaceholderData, fetchNextPage]);
  const rawRows = (listData?.items ?? []).filter(Boolean);

  // Skeleton até a 1ª resposta da lista (mesmo se items=[]).
  // NÃO usar só isLoading: no RQ v5 há frame com enabled=true,
  // isPending + fetchStatus=idle → isLoading=false + data=undefined → empty flash.
  const listBootstrapping =
    sessionStatus === "unauthenticated" ||
    !tabHydrated ||
    !filtersHydrated ||
    (canFetchInbox &&
      tab.length > 0 &&
      !listData &&
      !isListError);

  // Ordena (default: última atividade primeiro) e filtra a janela de 24h.
  // Usa `lastMessageAt` (com fallback p/ `lastInboundAt`) para casar a ordem
  // com o `time` exibido no card — que também usa `lastMessageAt ?? lastInboundAt`
  // (ver `toConversationCard` em adapters.ts). Sem isso, mensagens outbound
  // recentes "puxam" o tempo no card mas não a posição na lista, parecendo
  // desordenado pro operador.
  // `lastMessageAt` só é tocado por NOVAS mensagens (in ou out), nunca por
  // leitura — então a posição continua estável ao marcar como lida (motivo
  // original pra evitar `updatedAt`).
  const rows = useMemo(() => {
    let list = rawRows;
    if (lastMessageDirection) {
      list = list.filter((r) => {
        const direction = String(
          r.lastMessage?.direction ?? r.lastMessagePreview?.direction ?? "",
        ).toLowerCase();
        return lastMessageDirection === "out"
          ? direction === "out" || direction === "outbound"
          : direction === "in" || direction === "inbound";
      });
    }
    if (lastMessageFrom || lastMessageTo) {
      list = list.filter((r) =>
        inIsoDayRange(r.lastMessageAt ?? r.lastInboundAt, lastMessageFrom, lastMessageTo),
      );
    }
    if (createdFrom || createdTo) {
      list = list.filter((r) => inIsoDayRange(r.createdAt, createdFrom, createdTo));
    }
    return sortInboxListRows(list, { by: sortBy, order: sortOrder, tiers: listTiers });
  }, [listTiers, rawRows, lastMessageDirection, lastMessageFrom, lastMessageTo, createdFrom, createdTo, sortBy, sortOrder]);

  const { data: tabCounts } = useTabCounts(
    canFetchInbox && tabHydrated && filtersHydrated,
    serverFilters,
  );

  // Select-all = soma das filas (`?counts=1`), não `list.total`: a união
  // mista não colapsa tickets no SQL e o total infla (5 → 3 cards).
  const selectedQueueSum = inboxQueueSelectedCount(tab, tabCounts);
  const filterTotal = selectedQueueSum ?? listData?.total;

  return {
    serverFilters,
    listData,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
    handleLoadMore,
    listBootstrapping,
    rows,
    tabCounts,
    filterTotal,
  };
}
