"use client";

import { useEffect, useRef, useState } from "react";
import { Lightbulb, Paperclip } from "lucide-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import {
  FormDialog,
  FormDialogIcon,
  formDialogCancelClass,
  formDialogPrimaryClass,
} from "@/components/ui/form-dialog";
import { KeepRichEditor } from "./keep-editor";
import {
  checklistFromDoc,
  checklistToDoc,
  KeepChecklist,
  type KeepCheckItem,
} from "./keep-checklist";
import type { KeepDoc, KeepNote } from "./types";
import { EMPTY_KEEP_DOC } from "./types";

export function KeepEditorDialog({
  note,
  open,
  onOpenChange,
  onSave,
  onAttach,
}: {
  note: KeepNote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: { title: string; content: KeepDoc }) => Promise<void>;
  onAttach: (file: File) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<KeepDoc>(EMPTY_KEEP_DOC);
  const [items, setItems] = useState<KeepCheckItem[]>([]);
  const [checklist, setChecklist] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!note) return;
    setTitle(note.title);
    const next = note.content ?? EMPTY_KEEP_DOC;
    setContent(next);
    const parsed = checklistFromDoc(next);
    setChecklist(Boolean(parsed));
    setItems(parsed ?? []);
  }, [note]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ title, content: checklist ? checklistToDoc(items) : content });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={note?.title || "Nota"}
      description="Edite o conteúdo, listas e anexos."
      icon={
        <FormDialogIcon>
          <Lightbulb className="size-4" />
        </FormDialogIcon>
      }
      size="xl"
      footer={
        <>
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
          <ButtonGlass type="button" variant="glass" className={formDialogCancelClass} onClick={() => fileRef.current?.click()}>
            <Paperclip className="size-3.5" />
            Anexar
          </ButtonGlass>
          <ButtonGlass type="button" variant="glass" className={formDialogCancelClass} onClick={() => onOpenChange(false)}>
            Fechar
          </ButtonGlass>
          <ButtonGlass type="button" variant="primary" className={formDialogPrimaryClass} disabled={saving} onClick={() => void handleSave()}>
            Salvar
          </ButtonGlass>
        </>
      }
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título"
        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-base font-semibold text-foreground outline-none"
      />
      <div className="my-3 border-t border-border" aria-hidden />
      {checklist ? (
        <KeepChecklist items={items} onChange={setItems} />
      ) : (
        <KeepRichEditor content={content} onChange={setContent} />
      )}
      {note && note.attachments.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {note.attachments.map((a) => (
            <li key={a.id} className="text-sm">
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
    </FormDialog>
  );
}
