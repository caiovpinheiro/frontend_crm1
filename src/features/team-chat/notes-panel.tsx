"use client";

import { useState } from "react";
import { Pin, PinOff, StickyNote, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";

import type { TeamChatNote } from "./types";

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function NotesPanel({
  notes,
  onAdd,
  onTogglePin,
  onDelete,
  onClose,
}: {
  notes: TeamChatNote[];
  onAdd: (text: string) => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const ordered = [...notes].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  function submit() {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
  }

  return (
    <aside className="flex h-full flex-col border-l border-border bg-card">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-primary">
            <StickyNote className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Notas</h2>
            <p className="text-[11px] text-muted-foreground">Só você vê estas notas</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar notas" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="border-b border-border p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder="Escreva uma nota rápida…"
          className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2.5 text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘/Ctrl + Enter</kbd> salva
          </span>
          <button type="button" onClick={submit} disabled={!draft.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-40">
            Adicionar
          </button>
        </div>
      </div>
      <div className="chat-scroll flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {ordered.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">Nenhuma nota ainda.</p>
        ) : (
          ordered.map((note) => (
            <div key={note.id} className={cn("group rounded-lg border p-3", note.pinned ? "border-primary/25 bg-primary/10" : "border-border bg-muted")}>
              <p className="whitespace-pre-wrap break-words text-[13.5px] text-foreground">{note.text}</p>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={cn("flex items-center gap-1 text-[11px]", note.pinned ? "text-primary" : "text-muted-foreground")}>
                  {note.pinned && <Pin className="h-3 w-3 fill-current" />}
                  {formatDate(note.createdAt)}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <button type="button" onClick={() => onTogglePin(note.id)} aria-label="Fixar nota" className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                    {note.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => onDelete(note.id)} aria-label="Excluir nota" className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
