"use client";

import { useEffect, useLayoutEffect, useState } from "react";

/**
 * Colapso do cabeçalho de página (ícone + título + busca) — ganha altura
 * pra o chat e para o painel de contato. Persistido em localStorage;
 * hidratado com `useLayoutEffect` pra evitar flash no F5.
 */
export function useInboxHeaderCollapse() {
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [headerHydrated, setHeaderHydrated] = useState(false);
  useLayoutEffect(() => {
    try {
      setHeaderCollapsed(
        window.localStorage.getItem("inbox:header-collapsed") === "1",
      );
    } catch {
      /* ignore */
    }
    setHeaderHydrated(true);
  }, []);
  useEffect(() => {
    if (!headerHydrated) return;
    try {
      window.localStorage.setItem(
        "inbox:header-collapsed",
        headerCollapsed ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [headerCollapsed, headerHydrated]);

  return { headerCollapsed, setHeaderCollapsed, headerHydrated };
}
