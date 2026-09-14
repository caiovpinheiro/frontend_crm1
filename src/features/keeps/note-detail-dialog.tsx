"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, Paperclip, Pin, PinOff, RotateCcw, Trash2, X } from "lucide-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { formDialogPrimaryClass } from "@/components/ui/form-dialog";
import { cn } from "@/lib/utils";
import {
  checklistFromDoc,
  checklistToDoc,
  KeepChecklist,
  type KeepCheckItem,
} from "./keep-checklist";
import { KeepRichEditor } from "./keep-editor";
import { NoteColorPicker } from "./note-color-picker";
import { NoteIconButton } from "./note-icon-button";
import { NoteLabelPicker } from "./note-label-picker";
import { KEEP_COLOR_VAR } from "./palette";
import { EMPTY_KEEP_DOC, type KeepDoc, type KeepLabel, type KeepNote, type KeepNoteColor } from "./types";

export function NoteDetailDialog({
  note,
  open,
  color,
  labels,
  allLabels,
  onOpenChange,
  onSave,
  onAttach,
  onPin,
  onArchive,
  onTrash,
  onRestore,
  onColor,
  onToggleLabel,
  onCreateLabel,
}: {
  note: KeepNote | null;
  open: boolean;
  color: KeepNoteColor;
  labels: KeepLabel[];
  allLabels: KeepLabel[];
  onOpenChange: (open: boolean) => void;
  onSave: (patch: { title: string; content: KeepDoc }) => Promise<void>;
  onAttach: (file: File) => Promise<void>;
  onPin?: () => void;
  onArchive?: () => void;
  onTrash?: () => void;
  onRestore?: () => void;
  onColor: (color: KeepNoteColor) => void;
  onToggleLabel: (id: string) => void;
  onCreateLabel: (name: string) => string;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<KeepDoc>(EMPTY_KEEP_DOC);
  const [items, setItems] = useState<KeepCheckItem[]>([]);
  const [checklist, setChecklist] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const latest = useRef({ title, content, items, checklist });
  latest.current = { title, content, items, checklist };

  useEffect(() => {
    if (!note) return;
    setTitle(note.title);
    const next = note.content ?? EMPTY_KEEP_DOC;
    setContent(next);
    const parsed = checklistFromDoc(next);
    setChecklist(Boolean(parsed));
    setItems(parsed ?? []);
  }, [note]);

  async function persist() {
    setSaving(true);
    try {
      const cur = latest.current;
      await onSave({
        title: cur.title,
        content: cur.checklist ? checklistToDoc(cur.items) : cur.content,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenChange(next: boolean) {
    if (!next) await persist();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="lg"
        bodyClassName="flex flex-col gap-0 overflow-hidden p-0"
        panelClassName={cn(color !== "default" && "border-border")}
      >
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={color === "default" ? undefined : { backgroundColor: KEEP_COLOR_VAR[color] }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            className="w-full bg-transparent px-5 pb-1 pt-5 text-base font-semibold text-foreground outline-none"
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
            {checklist ? (
              <KeepChecklist items={items} onChange={setItems} />
            ) : (
              <KeepRichEditor content={content} onChange={setContent} />
            )}
            {note && note.attachments.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {note.attachments.map((a) => (
                  <li key={a.id} className="text-[13px]">
                    {a.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.fileName} className="mb-2 max-h-48 rounded-lg" />
                    ) : (
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-primary underline">
                        {a.fileName}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-1">
              {labels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => onToggleLabel(label.id)}
                  className="inline-flex h-6 items-center gap-1 rounded-full bg-primary/10 px-2 text-[11px] font-semibold text-primary"
                >
                  {label.name}
                  <X className="size-3" />
                </button>
              ))}
              <NoteLabelPicker
                labels={allLabels}
                selectedIds={labels.map((l) => l.id)}
                onToggle={onToggleLabel}
                onCreate={onCreateLabel}
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-6 items-center rounded-full border border-dashed border-border px-2 text-[11px] font-semibold text-muted-foreground hover:border-primary hover:text-primary"
                  >
                    + Etiqueta
                  </button>
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-0.5 border-t border-border/70 px-3 py-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void onAttach(file);
              }}
            />
            <NoteColorPicker value={color} onChange={onColor} />
            <NoteLabelPicker
              labels={allLabels}
              selectedIds={labels.map((l) => l.id)}
              onToggle={onToggleLabel}
              onCreate={onCreateLabel}
            />
            {onPin ? (
              <NoteIconButton
                label={note?.pinned ? "Desafixar" : "Fixar"}
                onClick={onPin}
                active={Boolean(note?.pinned)}
              >
                {note?.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </NoteIconButton>
            ) : null}
            {onArchive ? (
              <NoteIconButton
                label={note?.archived ? "Desarquivar" : "Arquivar"}
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
            <NoteIconButton label="Anexo" onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-3.5" />
            </NoteIconButton>
            {onTrash ? (
              <NoteIconButton
                label={note?.trashed ? "Excluir permanentemente" : "Mover para lixeira"}
                onClick={onTrash}
              >
                <Trash2 className="size-3.5" />
              </NoteIconButton>
            ) : null}
            <ButtonGlass
              type="button"
              variant="primary"
              disabled={saving}
              className={cn(formDialogPrimaryClass, "ml-auto h-8")}
              onClick={() => void handleOpenChange(false)}
            >
              Fechar
            </ButtonGlass>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
