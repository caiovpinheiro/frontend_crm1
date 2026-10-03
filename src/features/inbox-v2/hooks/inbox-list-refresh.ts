import {
  hashKey,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import { INBOX_CONVERSATIONS_QUERY_PREFIX } from "./use-conversations";

/**
 * Refresh da lista do Inbox SÓ pela 1ª página (N-FE-1).
 *
 * `invalidateQueries` num infinite query refaz TODAS as páginas carregadas
 * em sequência — e, com filas em paralelo, cada página são K GETs. Quem
 * rolou 10 páginas e reconectou o SSE (ou trocou uma tag, mandou um
 * template, clicou em "Atualizar") pagava 10 × K requisições.
 *
 * Aqui as páginas além da 1ª são descartadas do cache antes de invalidar:
 * o refetch pede uma página (K GETs com filas em paralelo) e o "carregar
 * mais" volta a buscar as seguintes sob demanda, pelo cursor novo.
 *
 * `refetchType` segue o `invalidateQueries`: `"active"` (padrão) refaz só
 * as listas montadas; as demais ficam stale (e já encolhidas).
 */
export function refreshInboxLists(
  qc: QueryClient,
  opts: {
    queryKey?: QueryKey;
    exact?: boolean;
    refetchType?: "active" | "inactive" | "all" | "none";
  } = {},
): Promise<void> {
  const filters = {
    queryKey: opts.queryKey ?? [INBOX_CONVERSATIONS_QUERY_PREFIX],
    exact: opts.exact ?? false,
  };
  for (const query of qc.getQueryCache().findAll(filters)) {
    const data = query.state.data as InfiniteData<unknown, unknown> | undefined;
    if (!data?.pages || data.pages.length <= 1) continue;
    qc.setQueryData<InfiniteData<unknown, unknown>>(query.queryKey, {
      pages: data.pages.slice(0, 1),
      pageParams: data.pageParams.slice(0, 1),
    });
  }
  return qc.invalidateQueries({ ...filters, refetchType: opts.refetchType ?? "active" });
}

/**
 * `invalidateQueries({ queryKey })` genérico (editores inline com lista de
 * chaves): a lista do Inbox vai pela 1ª página; o resto, como sempre.
 */
export function invalidateQueryKey(qc: QueryClient, queryKey: readonly unknown[]): void {
  if (queryKey[0] === INBOX_CONVERSATIONS_QUERY_PREFIX) {
    void refreshInboxLists(qc, { queryKey });
    return;
  }
  void qc.invalidateQueries({ queryKey });
}

/** Janela que junta os refreshes de uma lista pedidos por eventos SSE. */
export const INBOX_LIST_REFRESH_DEBOUNCE_MS = 1_000;

const pendingRefresh = new Map<string, QueryKey>();
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Refresh (1ª página) de UMA lista, com debounce — para eventos SSE de
 * cards que não dá para encaixar localmente (lista com filtro de servidor
 * opaco: etapa, tag, origem, janela). Uma rajada de eventos vira um GET.
 */
export function scheduleInboxListRefresh(qc: QueryClient, queryKey: QueryKey): void {
  pendingRefresh.set(hashKey(queryKey), queryKey);
  if (pendingTimer) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    const keys = [...pendingRefresh.values()];
    pendingRefresh.clear();
    for (const key of keys) void refreshInboxLists(qc, { queryKey: key, exact: true });
  }, INBOX_LIST_REFRESH_DEBOUNCE_MS);
}
