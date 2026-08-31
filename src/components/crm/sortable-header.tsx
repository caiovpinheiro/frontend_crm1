"use client";

import { IconChevronDown, IconChevronUp, IconSelector } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc" | null;

/** Raio canônico de card de conteúdo (lista, KPI, empty). Não usar rounded-2xl. */
export const CARD_RADIUS_CLASS = "rounded-xl";

/** Superfície canônica (empty/error). Linha de lista: `LIST_CARD_ROW_CLASS`. */
export const CARD_SURFACE_CLASS =
  "rounded-xl border border-border bg-card";

/** Container canônico de lista "card por linha". */
export const LIST_CARD_STACK_CLASS = "flex flex-col gap-2.5";

/**
 * Pipes verticais entre colunas (referência: Empresas/Contatos).
 * Pseudo-elemento no filho — não adiciona nós ao grid, então
 * `grid-template-columns` das linhas continua alinhado.
 */
export const LIST_HEAD_PIPES_CLASS = [
  "[&>*]:self-stretch",
  "[&>:not(:last-child)]:relative",
  "[&>:not(:last-child)]:after:pointer-events-none",
  "[&>:not(:last-child)]:after:absolute",
  "[&>:not(:last-child)]:after:top-1/2",
  "[&>:not(:last-child)]:after:right-1",
  "[&>:not(:last-child)]:after:z-[1]",
  "[&>:not(:last-child)]:after:h-4",
  "[&>:not(:last-child)]:after:w-px",
  "[&>:not(:last-child)]:after:-translate-y-1/2",
  "[&>:not(:last-child)]:after:bg-border",
  "[&>:not(:last-child)]:after:content-['']",
].join(" ");

/** Cada linha da lista é um card independente. */
export const LIST_CARD_ROW_CLASS =
  "rounded-xl border border-border bg-card px-5 py-3.5 transition-colors hover:border-primary/30 hover:bg-secondary/40";

/**
 * Track da coluna Ações — largura definida, igual no cabeçalho e na linha.
 * `max-content` desalinha: o label "Ações" é estreito e os botões da linha
 * são largos, então cada grid (head vs row) resolve a coluna diferente.
 * 13rem cabe o cluster de ícones (Contatos) e Redistribuir+Editar (Distribuição)
 * sem absorver o stretch (`1fr` fica na coluna principal).
 */
export const LIST_ACTIONS_TRACK = "13rem";

/** Célula Ações: preenche o track e alinha o cluster à direita (sob o label). */
export const LIST_ACTIONS_CELL_CLASS =
  "flex w-full min-w-0 flex-nowrap items-center justify-end gap-1";

/**
 * Sticky column cabeçalho — opaque canvas, pins just below PageHeader.
 * `list-col-head` is the hook for H-scroll wrappers that re-parent this row.
 */
export const LIST_COL_HEAD_STICKY_CLASS =
  "list-col-head sticky top-0 z-30 bg-[var(--bg-base)]";

/** Faixa de cabeçalho de colunas — padrão card por linha.
 *  Default `grid`; passe a classe `flex` para tabelas com scroll-X (contatos).
 *  Pipes entre colunas vêm de `LIST_HEAD_PIPES_CLASS`. */
export function listTableHeadRowClass(className?: string) {
  const usesFlex = /(^|\s)flex(\s|$)/.test(className ?? "");
  return cn(
    "min-h-12 items-center justify-start gap-4 px-5 py-3.5 text-muted-foreground",
    LIST_COL_HEAD_STICKY_CLASS,
    LIST_HEAD_PIPES_CLASS,
    !usesFlex && "grid",
    className,
  );
}

/** Cabeçalho de colunas solto — sem borda, sem caixa alta. Pipes por padrão. */
export const LIST_CARD_HEAD_CLASS = listTableHeadRowClass("hidden lg:grid");

/** Rótulo estático de coluna (sem ordenação). Mesma tipografia do SortableHeader. */
export function ListColumnLabel({
  children,
  className,
  align = "left",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <span
      className={cn(
        "flex w-full min-w-0 items-center font-display text-[13px] font-semibold tracking-normal text-muted-foreground",
        align === "right" && "justify-end text-right",
        align === "center" && "justify-center text-center",
        className,
      )}
    >
      {children}
    </span>
  );
}

interface SortableHeaderProps {
  label: string;
  sort?: SortDir;
  onSort?: () => void;
  align?: "left" | "right";
  className?: string;
}

/**
 * Cabeçalho de coluna ordenável — padrão canônico de listas (referência: Empresas).
 * Sentence case, 13px, ícones de sort; sem caixa alta.
 * `w-full` para o pipe (::after do grid item) ficar na borda da coluna, não colado no texto.
 */
export function SortableHeader({
  label,
  sort = null,
  onSort,
  align = "left",
  className,
}: SortableHeaderProps) {
  return (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        "group flex w-full min-w-0 cursor-pointer items-center gap-1 rounded-sm px-1 py-0.5 text-left font-display text-[13px] font-semibold tracking-normal transition-colors",
        sort
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground",
        align === "right" && "flex-row-reverse justify-end text-right",
        className,
      )}
      aria-label={`Ordenar por ${label}`}
      aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : "none"}
    >
      {label}
      {sort === "asc" ? (
        <IconChevronUp size={12} strokeWidth={2.5} className="shrink-0" />
      ) : sort === "desc" ? (
        <IconChevronDown size={12} strokeWidth={2.5} className="shrink-0" />
      ) : (
        <IconSelector size={12} className="shrink-0 opacity-50 group-hover:opacity-100" />
      )}
    </button>
  );
}
