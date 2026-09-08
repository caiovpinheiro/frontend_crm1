"use client";

import { Search, X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TOUR_GRADIENT_CLASS = "bg-linear-to-r from-brand to-accent-violet";

export type TourCardExtraAction = {
  label: string;
  onClick: () => void;
};

export type TourCardProps = {
  title: string;
  description: string;
  current: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  icon?: ReactNode;
  nextLabel?: string;
  showArrow?: boolean;
  extraActions?: TourCardExtraAction[];
  className?: string;
};

/**
 * Camada de apresentação do tour do sistema. A seta decorativa (`showArrow`)
 * fica fora do overflow para não ser cortada; no product tour a seta do
 * Driver.js continua sendo a que aponta para o elemento destacado.
 */
export function TourCard({
  title,
  description,
  current,
  total,
  onNext,
  onBack,
  onClose,
  icon,
  nextLabel = "Próximo",
  showArrow = false,
  extraActions,
  className,
}: TourCardProps) {
  const isFirst = current <= 1;

  return (
    <div className={cn("relative w-[26rem] max-w-[calc(100vw-2rem)]", className)}>
      {showArrow ? (
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 z-10 size-4 -translate-x-1/2 rotate-45 bg-brand"
        />
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <header className={cn("flex items-center gap-3 px-6 py-4", TOUR_GRADIENT_CLASS)}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
            {icon ?? <Search className="size-5 text-white" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-white/70">
              Tour do sistema
            </p>
            <h2 className="truncate text-base font-semibold text-white">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar tour"
            className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="bg-card p-6">
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          <footer className="mt-6 flex items-center justify-between">
            <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-medium tabular-nums text-muted-foreground">
              {current} / {total}
            </span>
            <div className="flex items-center gap-2">
              {extraActions?.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {action.label}
                </button>
              ))}
              <button
                type="button"
                onClick={onBack}
                disabled={isFirst}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={onNext}
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-semibold text-brand-foreground shadow-lg shadow-brand/30 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2",
                  TOUR_GRADIENT_CLASS,
                )}
              >
                {nextLabel}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
