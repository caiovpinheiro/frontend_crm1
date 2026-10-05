"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconCheck,
  IconListCheck,
  IconLock,
  IconPencil,
  IconPin,
  IconPinFilled,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type NoteRowProps = {
  content: ReactNode;
  senderName?: string | null;
  time: string;
  isPinned?: boolean;
  className?: string;
  onPinNote?: (noteId: string | null) => void;
  onAddToLog?: (content: string) => void;
  /** Editar o texto da nota. Retornar Promise mantém o modo de edição até concluir. */
  onEditNote?: (noteId: string, content: string) => void | Promise<unknown>;
  /** Excluir a nota (confirmação fica a cargo do caller). */
  onDeleteNote?: (noteId: string) => void;
  noteId?: string;
  logContent?: string;
};

const actionBtnClass =
  "flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)] hover:text-[var(--brand-primary)]";

function NoteAction({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            actionBtnClass,
            danger &&
              "hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)]",
          )}
          aria-label={label}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Nota interna manual (humano). Card com cadeado + rótulo azul "NOTA".
 * Visual preservado do MessageBubble — distinto da linha de EVENT.
 */
export function NoteRow({
  content,
  senderName,
  time,
  isPinned,
  className,
  onPinNote,
  onAddToLog,
  onEditNote,
  onDeleteNote,
  noteId,
  logContent,
}: NoteRowProps) {
  const canEdit = !!(onEditNote && noteId);
  const canDelete = !!(onDeleteNote && noteId);
  const hasNoteActions = !!(onPinNote || onAddToLog || canEdit || canDelete);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(logContent ?? "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editing]);

  const startEdit = () => {
    setDraft(logContent ?? "");
    setEditing(true);
  };
  const cancelEdit = () => {
    if (saving) return;
    setEditing(false);
  };
  const saveEdit = async () => {
    if (!onEditNote || !noteId || saving) return;
    const next = draft.trim();
    if (!next) return;
    if (next === (logContent ?? "").trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onEditNote(noteId, next);
      setEditing(false);
    } catch {
      /* caller toasts; mantém edição aberta */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "group relative flex w-full items-start gap-2.5 rounded-[var(--radius-lg)] border px-3.5 py-2 text-sm leading-[1.45] transition-colors",
        isPinned
          ? "border-[color-mix(in_srgb,var(--brand-primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_8%,var(--glass-bg-base))]"
          : "border-[color-mix(in_srgb,var(--text-muted)_18%,transparent)] bg-[color-mix(in_srgb,var(--text-muted)_7%,var(--glass-bg-base))]",
        className,
      )}
    >
      {isPinned && (
        <span className="absolute -top-1.5 right-8 flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--brand-primary)_15%,var(--glass-bg-base))] px-1.5 py-0.5">
          <IconPinFilled size={9} className="text-[var(--brand-primary)]" />
          <span className="font-display text-[8px] font-bold uppercase tracking-wider text-[var(--brand-primary)]">
            fixada
          </span>
        </span>
      )}

      <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
        <IconLock
          size={13}
          className="text-[var(--brand-primary)]"
          aria-hidden
        />
        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-[var(--brand-primary)]">
          Nota
        </span>
      </span>
      <span className="sr-only">Nota interna. </span>

      <span className="h-3.5 w-px shrink-0 bg-[color-mix(in_srgb,var(--text-muted)_25%,transparent)]" aria-hidden />

      {editing ? (
        <span className="flex min-w-0 flex-1 items-end gap-1.5">
          <textarea
            ref={textareaRef}
            value={draft}
            rows={1}
            disabled={saving}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void saveEdit();
              }
            }}
            aria-label="Editar nota"
            className="min-h-[1.6rem] w-full resize-none rounded-md border border-[color-mix(in_srgb,var(--brand-primary)_35%,transparent)] bg-[var(--glass-bg-base)] px-2 py-0.5 text-sm leading-[1.45] text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
          />
          <NoteAction label="Salvar (Enter)" onClick={() => void saveEdit()}>
            <IconCheck size={13} aria-hidden />
          </NoteAction>
          <NoteAction label="Cancelar (Esc)" onClick={cancelEdit}>
            <IconX size={13} aria-hidden />
          </NoteAction>
        </span>
      ) : (
        <div className="min-w-0 flex-1 text-[var(--text-primary)]">{content}</div>
      )}

      {hasNoteActions && !editing && (
        <span className="ml-1 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onPinNote && (
            <NoteAction
              label={isPinned ? "Desafixar nota" : "Fixar nota"}
              onClick={() =>
                isPinned ? onPinNote(null) : onPinNote(noteId ?? null)
              }
            >
              {isPinned ? (
                <IconPinFilled size={13} aria-hidden />
              ) : (
                <IconPin size={13} aria-hidden />
              )}
            </NoteAction>
          )}
          {canEdit && (
            <NoteAction label="Editar nota" onClick={startEdit}>
              <IconPencil size={13} aria-hidden />
            </NoteAction>
          )}
          {onAddToLog && (
            <NoteAction
              label="Adicionar ao log do negócio"
              onClick={() => onAddToLog(logContent ?? "")}
            >
              <IconListCheck size={13} aria-hidden />
            </NoteAction>
          )}
          {canDelete && (
            <NoteAction
              label="Excluir nota"
              danger
              onClick={() => onDeleteNote?.(noteId as string)}
            >
              <IconTrash size={13} aria-hidden />
            </NoteAction>
          )}
        </span>
      )}

      <span className="ml-auto mt-0.5 flex shrink-0 items-center gap-2">
        {senderName && (
          <span className="font-display text-[11px] font-semibold text-[var(--text-secondary)]">
            {senderName}
          </span>
        )}
        <time className="font-mono text-[10.5px] tabular-nums text-[var(--text-muted)]">
          {time}
        </time>
      </span>
    </div>
  );
}
