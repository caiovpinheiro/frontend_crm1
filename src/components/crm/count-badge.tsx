import { cn } from "@/lib/utils";

type CountBadgeProps = {
  value: number;
  highlight?: boolean;
  className?: string;
};

/** Badge de contagem — fila, seção ou total do seletor. */
export function CountBadge({ value, highlight = false, className }: CountBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        highlight
          ? "bg-[var(--inbox-brand)] text-[var(--color-primary-foreground)]"
          : "bg-[var(--glass-bg-subtle)] text-[var(--inbox-text-muted)]",
        className,
      )}
    >
      {value.toLocaleString("pt-BR")}
    </span>
  );
}
