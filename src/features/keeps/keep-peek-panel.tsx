"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Copy, Lightbulb } from "lucide-react";
import { toast } from "sonner";

import { HeaderPillToggle } from "@/components/crm/section-header";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { AppLoading } from "@/components/crm/app-loading";
import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { ButtonGlass } from "@/components/crm/button-glass";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formDialogCancelClass } from "@/components/ui/form-dialog";
import { cn } from "@/lib/utils";
import { useKeepCategories, useKeepNotes } from "./hooks";
import type { KeepNote, KeepViewMode } from "./types";
import { keepPreviewText } from "./preview";

async function copyKeepPlainText(note: KeepNote) {
  const text = keepPreviewText(note).trim();
  try {
    await navigator.clipboard.writeText(text || " ");
    toast.success("Texto copiado");
  } catch {
    toast.error("Não foi possível copiar.");
  }
}

function KeepPeekCard({
  note,
  onOpen,
}: {
  note: KeepNote;
  onOpen: (note: KeepNote) => void;
}) {
  return (
    <div
      className={cn(
        CARD_SURFACE_CLASS,
        "keep-note-card flex items-start gap-1 p-3 shadow-none transition-colors hover:border-primary/40",
      )}
      data-keep-color={note.color || undefined}
      data-tour="keeps-peek-card"
    >
      <button type="button" onClick={() => onOpen(note)} className="min-w-0 flex-1 text-left">
        <h3 className="mb-1 truncate pr-1 text-sm font-semibold text-foreground">
          {note.title.trim() || "Sem título"}
        </h3>
        <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {keepPreviewText(note).trim() || "Nota vazia"}
        </p>
      </button>
      <ButtonGlass
        type="button"
        variant="icon"
        size="icon"
        title="Copiar texto"
        tooltipSide="bottom"
        className="size-8 shrink-0 text-muted-foreground"
        aria-label="Copiar texto"
        data-tour="keeps-peek-copy"
        onClick={(e) => {
          e.stopPropagation();
          void copyKeepPlainText(note);
        }}
      >
        <Copy className="size-3.5" />
      </ButtonGlass>
    </div>
  );
}

function NotesGrid({
  notes,
  onOpen,
}: {
  notes: KeepNote[];
  onOpen: (note: KeepNote) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {notes.map((note) => (
        <KeepPeekCard key={note.id} note={note} onOpen={onOpen} />
      ))}
    </div>
  );
}

export function KeepPeekPanel({ className }: { className?: string }) {
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<KeepViewMode>("normal");
  const [open, setOpen] = useState<KeepNote | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const notesQuery = useKeepNotes("notes", q);
  const categoriesQuery = useKeepCategories();
  const items = notesQuery.data?.items ?? [];
  const categories = categoriesQuery.data?.items ?? [];
  const categoriesMode = viewMode === "categories";

  const categorySections = useMemo(() => {
    const byCat = new Map<string, KeepNote[]>();
    const uncategorized: KeepNote[] = [];
    for (const note of items) {
      if (note.categoryId) {
        const list = byCat.get(note.categoryId) ?? [];
        list.push(note);
        byCat.set(note.categoryId, list);
      } else {
        uncategorized.push(note);
      }
    }
    for (const list of byCat.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    uncategorized.sort((a, b) => a.position - b.position);

    return [
      ...categories.map((cat) => ({
        key: cat.id,
        label: cat.name,
        notes: byCat.get(cat.id) ?? [],
      })),
      {
        key: "none",
        label: "Sem categoria",
        notes: uncategorized,
      },
    ];
  }, [categories, items]);

  function toggleSection(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const loading = notesQuery.isLoading || (categoriesMode && categoriesQuery.isLoading);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)} data-tour="keeps-peek">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div data-tour="keeps-peek-search" className="min-w-0 flex-1">
          <SearchFilterBar
            value={q}
            onChange={setQ}
            placeholder="Pesquisar notas..."
            withFilter={false}
            className="min-w-0 flex-1"
          />
          </div>
          <div data-tour="keeps-peek-view">
          <HeaderPillToggle
            value={viewMode}
            onChange={setViewMode}
            options={[
              { key: "normal", label: "Keeps" },
              { key: "categories", label: "Categorias" },
            ]}
          />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <AppLoading variant="inline" className="min-h-[12rem]" />
        ) : items.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            {q.trim() ? "Nenhuma nota encontrada." : "Nenhuma nota no mural."}
          </p>
        ) : categoriesMode ? (
          <div className="space-y-2">
            {categorySections.map((section) => {
              const isOpen = Boolean(expanded[section.key]);
              return (
                <section key={section.key} className="rounded-xl border border-border/60">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.key)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-secondary/50"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform",
                        isOpen ? "rotate-0" : "-rotate-90",
                      )}
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {section.key !== "none" ? (
                        <span
                          data-keep-color={categories.find((c) => c.id === section.key)?.color}
                          className="keep-color-dot size-3 shrink-0 rounded-full border border-border/60"
                          aria-hidden
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">
                        {section.label}
                      </span>
                    </span>
                    <span className="tabular-nums text-[10px] font-semibold text-muted-foreground">
                      {section.notes.length}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="border-t border-border/60 px-3 py-3">
                      {section.notes.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhuma nota nesta categoria.</p>
                      ) : (
                        <NotesGrid notes={section.notes} onOpen={setOpen} />
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <NotesGrid notes={items} onOpen={setOpen} />
        )}
      </div>
      <KeepPeekDialog note={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function KeepPeekDialog({ note, onClose }: { note: KeepNote | null; onClose: () => void }) {
  const images = note?.attachments.filter((a) => a.mimeType.startsWith("image/")) ?? [];

  async function copyText() {
    if (!note) return;
    await copyKeepPlainText(note);
  }

  return (
    <Dialog
      open={!!note}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent size="lg" className="max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="size-4 text-primary" />
            {note?.title.trim() || "Nota"}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 max-h-[55vh] overflow-y-auto px-1 py-2">
          {images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={img.id} src={img.url} alt="" className="mb-3 max-h-64 w-full rounded-xl object-contain" />
          ))}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {note ? keepPreviewText(note).trim() || "Nota vazia" : "Nota vazia"}
          </p>
        </div>
        <DialogFooter>
          <ButtonGlass variant="glass" className={formDialogCancelClass} onClick={onClose}>
            Fechar
          </ButtonGlass>
          <ButtonGlass variant="primary" onClick={() => void copyText()}>
            <Copy className="size-3.5" />
            Copiar texto
          </ButtonGlass>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
