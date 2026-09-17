"use client";

import { cn } from "@/lib/utils";
import { KEEP_COLOR_LABELS, KEEP_NOTE_COLORS } from "./colors";

export function KeepColorSwatches({
  value,
  selected,
  onChange,
  colors = [...KEEP_NOTE_COLORS],
  labels = KEEP_COLOR_LABELS,
  showDefault = true,
}: {
  value?: string | null;
  selected?: string[];
  onChange: (color: string | null) => void;
  colors?: string[];
  labels?: Record<string, string>;
  showDefault?: boolean;
}) {
  const current = selected ?? [value || "none"];
  function active(id: string) {
    return current.includes(id);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {showDefault ? (
        <button
          type="button"
          title={labels.none ?? "Padrão"}
          aria-label={labels.none ?? "Padrão"}
          aria-pressed={active("none")}
          onClick={() => onChange(null)}
          className={cn(
            "keep-color-dot keep-color-dot-none size-7 rounded-full border border-border",
            active("none") && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
        />
      ) : null}
      {colors.map((id) => (
        <button
          type="button"
          key={id}
          title={labels[id] ?? id}
          aria-label={labels[id] ?? id}
          aria-pressed={active(id)}
          data-keep-color={id}
          onClick={() => onChange(id)}
          className={cn(
            "keep-color-dot size-7 rounded-full border border-border/60",
            active(id) && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
        />
      ))}
    </div>
  );
}
