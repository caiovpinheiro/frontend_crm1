"use client";

import { RotateCw, CircleHelp, Info } from "lucide-react";

import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { unavailableNoticeText } from "@/features/dashboard-v2/service-availability";
import { cn } from "@/lib/utils";

export function PainelCard({
  title,
  subtitle,
  info,
  action,
  wrapAction = false,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  info?: string;
  action?: React.ReactNode;
  /** A ação desce para a linha de baixo quando não cabe ao lado do título. */
  wrapAction?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(CARD_SURFACE_CLASS, "p-3.5", className)}>
      {(title || action) && (
        <header
          className={cn(
            "mb-2.5 flex items-start justify-between gap-3",
            wrapAction && "flex-wrap gap-y-2",
          )}
        >
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
          {action ? (
            <div className={cn("shrink-0", wrapAction && "ml-auto")}>{action}</div>
          ) : null}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Ícone (?) com explicação no `title` (passar o mouse) e o mesmo texto para
 * leitor de tela. Mesmo desenho do `info` do `PainelCard`.
 */
export function InfoHint({ text, className }: { text: string; className?: string }) {
  return (
    <span
      data-info-hint=""
      title={text}
      className={cn("inline-flex shrink-0 cursor-help text-muted-foreground", className)}
    >
      <CircleHelp className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </span>
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

/** Aviso discreto e único: gráficos que o ambiente não consegue servir. */
export function PainelUnavailableNotice({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p
      role="status"
      data-painel-unavailable
      className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
    >
      <Info className="size-3.5 shrink-0" aria-hidden />
      {unavailableNoticeText(count)}
    </p>
  );
}

export function PainelKpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <PainelSkeleton key={i} className="h-[72px]" />
      ))}
    </div>
  );
}

/** Mesmo desenho do "Agora": 3 cards numa linha e a espera embaixo. */
export function PainelAgoraSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <PainelSkeleton key={i} className="h-[72px]" />
      ))}
      <PainelSkeleton className="col-span-full h-[104px]" />
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
  if (message === "omitido") {
    return <PainelSkeleton className="min-h-[72px]" />;
  }
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

/**
 * Estado vazio compacto: o card inteiro numa linha (~56 px) — título, a frase
 * e, se houver, a ação do cabeçalho (ex.: "Ver por"). Antes, rankings,
 * transferências e "Por usuário" vazios ocupavam 130–218 px para uma frase.
 */
export function PainelEmptyCard({
  title,
  message,
  action,
  className,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      data-painel-empty-compact
      className={cn(
        CARD_SURFACE_CLASS,
        "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5",
        className,
      )}
    >
      <h3 className="shrink-0 text-[15px] font-bold text-foreground">{title}</h3>
      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={message}>
        {message}
      </p>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </section>
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
        "px-4 py-5 text-center",
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
