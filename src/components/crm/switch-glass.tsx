"use client"

import { cn } from "@/lib/utils"

interface SwitchGlassProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  size?: "sm" | "md" | "list"
  "aria-label"?: string
  className?: string
}

export function SwitchGlass({
  checked,
  onChange,
  disabled,
  size = "md",
  className,
  ...rest
}: SwitchGlassProps) {
  const dims =
    size === "sm"
      ? { track: "h-5 w-9", knob: "size-3.5", travel: "translate-x-4" }
      : size === "list"
        ? { track: "h-7 w-12", knob: "size-5", travel: "translate-x-6" }
        : { track: "h-6 w-11", knob: "size-4.5", travel: "translate-x-5" }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest["aria-label"]}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        dims.track,
        checked ? "bg-primary" : "bg-input",
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          "pointer-events-none inline-block transform rounded-full bg-primary-foreground shadow-sm transition-transform duration-200",
          dims.knob,
          checked ? dims.travel : "translate-x-1",
        )}
      />
    </button>
  )
}
