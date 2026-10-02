"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import type { ConversationListRow, InboxTab } from "../api";
import {
  inboxQueueTabFor,
  pickVisibleInboxTab,
  rowBelongsToAnyInboxTab,
} from "../inbox-queue-tab";
import { useConversationById } from "./use-conversations";
import {
  inboxConversationApiId,
  matchesConversationUrlRef,
  useInboxUrlSync,
} from "./use-inbox-url-sync";

/**
 * Conversa ativa do inbox: snapshot "sticky" da row, conversa fixada pela
 * busca, deep-link por id/número (`?c=`) e o id usado nas chamadas da API.
 */
export function useInboxActiveConversation(params: {
  activeId: string | null;
  setActiveId: Dispatch<SetStateAction<string | null>>;
  rows: ConversationListRow[];
  /** Resposta da lista (só importa se já chegou). */
  listData: unknown;
  visibleTabs: readonly { id: InboxTab }[];
  tab: InboxTab[];
  replaceTab: (next: InboxTab | InboxTab[]) => void;
}) {
  const { activeId, setActiveId, rows, listData, visibleTabs, tab, replaceTab } =
    params;

  // ── Sticky activeRow ────────────────────────────────────────────
  // A `rows` reflete o filtro da aba atual (ex.: "entrada"). Se o
  // agente envia uma mensagem outbound, a conversa pode deixar de
  // pertencer ao filtro (move pra "respondidas") e sumir de `rows`.
  // Sem snapshot, `rows.find` devolve undefined e a janela do chat
  // fecha sozinha. Mantemos a ultima row vista enquanto o user nao
  // trocar de conversa explicitamente.
  const [stickyRow, setStickyRow] = useState<ConversationListRow | null>(null);
  const [pinnedFromSearch, setPinnedFromSearch] = useState<ConversationListRow | null>(null);

  const displayRows = useMemo(() => {
    if (!pinnedFromSearch) return rows;
    const rest = rows.filter((r) => r.id !== pinnedFromSearch.id);
    return [pinnedFromSearch, ...rest];
  }, [rows, pinnedFromSearch]);

  // Conversa ativa presente na lista carregada da aba/filtro atual?
  const foundActiveRow = useMemo(
    () =>
      activeId
        ? displayRows.find((r) => matchesConversationUrlRef(r, activeId)) ??
          rows.find((r) => matchesConversationUrlRef(r, activeId)) ??
          null
        : null,
    [displayRows, rows, activeId],
  );

  // Deep-link: se o id da URL (ou de qualquer seleção) não estiver na lista
  // carregada — supervisor abrindo o link de outra aba/filtro/página, ou
  // conversa que saiu do filtro — busca a conversa direto pelo id para abri-la
  // mesmo assim. Erro (404 sem acesso / inexistente) é tratado abaixo.
  //
  // Se já temos sticky do mesmo id (ex.: acabou de Encerrar e a conversa
  // saiu da aba "abertas"/"entrada"), NÃO refetch — evita corrida que
  // dispara toast "Erro ao carregar conversa" no caminho feliz.
  const needsDeepLinkFetch =
    Boolean(activeId) &&
    !foundActiveRow &&
    !(stickyRow && matchesConversationUrlRef(stickyRow, activeId));
  const {
    data: deepLinkRow,
    error: deepLinkError,
  } = useConversationById(needsDeepLinkFetch ? activeId : null);

  useEffect(() => {
    if (!activeId) {
      setStickyRow(null);
      setPinnedFromSearch(null);
      return;
    }
    if (foundActiveRow) {
      setStickyRow(foundActiveRow);
      if (foundActiveRow.id !== activeId) setActiveId(foundActiveRow.id);
      return;
    }
    // Não está na lista: usa a conversa buscada pelo id/número (deep-link).
    if (deepLinkRow && matchesConversationUrlRef(deepLinkRow, activeId)) {
      setStickyRow(deepLinkRow);
      setPinnedFromSearch(deepLinkRow);
      if (deepLinkRow.id !== activeId) setActiveId(deepLinkRow.id);
      const queue = pickVisibleInboxTab(inboxQueueTabFor(deepLinkRow), visibleTabs);
      if (
        queue &&
        !tab.includes("todos") &&
        !rowBelongsToAnyInboxTab(deepLinkRow, tab)
      ) {
        replaceTab([queue]);
      }
      return;
    }
    // Reabrir (novo ticket) / troca de id: não manter header do ticket antigo.
    setStickyRow((prev) =>
      prev && matchesConversationUrlRef(prev, activeId) ? prev : null,
    );
  }, [activeId, foundActiveRow, deepLinkRow, visibleTabs, tab, replaceTab, setActiveId]);

  // Deep-link inválido (id inexistente ou sem permissão): avisa e limpa a
  // seleção/URL para o supervisor cair no estado vazio, sem chat "fantasma".
  // IMPORTANTE (F5): só decide que é inválido DEPOIS que a lista carregou
  // (`listData` definido). No reload, a busca por id pode falhar numa corrida
  // (ex.: endpoint indisponível) ANTES da lista chegar — resetar aqui nesse
  // instante derrubava a conversa que o F5 deveria manter aberta. Esperar a
  // lista settlar garante que a conversa em `rows` (foundActiveRow) tenha
  // chance de reidratar antes de qualquer reset.
  //
  // Também ignora erro se ainda há sticky do activeId — conversa só saiu
  // do filtro da aba (Encerrar), não é deep-link inválido.
  useEffect(() => {
    if (needsDeepLinkFetch && deepLinkError && listData !== undefined) {
      if (foundActiveRow) return;
      if (stickyRow && matchesConversationUrlRef(stickyRow, activeId)) return;
      toast.error(
        deepLinkError.message || "Conversa não encontrada ou sem permissão.",
      );
      setActiveId(null);
    }
  }, [needsDeepLinkFetch, deepLinkError, listData, stickyRow, activeId, foundActiveRow, setActiveId]);

  const conversationApiId = inboxConversationApiId(
    activeId,
    foundActiveRow ??
      (deepLinkRow && matchesConversationUrlRef(deepLinkRow, activeId)
        ? deepLinkRow
        : null) ??
      (stickyRow && matchesConversationUrlRef(stickyRow, activeId)
        ? stickyRow
        : null),
  );

  const activeRow = stickyRow;
  const { closeActiveConversation } = useInboxUrlSync(
    activeId,
    setActiveId,
    activeRow?.number,
    activeRow?.id,
  );

  return {
    stickyRow,
    setStickyRow,
    pinnedFromSearch,
    setPinnedFromSearch,
    displayRows,
    foundActiveRow,
    conversationApiId,
    activeRow,
    closeActiveConversation,
  };
}
