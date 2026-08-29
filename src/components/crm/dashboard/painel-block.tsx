"use client";

import { RotateCw, CircleHelp } from "lucide-react";

import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { cn } from "@/lib/utils";

export function PainelCard({
  title,
  subtitle,
  info,
  action,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  info?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(CARD_SURFACE_CLASS, "p-5", className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h3 className="flex items-center gap-1.5 text-[15px] font-bold text-foreground">
                <span>{title}</span>
                {info ? (
                  <span title={info} className="inline-flex text-muted-foreground">
                    <CircleHelp className="size-3.5" />
                  </span>
                ) : null}
              </h3>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

export function PainelSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        CARD_SURFACE_CLASS,
        "animate-pulse bg-secondary/40",
        className,
      )}
    />
  );
}

export function PainelKpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <PainelSkeleton key={i} className="h-[88px]" />
      ))}
    </div>
  );
}

export function PainelAgoraSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <PainelSkeleton key={i} className="h-[108px]" />
      ))}
    </div>
  );
}

export function PainelBlockError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className={cn(
        CARD_SURFACE_CLASS,
        "flex flex-col items-center gap-3 p-6 text-center",
      )}
    >
      <p className="text-sm text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-secondary"
      >
        <RotateCw className="size-3.5" />
        Tentar de novo
      </button>
    </div>
  );
}

export function PainelEmpty({
  title,
  description,
  embedded = false,
}: {
  title: string;
  description?: string;
  /** Sem card extra quando já está dentro de `PainelCard`. */
  embedded?: boolean;
}) {
  return (
    <div
      className={cn(
        "px-6 py-12 text-center",
        !embedded && CARD_SURFACE_CLASS,
      )}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
