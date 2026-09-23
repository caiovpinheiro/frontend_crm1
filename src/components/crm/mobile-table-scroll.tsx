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
 * Envolve listas/tabelas largas. No desktop a largura mínima segue no
 * scrollport da página (colunas alinhadas + sticky no Y). No mobile o
 * X fica neste bloco: a página, os cards e a barra de baixo não saem
 * da tela.
 */
export function MobileTableScroll({
  children,
  minWidth = 720,
  className,
}: MobileTableScrollProps) {
  return (
    <div
      className={cn(
        "w-full min-w-0 max-w-full",
        "max-md:overflow-x-auto max-md:overscroll-x-contain max-md:[-webkit-overflow-scrolling:touch]",
        className,
      )}
    >
      <StickyHScroll minWidth={minWidth} fades={false}>
        {children}
      </StickyHScroll>
    </div>
  );
}
