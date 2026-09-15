"use client";

import { IconCheck, IconMinus } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

interface CheckboxGlassProps {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  "aria-label"?: string;
  className?: string;
}

/** Checkbox no estilo do DS glass, com estados marcado/indeterminado. */
export function CheckboxGlass({
  checked = false,
  indeterminate = false,
  onChange,
  className,
  ...rest
}: CheckboxGlassProps) {
  const active = checked || indeterminate;
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
        "flex h-[20px] w-[20px] shrink-0 cursor-pointer items-center justify-center rounded-md border transition-all duration-200 shadow-sm",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-md"
          : "border-border bg-background text-transparent hover:border-primary hover:bg-secondary hover:shadow-md",
        className,
      )}
    >
      {indeterminate ? (
        <IconMinus size={14} strokeWidth={3.5} />
      ) : (
        <IconCheck size={14} strokeWidth={3.5} />
      )}
    </button>
  );
}
