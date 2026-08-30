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
 * Envolve listas/tabelas largas. A largura mínima empurra o overflow-x
 * para o scrollport da página — header e linhas ficam no mesmo fluxo
 * (colunas alinhadas + sticky no Y).
 */
export function MobileTableScroll({
  children,
  minWidth = 720,
  className,
}: MobileTableScrollProps) {
  return (
    <StickyHScroll className={cn(className)} minWidth={minWidth} fades={false}>
      {children}
    </StickyHScroll>
  );
}
