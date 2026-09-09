"use client";

import { Archive, Paperclip, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { cn } from "@/lib/utils";
import type { KeepNote } from "./types";

export function KeepCard({
  note,
  onOpen,
  onPin,
  onArchive,
  onTrash,
  onRestore,
  onMovePointerDown,
  ghost,
  floating,
}: {
  note: KeepNote;
  onOpen: () => void;
  onPin?: () => void;
  onArchive?: () => void;
  onTrash?: () => void;
  onRestore?: () => void;
  onMovePointerDown?: (event: ReactPointerEvent) => void;
  ghost?: boolean;
  floating?: boolean;
}) {
  const preview = note.plainText.slice(0, 280);
  const image = note.attachments.find((a) => a.mimeType.startsWith("image/"));

  return (
    <article
      data-keep-id={note.id}
      onPointerDown={onMovePointerDown}
      className={cn(
        CARD_SURFACE_CLASS,
        "w-full p-4 text-left shadow-none transition-colors hover:border-primary/40",
        onMovePointerDown && "cursor-grab touch-none active:cursor-grabbing",
        ghost && "opacity-40",
        floating && "rotate-1 border-primary/40 shadow-lg",
      )}
    >
      <button type="button" onClick={onOpen} className="w-full text-left">
        {note.title ? (
          <h3 className="mb-1.5 text-sm font-semibold leading-snug text-foreground">{note.title}</h3>
        ) : null}
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt="" className="mb-2 max-h-40 w-full rounded-lg object-cover" />
        ) : null}
        {preview ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{preview}</p>
        ) : !note.title ? (
          <p className="text-sm italic text-muted-foreground">Nota vazia</p>
        ) : null}
      </button>
      <div
        className="mt-3 flex items-center gap-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {onPin ? (
          <button
            type="button"
            onClick={onPin}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={note.pinned ? "Desafixar" : "Fixar"}
          >
            {note.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
        ) : null}
        {onArchive ? (
          <button
            type="button"
            onClick={onArchive}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Arquivar"
          >
            <Archive className="size-3.5" />
          </button>
        ) : null}
        {onRestore ? (
          <button
            type="button"
            onClick={onRestore}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Restaurar"
          >
            <RotateCcw className="size-3.5" />
          </button>
        ) : null}
        {onTrash ? (
          <button
            type="button"
            onClick={onTrash}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Mover para lixeira"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
        {note.attachments.length > 0 ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Paperclip className="size-3" />
            {note.attachments.length}
          </span>
        ) : null}
      </div>
    </article>
  );
}
