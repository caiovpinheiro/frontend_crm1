"use client";

import { useState, type ReactNode } from "react";
import { Palette } from "lucide-react";

import { cn } from "@/lib/utils";
import { KeepPopover } from "./keep-popover";
import { NoteIconButton } from "./note-icon-button";
import { KEEP_COLOR_LABEL, KEEP_COLOR_VAR, KEEP_NOTE_COLORS } from "./palette";
import type { KeepNoteColor } from "./types";

export function NoteColorPicker({
  value,
  onChange,
  trigger,
}: {
  value: KeepNoteColor;
  onChange: (color: KeepNoteColor) => void;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <KeepPopover
      open={open}
      onOpenChange={setOpen}
      className="p-2.5"
      trigger={
        <span
          onClick={(event) => {
            event.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {trigger ?? (
            <NoteIconButton label="Cor" onClick={() => undefined} active={value !== "default"}>
              <Palette className="size-3.5" />
            </NoteIconButton>
          )}
        </span>
      }
    >
      <p className="mb-2 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Cor
      </p>
      <div className="flex flex-wrap gap-1.5">
        {KEEP_NOTE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={KEEP_COLOR_LABEL[color]}
            title={KEEP_COLOR_LABEL[color]}
            onClick={() => {
              onChange(color);
              setOpen(false);
            }}
            className={cn(
              "size-7 rounded-full border border-border transition-shadow",
              value === color && "ring-2 ring-primary ring-offset-2 ring-offset-card",
            )}
            style={{ backgroundColor: KEEP_COLOR_VAR[color] }}
          />
        ))}
      </div>
    </KeepPopover>
  );
}
