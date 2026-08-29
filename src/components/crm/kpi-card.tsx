"use client";

import { cn } from "@/lib/utils";

export const KPI_TONES = {
  brand: "bg-chip-blue-soft text-chip-blue",
  violet: "bg-chip-violet-soft text-chip-violet",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  orange: "bg-chip-orange-soft text-chip-orange",
  red: "bg-chip-red-soft text-chip-red",
  neutral: "bg-secondary text-muted-foreground",
} as const;

export type KpiTone = keyof typeof KPI_TONES;

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  /** Texto auxiliar ao lado do valor (ex.: "de 5"). */
  hint?: string;
  /** Rótulo de estado presente ao lado do título (ex.: "hoje"). */
  badge?: string;
  icon: React.ReactNode;
  tone?: KpiTone;
  /** Quando true, destaca o card (filtro/segmento ativo). */
  active?: boolean;
  /** Se passado, o card vira botão acionável. */
  onClick?: () => void;
  className?: string;
  /** Força o layout compacto (padding/ícone/valor menores) em qualquer breakpoint. */
  compact?: boolean;
};

/**
 * Mini-KPI do padrão Automações: ícone à esquerda + label sentence-case + valor.
 * Usado em Automações, Contatos e Empresas.
 */
export function KpiCard({
  label,
  value,
  hint,
  badge,
  icon,
  tone = "brand",
  active = false,
  onClick,
  className,
  compact = false,
}: KpiCardProps) {
  const classNames = cn(
    "flex items-center gap-3.5 rounded-xl border p-4 text-left transition-all",
    "max-sm:gap-2.5 max-sm:p-3",
    compact && "gap-2.5 p-3",
    active
      ? "border-primary bg-primary/10"
      : "border-border bg-card",
    onClick &&
      !active &&
      "cursor-pointer hover:border-primary/30 hover:bg-secondary/50",
    className,
  );

  const body = (
    <>
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          "max-sm:size-9",
          compact && "size-9",
          KPI_TONES[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="flex items-baseline gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
          <span>{label}</span>
          {badge ? (
            <span className="font-medium text-muted-foreground/80">{badge}</span>
          ) : null}
        </p>
        <p
          className={cn(
            "mt-0.5 flex min-w-0 items-baseline gap-1.5 text-2xl font-bold tracking-tight",
            "max-sm:text-xl",
            compact && "text-xl",
          )}
        >
          <span className="min-w-0 truncate">{value}</span>
          {hint && (
            <small className="shrink-0 text-lg font-medium text-muted-foreground">
              {hint}
            </small>
          )}
        </p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={classNames}
      >
        {body}
      </button>
    );
  }

  return <div className={classNames}>{body}</div>;
}

export type KpiSquareItem = {
  key: string;
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  /** Tom do ícone (padrão Contatos/Empresas). */
  tone?: KpiTone;
  /** Cor CSS alternativa ao tone (padrão Logs/Distribuição). */
  accent?: string;
  percent?: number;
  active?: boolean;
  onClick?: () => void;
};

const KPI_SQUARE_SCROLL_CLASS =
  "-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden lg:hidden";

/**
 * Faixa mobile/APK: KPIs em quadrados com h-scroll (libera altura de tela).
 * Em `lg+` não renderiza — o caller mantém o grid/desktop separado.
 */
export function KpiSquareScroll({
  items,
  className,
}: {
  items: readonly KpiSquareItem[];
  className?: string;
}) {
  return (
    <div className={cn(KPI_SQUARE_SCROLL_CLASS, className)}>
      {items.map((item) => {
        const classNames = cn(
          "flex aspect-square w-[104px] shrink-0 flex-col justify-between rounded-xl border p-2.5 text-left transition-colors",
          item.active
            ? "border-primary bg-primary/10"
            : "border-border bg-card",
          item.onClick && !item.active && "cursor-pointer",
        );

        const iconWrap = item.tone ? (
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-[var(--radius-md)] [&>svg]:size-4",
              KPI_TONES[item.tone],
            )}
          >
            {item.icon}
          </span>
        ) : (
          <span
            className="flex size-7 items-center justify-center rounded-full"
            style={
              item.accent
                ? {
                    background: `color-mix(in srgb, ${item.accent} 14%, transparent)`,
                    color: item.accent,
                  }
                : undefined
            }
          >
            {item.icon}
          </span>
        );

        const body = (
          <>
            {iconWrap}
            <div className="min-w-0">
              <div className="flex items-baseline gap-1">
                <p className="truncate text-lg font-extrabold leading-none tabular-nums text-foreground">
                  {item.value}
                </p>
                {item.percent !== undefined && (
                  <span
                    className="font-display text-[10px] font-bold tabular-nums"
                    style={item.accent ? { color: item.accent } : undefined}
                  >
                    {item.percent}%
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-[10px] font-semibold leading-tight tracking-wide text-muted-foreground">
                {item.label}
              </p>
            </div>
          </>
        );

        if (item.onClick) {
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={item.active}
              onClick={item.onClick}
              className={classNames}
            >
              {body}
            </button>
          );
        }

        return (
          <div key={item.key} className={classNames}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
