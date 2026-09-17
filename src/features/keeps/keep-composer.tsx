"use client";

import { useRef, useState } from "react";
import { Folder, ListChecks, Paperclip } from "lucide-react";

import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  checklistToDoc,
  KeepChecklist,
  type KeepCheckItem,
} from "./keep-checklist";
import { KeepRichEditor } from "./keep-editor";
import { EMPTY_KEEP_DOC, type KeepCategory, type KeepDoc } from "./types";

function emptyItems(): KeepCheckItem[] {
  return [{ id: `li-${Math.random().toString(36).slice(2, 9)}`, text: "", checked: false }];
}

export function KeepComposer({
  onCreate,
  pending,
  categories,
}: {
  onCreate: (input: {
    title: string;
    content: KeepDoc;
    file?: File;
    categoryId?: string | null;
  }) => Promise<void>;
  pending?: boolean;
  /** Quando informado (modo Categorias), mostra o seletor no rodapé do composer. */
  categories?: KeepCategory[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<KeepDoc>(EMPTY_KEEP_DOC);
  const [checklist, setChecklist] = useState(false);
  const [items, setItems] = useState<KeepCheckItem[]>(emptyItems);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileHold = useRef<File | null>(null);

  const showCategoryPicker = categories !== undefined;
  const selectedCategory = categories?.find((c) => c.id === categoryId) ?? null;

  function reset() {
    setTitle("");
    setContent(EMPTY_KEEP_DOC);
    setItems(emptyItems());
    fileHold.current = null;
    setChecklist(false);
    setCategoryId(null);
    setOpen(false);
  }

  async function submit() {
    const doc = checklist ? checklistToDoc(items) : content;
    await onCreate({
      title,
      content: doc,
      file: fileHold.current ?? undefined,
      ...(showCategoryPicker ? { categoryId } : {}),
    });
    reset();
  }

  return (
    <div
      className={cn(CARD_SURFACE_CLASS, "keep-note-card mx-auto w-full max-w-xl p-3 shadow-none")}
      data-keep-color={selectedCategory?.color || undefined}
    >
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
          <div className="flex items-center gap-2">
            {showCategoryPicker ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Categoria"
                  className={cn(
                    "inline-flex max-w-[12rem] items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm",
                    selectedCategory
                      ? "bg-secondary font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Folder className="size-3.5 shrink-0" />
                  <span className="truncate">{selectedCategory?.name ?? "Categoria"}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[10rem]">
                  <DropdownMenuItem onClick={() => setCategoryId(null)}>
                    Sem categoria
                  </DropdownMenuItem>
                  {(categories ?? []).map((cat) => (
                    <DropdownMenuItem
                      key={cat.id}
                      className="flex items-center"
                      onClick={() => setCategoryId(cat.id)}
                    >
                      <span
                        data-keep-color={cat.color}
                        className="keep-color-dot mr-2 size-3 rounded-full border border-border/60"
                        aria-hidden
                      />
                      {cat.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <div className="ml-auto flex gap-2">
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
        </div>
      )}
    </div>
  );
}
