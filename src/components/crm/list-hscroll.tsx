"use client";

/**
 * Lista larga: o Y fica no scrollport da página (`v2-page-scroll` /
 * `[data-page-scroll]`) para o cabeçalho poder ser sticky. O X também
 * é desse scrollport — header e linhas compartilham a mesma largura
 * (`w-max` no DataView), então as colunas alinham e a barra horizontal
 * aparece na base da tela quando o conteúdo sai da viewport.
 *
 * Não criar overflow-x aqui: isso vira containing block, mata o sticky
 * e, se o header for separado, desalinha o grid (`1fr` / `max-content`).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type StickyHScrollProps = {
  children: ReactNode;
  className?: string;
  /** @deprecated — o X agora é do scrollport da página. */
  scrollerClassName?: string;
  /** Largura mínima do conteúdo (settings / mobile). */
  minWidth?: number;
  fades?: boolean;
};

export function StickyHScroll({
  children,
  className,
  minWidth,
  fades = true,
}: StickyHScrollProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateFades = useCallback(() => {
    const el = wrapRef.current;
    const port = el?.closest(".v2-page-scroll, [data-page-scroll]") as HTMLElement | null;
    if (!port) {
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    const max = port.scrollWidth - port.clientWidth;
    setCanLeft(port.scrollLeft > 2);
    setCanRight(max > 2 && port.scrollLeft < max - 2);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    const port = el?.closest(".v2-page-scroll, [data-page-scroll]") as HTMLElement | null;
    if (!port) return;
    updateFades();
    port.addEventListener("scroll", updateFades, { passive: true });
    const ro = new ResizeObserver(updateFades);
    ro.observe(port);
    if (el) ro.observe(el);
    window.addEventListener("resize", updateFades);
    return () => {
      port.removeEventListener("scroll", updateFades);
      ro.disconnect();
      window.removeEventListener("resize", updateFades);
    };
  }, [updateFades]);

  return (
    <div ref={wrapRef} className={cn("relative min-w-0", className)}>
      <div style={minWidth != null ? { minWidth } : undefined}>{children}</div>
      {fades ? (
        <>
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[var(--bg-base)] via-[color-mix(in_srgb,var(--bg-base)_70%,transparent)] to-transparent transition-opacity duration-200",
              canLeft ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[var(--bg-base)] via-[color-mix(in_srgb,var(--bg-base)_70%,transparent)] to-transparent transition-opacity duration-200",
              canRight ? "opacity-100" : "opacity-0",
            )}
          />
        </>
      ) : null}
    </div>
  );
}

type ListHScrollProps = {
  children: ReactNode;
  className?: string;
  scrollerClassName?: string;
};

export function ListHScroll({
  children,
  className,
}: ListHScrollProps) {
  return <StickyHScroll className={className}>{children}</StickyHScroll>;
}
