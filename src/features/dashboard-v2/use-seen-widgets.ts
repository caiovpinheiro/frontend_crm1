"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Widgets que já entraram na tela (ou chegaram perto dela). Só cresce: um
 * widget visto continua "querido" ao rolar para longe, então trocar filtro ou
 * período refaz o GET dele sem esperar nova intersecção.
 */
export function useSeenIds() {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const markSeen = useCallback((ids: readonly string[]) => {
    setSeen((prev) => {
      if (ids.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);
  return { seen, markSeen };
}

/** Margem abaixo da dobra que já conta como "na tela" (pede antes de chegar). */
export const SEEN_ROOT_MARGIN = "0px 0px 320px 0px";

/**
 * Observa os filhos `[data-seen-id]` de `rootRef` e avisa (uma vez por id) os
 * que cruzam a área visível do `[data-scroll-root]` mais próximo (ou da janela)
 * + `SEEN_ROOT_MARGIN`. Sem IntersectionObserver (SSR,
 * jsdom, navegador antigo) todos contam como vistos — o comportamento antigo
 * de pedir tudo na abertura.
 */
export function useReportSeen(
  rootRef: RefObject<HTMLElement | null>,
  idsKey: string,
  onSeen: ((ids: string[]) => void) | undefined,
  all = false,
) {
  useEffect(() => {
    if (!onSeen) return;
    const root = rootRef.current;
    const ids = idsKey ? idsKey.split("\0") : [];
    if (!root || all || typeof IntersectionObserver === "undefined") {
      if (ids.length) onSeen(ids);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const hits: string[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.seenId;
          if (id) hits.push(id);
          observer.unobserve(entry.target);
        }
        if (hits.length) onSeen(hits);
      },
      {
        // A rolagem é do contêiner da página, não da janela: com ele como raiz
        // a margem vale (com a janela, o que está abaixo é recortado antes).
        root: root.closest<HTMLElement>("[data-scroll-root]"),
        rootMargin: SEEN_ROOT_MARGIN,
      },
    );
    root.querySelectorAll<HTMLElement>("[data-seen-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef, idsKey, onSeen, all]);
}
