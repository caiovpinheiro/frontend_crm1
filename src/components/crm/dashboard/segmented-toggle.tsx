"use client";

import { cn } from "@/lib/utils";

/** Seletor compacto do card (Comercial/Corrido, Rápidos/Lentos, Pessoas/Departamentos...). */
export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  /** Nome do grupo para leitor de tela. */
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex rounded-xl border border-border bg-card p-0.5 text-xs"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg px-2.5 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            value === option.value
              ? "bg-primary font-semibold text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
