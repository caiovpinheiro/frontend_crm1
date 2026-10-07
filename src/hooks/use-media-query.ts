"use client";

import { useEffect, useLayoutEffect, useState } from "react";

// SSR-safe: usa useLayoutEffect no cliente (sync antes do paint, elimina
// o "flash mobile" de 1 frame no desktop) e useEffect no server (evita o
// warning de hydration).
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Hook SSR-safe que reage a media queries CSS.
 *
 * Retorna `initialValue` no server e no primeiro render do client (antes
 * do mount), evitando hydration mismatch. Atualiza assim que o cliente
 * hidrata e responde a mudancas de viewport (resize, orientacao).
 *
 * `initialValue` controla a aposta feita durante o SSR/1o paint. Para
 * um CRM 100% desktop, `useIsDesktop()` aposta `true` — assim o F5 no
 * desktop nao passa por 1 frame de layout mobile (flash coluna-unica
 * antes do useLayoutEffect setar `true`). Em telas mobile o custo e' o
 * inverso (1 frame de desktop), mas o publico e' minoritario.
 *
 * Usar APENAS quando JS e necessario (ex.: trocar texto de placeholder,
 * calculo derivado de breakpoint). Sempre que possivel, prefira a
 * variante CSS-only do Tailwind (`md:hidden`, `hidden md:block`) que
 * elimina hydration flicker e e zero-cost em runtime.
 *
 * Convencao de breakpoints (alinhada com tailwind.config.ts):
 *   - useIsMobile():  < 768px  (md breakpoint)
 *   - useIsTablet():  768-1023 (md-lg)
 *   - useIsDesktop(): >= 1024px (lg+)
 */
export function useMediaQuery(query: string, initialValue = false): boolean {
  const [matches, setMatches] = useState(initialValue);

  useIsoLayoutEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return useMediaQuery("(max-width: 767px)");
}

export function useIsTablet() {
  return useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
}

/** Layout por faixa: celular (< 768), tablet (768–1023) e desktop (>= 1024). */
export type ViewportLayout = "mobile" | "tablet" | "desktop";

/**
 * Faixa de layout atual. Mesmos breakpoints de `useIsMobile/useIsTablet/
 * useIsDesktop`; aposta `desktop` no SSR (ver `useIsDesktop`).
 */
export function useViewportLayout(): ViewportLayout {
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
  if (isDesktop) return "desktop";
  return isTablet ? "tablet" : "mobile";
}

// Default `true`: CRM e' primariamente desktop. Sem esse default, no F5
// o SSR renderiza mobile (`false`) e o cliente pinta 1 frame de layout
// mobile (coluna unica, sem chat/aside) antes do useLayoutEffect flipar
// para desktop — vira "flash mobile → desktop" no F5 de desktop.
// Apostar `true` no server + 1o render elimina esse flash para desktop
// (caso comum). Em mobile, o custo e' inverso: 1 frame de desktop antes
// do media query corrigir — aceitavel dado o publico majoritario.
export function useIsDesktop() {
  return useMediaQuery("(min-width: 1024px)", true);
}
