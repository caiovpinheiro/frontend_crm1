"use client";

import { useState } from "react";
import { Copy, Lightbulb } from "lucide-react";
import { toast } from "sonner";

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
import { useKeepNotes } from "./hooks";
import type { KeepNote } from "./types";

export function KeepPeekPanel({ className }: { className?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<KeepNote | null>(null);
  const notesQuery = useKeepNotes("notes", q);
  const items = notesQuery.data?.items ?? [];

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="shrink-0 border-b border-border px-4 py-3">
        <SearchFilterBar
          value={q}
          onChange={setQ}
          placeholder="Pesquisar notas..."
          withFilter={false}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {notesQuery.isLoading ? (
          <AppLoading variant="inline" className="min-h-[12rem]" />
        ) : items.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            {q.trim() ? "Nenhuma nota encontrada." : "Nenhuma nota no mural."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => setOpen(note)}
                className={cn(CARD_SURFACE_CLASS, "p-3 text-left shadow-none transition-colors hover:border-primary/40")}
              >
                <h3 className="mb-1 truncate text-sm font-semibold text-foreground">
                  {note.title.trim() || "Sem título"}
                </h3>
                <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {note.plainText.trim() || "Nota vazia"}
                </p>
              </button>
            ))}
          </div>
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
    const text = note.plainText.trim();
    try {
      await navigator.clipboard.writeText(text || " ");
      toast.success("Texto copiado");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <Dialog open={!!note} onOpenChange={(v) => { if (!v) onClose(); }}>
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
            {note?.plainText.trim() || "Nota vazia"}
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
