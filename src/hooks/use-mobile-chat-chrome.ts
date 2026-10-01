"use client";

import { useEffect } from "react";

/**
 * No mobile (< md), marca `html[data-mobile-chat-open="1"]` enquanto a
 * tela imersiva estiver montada (chat da Inbox ou editor de automação).
 * A MobileBottomNav se esconde e, no chat, o composer fica fixo na base.
 *
 * Contado por referência: o painel do negócio e o `ChatArea` dentro dele
 * chamam o hook ao mesmo tempo — desmontar um (ex.: trocar para a aba
 * Notas) não pode apagar a marca enquanto o outro continua ativo.
 */
let activeCount = 0;

function applyChrome(mobile: boolean) {
  const root = document.documentElement;
  if (activeCount > 0 && mobile) {
    root.dataset.mobileChatOpen = "1";
  } else {
    delete root.dataset.mobileChatOpen;
  }
}

export function useMobileChatChrome(active = true) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    if (typeof window.matchMedia !== "function") return;

    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = () => applyChrome(mql.matches);

    activeCount += 1;
    applyChrome(mql.matches);
    mql.addEventListener("change", onChange);
    return () => {
      activeCount = Math.max(0, activeCount - 1);
      mql.removeEventListener("change", onChange);
      applyChrome(mql.matches);
    };
  }, [active]);
}
