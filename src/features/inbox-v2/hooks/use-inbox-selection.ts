"use client";

import { useCallback, useEffect, useState } from "react";

import type { InboxTab } from "../api";

/**
 * Seleção múltipla da lista do inbox.
 *
 * Modo explícito (como o legado): entrar em "seleção" desativa o clique
 * de abrir conversa nos cards (só o checkbox alterna), evitando abrir a
 * conversa errada por engano ao marcar várias.
 */
export function useInboxSelection(tab: InboxTab[]) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // "Selecionar todas do filtro" — encerra TODAS as conversas do filtro atual
  // (todas as páginas, não só as carregadas). O backend resolve os ids pelo
  // mesmo `where` da lista e processa no leads-worker.
  const [selectAllFilter, setSelectAllFilter] = useState(false);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setSelectAllFilter(false);
  }, []);

  // Identidade estável: vai para cada linha `memo` da coluna.
  const toggleSelectOne = useCallback((id: string) => {
    // Qualquer toggle manual sai do modo "todas do filtro".
    setSelectAllFilter(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Trocar de aba muda o conjunto de conversas visíveis — limpa a seleção
  // pra não arrastar ids que já não aparecem na lista atual.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAllFilter(false);
  }, [tab]);

  return {
    selectionMode,
    setSelectionMode,
    selectedIds,
    setSelectedIds,
    selectAllFilter,
    setSelectAllFilter,
    exitSelectionMode,
    toggleSelectOne,
  };
}
