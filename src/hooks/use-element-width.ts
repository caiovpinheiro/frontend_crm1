"use client";

import { useEffect, useState } from "react";

/**
 * Largura (px de layout) de um elemento, acompanhando resize. Ref por callback:
 * funciona mesmo quando o elemento só aparece depois (ex.: depois do carregamento).
 * Sem `ResizeObserver` (SSR/jsdom) devolve `fallback`.
 */
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const next = el.clientWidth;
      if (next > 0) setWidth((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return { ref: setEl, width };
}
