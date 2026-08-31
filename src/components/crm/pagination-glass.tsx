"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface PaginationGlassProps {
  /** Texto legado à esquerda (quando não há `total` estruturado). */
  label?: string;
  /** Total de itens — renderiza badge circular + resumo à esquerda. */
  total?: number;
  entityLabel?: string;
  page?: number;
  lastPage?: number;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  className?: string;
  /** Valor atual de itens por página. Quando definido junto de `onPerPageChange`, renderiza o seletor. */
  perPage?: number;
  onPerPageChange?: (value: number) => void;
  /** Opções do seletor de itens por página. Default: 25, 50, 100. */
  perPageOptions?: readonly number[];
  /** Esconde os botões Anterior/Próxima (ex.: listas com scroll infinito). */
  showNav?: boolean;
  /** Total é piso (ex.: busca de contatos no teto 5000) — badge mostra "5.000+". */
  totalCapped?: boolean;
}

const DEFAULT_PER_PAGE_OPTIONS = [25, 50, 100] as const;

/** Página de lista: cresce com as linhas; se a lista for curta, empurra o rodapé ao fundo. */
export const LIST_PAGE_PANE_CLASS = "flex min-h-min flex-1 flex-col";

/** Stack da lista dentro do pane — altura pelo conteúdo, sem esmagar as linhas. */
export const LIST_PAGE_STACK_CLASS = "min-w-0";

/** Mesma escala da meta esquerda e do rótulo "Por página". */
const META_TEXT = "text-sm leading-relaxed text-muted-foreground";

export function PaginationGlass({
  label,
  total,
  entityLabel = "itens",
  page,
  lastPage,
  canPrev = false,
  canNext = false,
  onPrev,
  onNext,
  className,
  perPage,
  onPerPageChange,
  perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
  showNav = true,
  totalCapped = false,
}: PaginationGlassProps) {
  const showPerPage = perPage !== undefined && onPerPageChange !== undefined;
  const hasTotal = typeof total === "number";
  const paged =
    hasTotal && typeof page === "number" && typeof lastPage === "number";

  return (
    <div
      data-pagination-glass
      className={cn(
        "mt-auto flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-3 pb-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {hasTotal ? (
          <>
            <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-border bg-card px-2.5 text-sm font-semibold tabular-nums text-foreground">
              {total.toLocaleString("pt-BR")}
              {totalCapped ? "+" : ""}
            </span>
            <span className={META_TEXT}>
              {paged ? (
                <>
                  {entityLabel} · página{" "}
                  <span className="font-semibold text-foreground">{page}</span>
                  {" "}de{" "}
                  <span className="font-semibold text-foreground">{lastPage}</span>
                </>
              ) : (
                entityLabel
              )}
            </span>
          </>
        ) : label ? (
          <span className={cn("shrink-0", META_TEXT)}>{label}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
        {showPerPage && (
          <div className="flex items-center gap-2">
            <span className={cn("shrink-0", META_TEXT)}>Por página</span>
            <div className="flex items-center rounded-full border border-border bg-card p-1">
              {perPageOptions.map((opt) => {
                const active = opt === perPage;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onPerPageChange?.(opt)}
                    aria-pressed={active}
                    className={cn(
                      "cursor-pointer rounded-full px-3 py-1 text-sm font-semibold tabular-nums transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {showNav && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={!canPrev}
              className={cn(
                "inline-flex items-center justify-center gap-1 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium transition-colors",
                canPrev
                  ? "text-foreground hover:bg-muted/60"
                  : "cursor-not-allowed text-muted-foreground opacity-50",
              )}
            >
              <ChevronLeft size={14} className="shrink-0" />
              Anterior
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              className={cn(
                "inline-flex items-center justify-center gap-1 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium transition-colors",
                canNext
                  ? "text-foreground hover:bg-muted/60"
                  : "cursor-not-allowed text-muted-foreground opacity-50",
              )}
            >
              Próxima
              <ChevronRight size={14} className="shrink-0" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
