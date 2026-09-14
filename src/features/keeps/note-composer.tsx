"use client";

import { useRef, useState } from "react";
import { Archive, ListChecks, MoreHorizontal, Paperclip, Pin, Upload } from "lucide-react";

import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { cn } from "@/lib/utils";
import { isKeepDocEmpty } from "./helpers";
import {
  checklistToDoc,
  KeepChecklist,
  type KeepCheckItem,
} from "./keep-checklist";
import { KeepPopover } from "./keep-popover";
import { KeepRichEditor } from "./keep-editor";
import { NoteColorPicker } from "./note-color-picker";
import { NoteIconButton } from "./note-icon-button";
import { NoteLabelPicker } from "./note-label-picker";
import { KEEP_COLOR_VAR } from "./palette";
import { EMPTY_KEEP_DOC, type KeepDoc, type KeepLabel, type KeepNoteColor } from "./types";

function emptyItems(): KeepCheckItem[] {
  return [{ id: `li-${Math.random().toString(36).slice(2, 9)}`, text: "", checked: false }];
}

export type NoteComposerDraft = {
  title: string;
  content: KeepDoc;
  file?: File;
  color: KeepNoteColor;
  labelIds: string[];
  pinned: boolean;
  archived: boolean;
};

export function NoteComposer({
  labels,
  pending,
  onCreate,
  onCreateLabel,
  onImportZip,
}: {
  labels: KeepLabel[];
  pending?: boolean;
  onCreate: (input: NoteComposerDraft) => Promise<void>;
  onCreateLabel: (name: string) => string;
  onImportZip?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<KeepDoc>(EMPTY_KEEP_DOC);
  const [checklist, setChecklist] = useState(false);
  const [items, setItems] = useState<KeepCheckItem[]>(emptyItems);
  const [color, setColor] = useState<KeepNoteColor>("default");
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [archived, setArchived] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileHold = useRef<File | null>(null);

  function reset() {
    setTitle("");
    setContent(EMPTY_KEEP_DOC);
    setItems(emptyItems());
    fileHold.current = null;
    setChecklist(false);
    setColor("default");
    setLabelIds([]);
    setPinned(false);
    setArchived(false);
    setMoreOpen(false);
    setOpen(false);
  }

  async function submit() {
    const doc = checklist ? checklistToDoc(items) : content;
    const hasTitle = title.trim().length > 0;
    const hasBody = checklist ? items.some((item) => item.text.trim()) : !isKeepDocEmpty(doc);
    const file = fileHold.current ?? undefined;
    if (!hasTitle && !hasBody && !file) {
      reset();
      return;
    }
    await onCreate({
      title,
      content: doc,
      file,
      color,
      labelIds,
      pinned,
      archived,
    });
    reset();
  }

  const selectedLabels = labels.filter((l) => labelIds.includes(l.id));

  return (
    <div
      className={cn(CARD_SURFACE_CLASS, "mx-auto w-full max-w-xl p-2 shadow-none")}
      style={color === "default" ? undefined : { backgroundColor: KEEP_COLOR_VAR[color] }}
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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-left text-[13px] text-muted-foreground"
          >
            Criar uma nota...
          </button>
          <NoteIconButton
            label="Lista"
            onClick={() => {
              setItems(emptyItems());
              setChecklist(true);
              setOpen(true);
            }}
          >
            <ListChecks className="size-3.5" />
          </NoteIconButton>
          <NoteIconButton label="Anexo" onClick={() => fileRef.current?.click()}>
            <Paperclip className="size-3.5" />
          </NoteIconButton>
        </div>
      ) : (
        <div className="space-y-1.5">
          <input
            autoFocus={!checklist}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            className="w-full bg-transparent px-1.5 pt-1 text-[13px] font-semibold text-foreground outline-none"
          />
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
          {selectedLabels.length > 0 ? (
            <div className="flex flex-wrap gap-1 px-1">
              {selectedLabels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => setLabelIds((ids) => ids.filter((id) => id !== label.id))}
                  className="inline-flex h-5 items-center rounded-full bg-primary/10 px-2 text-[10px] font-semibold text-primary"
                >
                  {label.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-0.5">
            <NoteIconButton
              label="Lista"
              onClick={() => setChecklist((v) => !v)}
              active={checklist}
            >
              <ListChecks className="size-3.5" />
            </NoteIconButton>
            <NoteLabelPicker
              labels={labels}
              selectedIds={labelIds}
              onToggle={(id) =>
                setLabelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
              }
              onCreate={onCreateLabel}
            />
            <NoteColorPicker value={color} onChange={setColor} />
            <NoteIconButton label={pinned ? "Desafixar" : "Fixar"} onClick={() => setPinned((v) => !v)} active={pinned}>
              <Pin className="size-3.5" />
            </NoteIconButton>
            <NoteIconButton label="Anexo" onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-3.5" />
            </NoteIconButton>
            <NoteIconButton
              label="Arquivar"
              onClick={() => setArchived((v) => !v)}
              active={archived}
            >
              <Archive className="size-3.5" />
            </NoteIconButton>
            <KeepPopover
              open={moreOpen}
              onOpenChange={setMoreOpen}
              align="end"
              trigger={
                <NoteIconButton label="Mais" onClick={() => setMoreOpen((v) => !v)}>
                  <MoreHorizontal className="size-3.5" />
                </NoteIconButton>
              }
            >
              {onImportZip ? (
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    onImportZip();
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-xl px-2 text-left text-[13px] hover:bg-primary/10 hover:text-primary"
                >
                  <Upload className="size-3.5" />
                  Importar do Google Keep
                </button>
              ) : null}
            </KeepPopover>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="rounded-full px-2.5 py-1 text-[13px] text-muted-foreground hover:text-foreground"
                onClick={reset}
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void submit()}
                className="rounded-full bg-primary px-3 py-1 text-[13px] font-semibold text-primary-foreground"
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
