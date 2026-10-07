"use client";

import { IconCheck, IconMinus } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

interface CheckboxGlassProps {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  "aria-label"?: string;
  className?: string;
  /**
   * Em toque (`pointer: coarse` ou < md) a área clicável vira 40×40 sem mudar
   * o desenho da caixa (18px). Desktop com mouse: idêntico.
   */
  touchTarget?: boolean;
}

/** Checkbox no estilo do DS glass, com estados marcado/indeterminado. */
export function CheckboxGlass({
  checked = false,
  indeterminate = false,
  onChange,
  className,
  touchTarget = false,
  ...rest
}: CheckboxGlassProps) {
  const active = checked || indeterminate;
  const box = cn(
    "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition-all",
    active
      ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
      : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-transparent hover:border-[var(--brand-primary)]",
  );
  const mark = indeterminate ? (
    <IconMinus size={13} strokeWidth={3} />
  ) : (
    <IconCheck size={13} strokeWidth={3} />
  );
  if (touchTarget) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? "mixed" : checked}
        aria-label={rest["aria-label"]}
        onClick={(e) => {
          e.stopPropagation();
          onChange?.(!checked);
        }}
        className={cn(
          "touch-target-40 group/cb flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center",
          className,
        )}
      >
        <span className={cn(box, "group-hover/cb:border-[var(--brand-primary)]")}>{mark}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={rest["aria-label"]}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className={cn(box, "cursor-pointer", className)}
    >
      {mark}
    </button>
  );
}
