"use client";

import { useRef, useState } from "react";
import { ListChecks, Paperclip } from "lucide-react";

import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { cn } from "@/lib/utils";
import {
  checklistToDoc,
  KeepChecklist,
  type KeepCheckItem,
} from "./keep-checklist";
import { KeepRichEditor } from "./keep-editor";
import { EMPTY_KEEP_DOC, type KeepDoc } from "./types";

function emptyItems(): KeepCheckItem[] {
  return [{ id: `li-${Math.random().toString(36).slice(2, 9)}`, text: "", checked: false }];
}

export function KeepComposer({
  onCreate,
  pending,
}: {
  onCreate: (input: { title: string; content: KeepDoc; file?: File }) => Promise<void>;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<KeepDoc>(EMPTY_KEEP_DOC);
  const [checklist, setChecklist] = useState(false);
  const [items, setItems] = useState<KeepCheckItem[]>(emptyItems);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileHold = useRef<File | null>(null);

  function reset() {
    setTitle("");
    setContent(EMPTY_KEEP_DOC);
    setItems(emptyItems());
    fileHold.current = null;
    setChecklist(false);
    setOpen(false);
  }

  async function submit() {
    const doc = checklist ? checklistToDoc(items) : content;
    await onCreate({ title, content: doc, file: fileHold.current ?? undefined });
    reset();
  }

  return (
    <div className={cn(CARD_SURFACE_CLASS, "mx-auto w-full max-w-xl p-3 shadow-none")}>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          fileHold.current = e.target.files?.[0] ?? null;
          e.target.value = "";
          setOpen(true);
        }}
      />
      {!open ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-w-0 flex-1 rounded-xl px-3 py-2 text-left text-sm text-muted-foreground"
          >
            Criar uma nota...
          </button>
          <TooltipGlass label="Lista" side="bottom">
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Lista"
              onClick={() => {
                setItems(emptyItems());
                setChecklist(true);
                setOpen(true);
              }}
            >
              <ListChecks className="size-4" />
            </button>
          </TooltipGlass>
          <TooltipGlass label="Imagem" side="bottom">
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Imagem"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </button>
          </TooltipGlass>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            autoFocus={!checklist}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            className="w-full bg-transparent pb-2 text-sm font-semibold text-foreground outline-none"
          />
          <div className="border-t border-border" aria-hidden />
          {checklist ? (
            <KeepChecklist items={items} onChange={setItems} autoFocus />
          ) : (
            <KeepRichEditor
              content={content}
              onChange={setContent}
              compact
              placeholder="Criar uma nota..."
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              onClick={reset}
            >
              Fechar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void submit()}
              className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
            >
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
