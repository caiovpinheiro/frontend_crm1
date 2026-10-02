"use client";

import { useEffect, useState } from "react";

import { COMPOSER_FOCUS_CHAT_EVENT } from "@/lib/composer-insert";

export type InboxMobilePaneTab = "chat" | "negocio";

/** Painel visível no mobile (Chat ou Negócio) da conversa aberta. */
export function useInboxMobilePane(activeId: string | null) {
  const [mobilePaneTab, setMobilePaneTab] = useState<InboxMobilePaneTab>("chat");

  // Ao abrir uma nova conversa no mobile, volta sempre para o painel Chat.
  useEffect(() => {
    setMobilePaneTab("chat");
  }, [activeId]);

  // "Enviar produto" na aba Negócio: o Composer só existe na aba Chat —
  // troca o painel pra montar o composer e aplicar o texto pendente.
  useEffect(() => {
    function onFocusChat() {
      setMobilePaneTab("chat");
    }
    window.addEventListener(COMPOSER_FOCUS_CHAT_EVENT, onFocusChat);
    return () => {
      window.removeEventListener(COMPOSER_FOCUS_CHAT_EVENT, onFocusChat);
    };
  }, []);

  return [mobilePaneTab, setMobilePaneTab] as const;
}
