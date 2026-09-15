"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

type Side = "top" | "right" | "bottom" | "left";

/**
 * Superfície canônica do tooltip do Design System (glass escuro).
 * Fonte única de verdade para TODOS os tooltips do sistema — reutilizada
 * pelo `TooltipGlass`, pelo `TooltipContent` (components/ui/tooltip) e pelo
 * rótulo do `DockButton` (NavRail). Tokens `--tooltip-bg`/`--tooltip-text`
 * definidos em globals-v2.css (light + dark).
 */
export const tooltipSurfaceClass = cn(
  "select-none rounded-lg px-3 py-2",
  "bg-[var(--tooltip-bg)] text-[var(--tooltip-text)]",
  "font-display text-xs font-semibold leading-tight tracking-tight",
  "shadow-lg ring-1 ring-white/10 backdrop-blur-md",
);

/** Animação de entrada/saída padrão (Radix data-side/data-state). */
export const tooltipMotionClass = cn(
  "origin-(--radix-tooltip-content-transform-origin)",
  "animate-in fade-in-0 zoom-in-95",
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
  "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
);

interface TooltipGlassProps {
  /** Texto exibido no tooltip. */
  label: React.ReactNode;
  /** Elemento que dispara o tooltip (deve aceitar ref e props). */
  children: React.ReactElement;
  side?: Side;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  /** Atraso antes de exibir (ms). */
  delay?: number;
  className?: string;
  /**
   * Sem chrome escuro / seta — o `label` traz a própria superfície
   * (ex.: balões de preview de mensagem no DealCard).
   */
  plain?: boolean;
}

/**
 * Provider global para tooltips — coloque uma vez na raiz do layout V2.
 * Todos os `TooltipGlass` dentro dele compartilham o mesmo contexto.
 */
export function TooltipProvider({
  children,
  delay = 200,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={delay}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

/**
 * Tooltip com o Design System (glass escuro). Requer `TooltipProvider`
 * em um ancestral. Tokens `--tooltip-bg` e `--tooltip-text` do globals-v2.css.
 */
export function TooltipGlass({
  label,
  children,
  side = "top",
  align = "center",
  sideOffset = 8,
  className,
  plain = false,
}: TooltipGlassProps) {
  if (!label) return children;

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            "z-50",
            plain
              ? cn("max-w-none border-0 bg-transparent p-0 shadow-none", tooltipMotionClass)
              : cn("max-w-xs", tooltipSurfaceClass, tooltipMotionClass),
            className,
          )}
        >
          {label}
          {!plain ? (
            <TooltipPrimitive.Arrow
              width={11}
              height={6}
              className="fill-[var(--tooltip-bg)]"
            />
          ) : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
