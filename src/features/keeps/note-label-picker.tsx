"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, Plus, Tag } from "lucide-react";

import { cn } from "@/lib/utils";
import { KeepPopover } from "./keep-popover";
import { NoteIconButton } from "./note-icon-button";
import type { KeepLabel } from "./types";

export function NoteLabelPicker({
  labels,
  selectedIds,
  onToggle,
  onCreate,
  trigger,
  align = "start",
}: {
  labels: KeepLabel[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onCreate: (name: string) => string;
  trigger?: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const query = draft.trim().toLowerCase();
  const visible = query
    ? labels.filter((l) => l.name.toLowerCase().includes(query))
    : labels;
  const canCreate =
    draft.trim().length > 0 &&
    !labels.some((l) => l.name.toLowerCase() === draft.trim().toLowerCase());

  function create() {
    const name = draft.trim();
    if (!name) return;
    const id = onCreate(name);
    if (id) onToggle(id);
    setDraft("");
  }

  return (
    <KeepPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDraft("");
      }}
      align={align}
      className="w-60 p-2"
      trigger={
        <span
          onClick={(event) => {
            event.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {trigger ?? (
            <NoteIconButton label="Etiqueta" onClick={() => undefined} active={selectedIds.length > 0}>
              <Tag className="size-3.5" />
            </NoteIconButton>
          )}
        </span>
      }
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (canCreate) create();
            else if (visible[0]) onToggle(visible[0].id);
          }
        }}
        placeholder="Buscar ou criar..."
        className="mb-1.5 h-8 w-full rounded-xl border border-border bg-card px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
      />
      <div className="max-h-52 overflow-y-auto">
        {visible.length === 0 && !canCreate ? (
          <p className="px-2 py-2 text-[12px] text-muted-foreground">Nenhuma etiqueta.</p>
        ) : null}
        {visible.map((label) => {
          const on = selected.has(label.id);
          return (
            <button
              key={label.id}
              type="button"
              onClick={() => onToggle(label.id)}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-xl px-2 text-left text-[13px] text-foreground hover:bg-primary/10 hover:text-primary",
                on && "bg-primary/10 text-primary",
              )}
            >
              <Tag className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{label.name}</span>
              {on ? <Check className="size-3.5 shrink-0" /> : null}
            </button>
          );
        })}
        {canCreate ? (
          <button
            type="button"
            onClick={create}
            className="mt-0.5 flex h-8 w-full items-center gap-2 rounded-xl px-2 text-left text-[13px] text-primary hover:bg-primary/10"
          >
            <Plus className="size-3.5 shrink-0" />
            <span className="truncate">Criar “{draft.trim()}”</span>
          </button>
        ) : null}
      </div>
    </KeepPopover>
  );
}
