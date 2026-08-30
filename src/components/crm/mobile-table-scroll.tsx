"use client";

import { StickyHScroll } from "@/components/crm/list-hscroll";
import { cn } from "@/lib/utils";

type MobileTableScrollProps = {
  children: React.ReactNode;
  /** Largura mínima do conteúdo interno para viabilizar o scroll horizontal. Default 720px. */
  minWidth?: number;
  className?: string;
};

/**
 * Envolve listas/tabelas largas (cabeçalho `listTableHeadRowClass` + linhas
 * em `LIST_GRID`) para que, em telas estreitas (APK/mobile), o usuário role
 * horizontalmente em vez de ter colunas cortadas/espremidas.
 *
 * Reuses StickyHScroll so the column cabeçalho can pin on the page Y-scroll
 * (overflow-x alone would otherwise kill `position: sticky`).
 */
export function MobileTableScroll({
  children,
  minWidth = 720,
  className,
}: MobileTableScrollProps) {
  return (
    <StickyHScroll
      className={cn(className)}
      minWidth={minWidth}
      fades={false}
    >
      {children}
    </StickyHScroll>
  );
}
