"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";

import type { InboxTab } from "../api";
import { CONVERSATION_REOPENED_EVENT } from "./use-messages";

/**
 * Reabertura de conversa encerrada como NOVO ticket: seleciona o id novo e
 * sai das abas de encerradas.
 */
export function useInboxConversationReopen(
  setActiveId: Dispatch<SetStateAction<string | null>>,
  setTab: (next: SetStateAction<InboxTab[]>) => void,
) {
  /**
   * Após reopen (modelo de ticket): seleciona o id novo e, se o operador
   * estiver na aba Encerradas (`finalizados`), troca para Todas — o ticket
   * OPEN não aparece em Encerradas; sem a troca, a lista some, o sticky do
   * id antigo é limpo e o deep-link pode disparar toast de erro.
   */
  function handleReopenNewConversation(newId: string) {
    setActiveId(newId);
    setTab((current) =>
      current.every((t) => t === "finalizados" || t === "resolvidos")
        ? ["todos"]
        : current,
    );
  }

  // Envio (texto/anexo/áudio) numa conversa encerrada reabre como NOVO
  // ticket — os botões de anexo disparam este evento global (estão fundos
  // demais na árvore pra prop-drilling). Troca o chat ativo pro id novo.
  useEffect(() => {
    function onReopened(e: Event) {
      const newId = (e as CustomEvent<{ newId: string }>).detail?.newId;
      if (!newId) return;
      setActiveId(newId);
      setTab((current) =>
        current.every((t) => t === "finalizados" || t === "resolvidos")
          ? ["todos"]
          : current,
      );
    }
    window.addEventListener(CONVERSATION_REOPENED_EVENT, onReopened);
    return () => window.removeEventListener(CONVERSATION_REOPENED_EVENT, onReopened);
  }, [setActiveId, setTab]);

  return handleReopenNewConversation;
}
