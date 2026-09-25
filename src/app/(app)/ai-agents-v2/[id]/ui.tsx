"use client";

/**
 * Peças visuais do editor de agente: superfície branca (contraste real com o
 * fundo cinza do CRM), chip de ícone colorido e controle segmentado.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

/** Cartão branco com borda e sombra leves. Sobrescreve o vidro do <Card>. */
export const SURFACE =
  "rounded-2xl border border-border bg-white text-card-foreground shadow-[0_1px_3px_rgba(15,23,42,0.06)] backdrop-blur-none hover:shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:bg-card";

export const TONES = {
  blue: "bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20",
  violet: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20",
  amber: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20",
  rose: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/20",
  sky: "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20",
  teal: "bg-teal-50 text-teal-600 ring-teal-100 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/20",
  orange: "bg-orange-50 text-orange-600 ring-orange-100 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/20",
  indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20",
} as const;

export type Tone = keyof typeof TONES;

export function IconChip({
  icon: Icon,
  tone = "blue",
  size = "md",
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center ring-1 ring-inset",
        size === "sm" && "size-7 rounded-lg [&>svg]:size-4",
        size === "md" && "size-9 rounded-xl [&>svg]:size-[18px]",
        size === "lg" && "size-11 rounded-xl [&>svg]:size-[22px]",
        TONES[tone],
        className,
      )}
    >
      <Icon />
    </span>
  );
}

/** Etiqueta curta colorida (resultado, assunto, status). */
export function Pill({
  tone = "slate",
  icon: Icon,
  children,
  className,
  title,
}: {
  tone?: Tone;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3 shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Título de bloco com chip de ícone, descrição e ações à direita. */
export function BlockHeader({
  icon,
  tone,
  title,
  description,
  actions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <IconChip icon={icon} tone={tone} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <h3 className="text-[15px] font-semibold leading-tight tracking-tight">{title}</h3>
        {description && <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

/** Escolha única entre poucas opções: trilho cinza, opção ativa em branco. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: React.ReactNode; count?: number; tone?: "danger" | "warning" }>;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-muted", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg font-medium transition-all",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              on
                ? "bg-white text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.12)] dark:bg-card"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums",
                  o.tone === "danger" && o.count > 0
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                    : o.tone === "warning" && o.count > 0
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                      : on
                        ? "bg-slate-100 text-slate-700 dark:bg-muted dark:text-foreground"
                        : "bg-white/70 text-slate-500 dark:bg-card/60",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Abas (Tabs) no mesmo estilo do controle segmentado. */
export const TABS_LIST =
  "h-auto flex-wrap justify-start gap-1 rounded-xl border-0 bg-slate-200/60 p-1 shadow-none backdrop-blur-none dark:bg-muted";
export const TABS_TRIGGER =
  "h-8 rounded-lg px-3.5 text-[13px] data-[state=active]:border-transparent data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgba(15,23,42,0.12)] data-[state=active]:backdrop-blur-none dark:data-[state=active]:bg-card";
