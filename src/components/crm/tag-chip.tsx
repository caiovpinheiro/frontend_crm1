"use client";

import * as React from "react";
import { IconCheck } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export type TagChipProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  "color" | "title" | "onClick" | "children"
> & {
  name: string;
  color?: string | null;
  /** Contador auxiliar (ex.: uso em deals) exibido à direita do nome. */
  count?: number | null;
  selected?: boolean;
  size?: "sm" | "md";
  className?: string;
  /**
   * Tooltip NATIVO do browser. Só passe onde o chip não estiver dentro de
   * um tooltip do DS (`TooltipGlass`/`TooltipHost`) — os dois juntos
   * mostram a caixa preta do Chrome por cima do balão glass.
   */
  title?: string;
  onClick?: () => void;
  "aria-pressed"?: boolean;
};

/**
 * Chip canônico de tag — mesmo visual dos filtros do funil/inbox:
 * fundo suave da cor + borda; estado selecionado = preenchimento sólido.
 *
 * Encaminha `ref` e props extras para o elemento raiz: sem isso o
 * `Trigger asChild` do Radix (TooltipGlass/TooltipHost) não consegue
 * ancorar nem escutar o hover no chip.
 */
export const TagChip = React.forwardRef<HTMLElement, TagChipProps>(function TagChip({
  name,
  color,
  count,
  selected = false,
  size = "sm",
  className,
  title,
  onClick,
  "aria-pressed": ariaPressed,
  ...rest
}, ref) {
  const chipColor = color || "#6366f1";
  const Comp: React.ElementType = onClick ? "button" : "span";
  // Só reserva o check em chips interativos (filtros/listas). Em chips de
  // exibição (card/fila) o ícone invisível deslocava o rótulo e parecia
  // cortado/fora do centro.
  const showCheckSlot = Boolean(onClick) || selected;

  return (
    <Comp
      {...rest}
      ref={ref as React.Ref<HTMLButtonElement>}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={ariaPressed ?? (onClick ? selected : undefined)}
      title={title}
      className={cn(
        // h fixa + leading-none: evita clip vertical em pais com overflow
        // (fila Flow / nowrap). Truncate fica no <span> interno.
        "inline-flex max-w-full min-w-0 items-center justify-center gap-1 border font-display font-semibold leading-none transition-all",
        size === "md"
          ? "h-7 rounded-[8px] px-2.5 text-[12.5px]"
          : "h-5 rounded-[6px] px-2 text-[11px]",
        selected && "text-white shadow-sm",
        onClick && "cursor-pointer",
        className,
      )}
      style={
        selected
          ? {
              background: chipColor,
              borderColor: chipColor,
              boxShadow: `0 0 0 2px color-mix(in srgb, ${chipColor} 25%, transparent)`,
            }
          : {
              background: `color-mix(in srgb, ${chipColor} 18%, var(--color-bg-card))`,
              borderColor: `color-mix(in srgb, ${chipColor} 40%, var(--color-border))`,
              color: `color-mix(in srgb, ${chipColor} 45%, var(--color-card-foreground))`,
            }
      }
    >
      {/* Reserva espaço do check só quando há toggle — evita reflow em
          flex-wrap quando selected muda no meio de um gesto de clique. */}
      {showCheckSlot ? (
        <IconCheck
          size={size === "md" ? 12 : 10}
          stroke={3}
          className={cn("shrink-0", !selected && "invisible")}
          aria-hidden={!selected}
        />
      ) : null}
      <span className="min-w-0 truncate text-center">{name}</span>
      {count != null && (
        <small
          className={cn(
            "tabular-nums",
            selected ? "opacity-80" : "opacity-65",
          )}
        >
          {count.toLocaleString("pt-BR")}
        </small>
      )}
    </Comp>
  );
});
