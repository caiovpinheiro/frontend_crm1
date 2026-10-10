"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { SessionInfo } from "../api";
import { matchesConversationUrlRef } from "./use-inbox-url-sync";
import {
  isInboxConversationDeniedError,
  purgePhantomInboxConversation,
} from "./use-realtime";

/**
 * Mantém a lista do inbox coerente com o que o GET de mensagens da
 * conversa ativa revelou (sessão de 24h e acesso negado).
 */
export function useInboxActiveConversationSync(params: {
  activeId: string | null;
  setActiveId: Dispatch<SetStateAction<string | null>>;
  conversationApiId: string | null;
  sessionInfo: SessionInfo | undefined;
  messagesErrorObj: unknown;
}) {
  const { activeId, setActiveId, conversationApiId, sessionInfo, messagesErrorObj } =
    params;
  const qc = useQueryClient();

  // Alinha o card da lista com a sessão do chat (GET messages = contact+canal).
  // Ticket só-template / lastInbound denormalizado stale ficava sem "Expirada"
  // no card enquanto o composer já bloqueava envio.
  useEffect(() => {
    if (!conversationApiId || !sessionInfo) return;
    const nextInbound = sessionInfo.lastInboundAt ?? null;
    qc.setQueriesData<{
      pages: { items: { id: string; lastInboundAt: string | null }[] }[];
      pageParams: unknown[];
    }>({ queryKey: ["inbox-conversations"] }, (old) => {
      if (!old?.pages) return old;
      let changed = false;
      const pages = old.pages.map((page) => {
        const items = (page.items ?? []).map((row) => {
          if (row.id !== conversationApiId && !matchesConversationUrlRef(row, activeId)) return row;
          const prev = row.lastInboundAt ?? null;
          if (prev === nextInbound) return row;
          changed = true;
          return { ...row, lastInboundAt: nextInbound };
        });
        return { ...page, items };
      });
      return changed ? { ...old, pages } : old;
    });
  }, [activeId, conversationApiId, sessionInfo, sessionInfo?.lastInboundAt, sessionInfo?.active, qc]);

  // Card na lista que o servidor recusa: o ticket está com outro agente.
  // Tira da lista em vez de deixar o chat vazio com "não foi possível
  // carregar as mensagens" — e evita o clique repetido no mesmo fantasma.
  useEffect(() => {
    if (!conversationApiId) return;
    if (!isInboxConversationDeniedError(messagesErrorObj)) return;
    purgePhantomInboxConversation(qc, conversationApiId);
    toast.error("Conversa não encontrada ou sem permissão.");
    setActiveId(null);
  }, [conversationApiId, messagesErrorObj, qc, setActiveId]);
}
