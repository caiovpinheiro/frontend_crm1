"use client";

import { Archive, Paperclip, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { cn } from "@/lib/utils";
import { NoteColorPicker } from "./note-color-picker";
import { NoteIconButton } from "./note-icon-button";
import { NoteLabelPicker } from "./note-label-picker";
import { KEEP_COLOR_VAR } from "./palette";
import type { KeepLabel, KeepLayout, KeepNote, KeepNoteColor } from "./types";
import { isChecklistDoc } from "./keep-checklist";

export function NoteCard({
  note,
  color,
  labels,
  allLabels,
  layout = "grid",
  onOpen,
  onPin,
  onArchive,
  onTrash,
  onRestore,
  onColor,
  onToggleLabel,
  onCreateLabel,
  onMovePointerDown,
  ghost,
  floating,
}: {
  note: KeepNote;
  color: KeepNoteColor;
  labels: KeepLabel[];
  allLabels: KeepLabel[];
  layout?: KeepLayout;
  onOpen: () => void;
  onPin?: () => void;
  onArchive?: () => void;
  onTrash?: () => void;
  onRestore?: () => void;
  onColor?: (color: KeepNoteColor) => void;
  onToggleLabel?: (id: string) => void;
  onCreateLabel?: (name: string) => string;
  onMovePointerDown?: (event: ReactPointerEvent) => void;
  ghost?: boolean;
  floating?: boolean;
}) {
  const preview = note.plainText.slice(0, 220);
  const image = note.attachments.find((a) => a.mimeType.startsWith("image/"));
  const checklist = isChecklistDoc(note.content);
  const list = layout === "list";

  return (
    <article
      data-keep-id={note.id}
      onPointerDown={onMovePointerDown}
      className={cn(
        CARD_SURFACE_CLASS,
        "group relative w-full text-left shadow-none transition-colors hover:border-primary/35",
        list ? "flex items-start gap-3 px-3 py-2.5" : "p-3",
        onMovePointerDown && "cursor-grab touch-none active:cursor-grabbing",
        ghost && "opacity-40",
        floating && "rotate-1 border-primary/40 shadow-lg",
      )}
      style={color === "default" ? undefined : { backgroundColor: KEEP_COLOR_VAR[color] }}
    >
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        {note.title ? (
          <h3 className="text-[13px] font-semibold leading-snug text-foreground">{note.title}</h3>
        ) : null}
        {image && !list ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt="" className="mt-2 max-h-36 w-full rounded-lg object-cover" />
        ) : null}
        {preview ? (
          <p
            className={cn(
              "whitespace-pre-wrap text-[13px] leading-snug text-muted-foreground",
              note.title && "mt-1",
              list && "line-clamp-2",
              !list && "line-clamp-6",
            )}
          >
            {preview}
          </p>
        ) : !note.title ? (
          <p className="text-[13px] italic text-muted-foreground">Nota vazia</p>
        ) : null}
        {labels.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {labels.map((label) => (
              <span
                key={label.id}
                className="inline-flex h-5 max-w-full items-center rounded-full bg-primary/10 px-2 text-[10px] font-semibold text-primary"
              >
                <span className="truncate">{label.name}</span>
              </span>
            ))}
          </div>
        ) : null}
      </button>
      <div
        className={cn(
          "flex items-center gap-0.5",
          list
            ? "shrink-0"
            : "mt-2 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100",
        )}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {onPin ? (
          <NoteIconButton label={note.pinned ? "Desafixar" : "Fixar"} onClick={onPin} active={note.pinned}>
            {note.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </NoteIconButton>
        ) : null}
        {onColor ? <NoteColorPicker value={color} onChange={onColor} /> : null}
        {onToggleLabel && onCreateLabel ? (
          <NoteLabelPicker
            labels={allLabels}
            selectedIds={labels.map((l) => l.id)}
            onToggle={onToggleLabel}
            onCreate={onCreateLabel}
          />
        ) : null}
        {onArchive ? (
          <NoteIconButton
            label={note.archived ? "Desarquivar" : "Arquivar"}
            onClick={onArchive}
          >
            <Archive className="size-3.5" />
          </NoteIconButton>
        ) : null}
        {onRestore ? (
          <NoteIconButton label="Restaurar" onClick={onRestore}>
            <RotateCcw className="size-3.5" />
          </NoteIconButton>
        ) : null}
        {onTrash ? (
          <NoteIconButton
            label={note.trashed ? "Excluir permanentemente" : "Mover para lixeira"}
            onClick={onTrash}
          >
            <Trash2 className="size-3.5" />
          </NoteIconButton>
        ) : null}
        {note.attachments.length > 0 || checklist ? (
          <span className="ml-auto inline-flex items-center gap-1 pr-0.5 text-[10px] text-muted-foreground">
            {checklist ? "Lista" : null}
            {note.attachments.length > 0 ? (
              <>
                <Paperclip className="size-3" />
                {note.attachments.length}
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    </article>
  );
}
