"use client";

import { useEffect, useState } from "react";
import { CheckSquare } from "lucide-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { cn } from "@/lib/utils";

import {
  createTeamChatWorkItem,
  extractWorkItemEntries,
  messageToChecklist,
  searchTeamChatRecords,
  updateTeamChatWorkItem,
} from "./api";
import type { RecordSearchHit, WorkItem, WorkItemType } from "./types";

export function CreateWorkItemDialog({
  open,
  onOpenChange,
  roomId,
  seedText,
  type = "checklist",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomId: string;
  seedText?: string;
  type?: WorkItemType;
  onCreated?: (item: WorkItem) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [callUrl, setCallUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const raw = seedText?.trim() ?? "";
    if (!raw) {
      setTitle("");
      setBody("");
      return;
    }
    void extractWorkItemEntries(raw).then((r) => {
      setTitle(r.title);
      setBody(r.entries.map((e) => `- ${e.text}`).join("\n"));
    });
  }, [open, seedText]);

  async function submit() {
    setBusy(true);
    try {
      const extracted = await extractWorkItemEntries(body || title);
      const item = await createTeamChatWorkItem({
        type,
        title: title.trim() || extracted.title,
        originType: "room",
        originId: roomId,
        roomId,
        entries: extracted.entries,
        startsAt: type === "meeting" && startsAt ? new Date(startsAt).toISOString() : null,
        callUrl: type === "meeting" ? callUrl.trim() || null : null,
      });
      toast.success(type === "meeting" ? "Reunião criada." : "Checklist criado.");
      onCreated?.(item);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={type === "meeting" ? "Nova reunião" : "Novo checklist"}
      description="Os itens ficam no card. Concluir um item não cria mensagem nova."
      icon={
        <FormDialogIcon>
          <CheckSquare className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <>
          <ButtonGlass type="button" variant="glass" className={formDialogCancelClass} onClick={() => onOpenChange(false)}>
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={busy || !title.trim()}
            onClick={() => void submit()}
          >
            Criar
          </ButtonGlass>
        </>
      }
    >
      <span className={formLabelClass}>Título *</span>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className={formControlClass} />
      {type === "meeting" && (
        <>
          <span className={cn(formLabelClass, "mt-3")}>Quando</span>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={formControlClass}
          />
          <span className={cn(formLabelClass, "mt-3")}>Link da chamada</span>
          <input value={callUrl} onChange={(e) => setCallUrl(e.target.value)} className={formControlClass} />
        </>
      )}
      <span className={cn(formLabelClass, "mt-3")}>Itens</span>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className={cn(formControlClass, "h-32 resize-none py-2")}
        placeholder={"- Ligar para o aluno\n- Enviar proposta"}
      />
    </FormDialog>
  );
}

export function MessageToChecklistDialog({
  open,
  onOpenChange,
  roomId,
  messageId,
  seedText,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomId: string;
  messageId: string;
  seedText: string;
  onCreated?: (item: WorkItem) => void;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void extractWorkItemEntries(seedText).then((r) => setTitle(r.title));
  }, [open, seedText]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Transformar em checklist"
      description="A mensagem vira um card de checklist nesta conversa."
      icon={
        <FormDialogIcon>
          <CheckSquare className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <>
          <ButtonGlass type="button" variant="glass" className={formDialogCancelClass} onClick={() => onOpenChange(false)}>
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void messageToChecklist(roomId, messageId, { title: title.trim() || undefined })
                .then((item) => {
                  toast.success("Checklist criado.");
                  onCreated?.(item);
                  onOpenChange(false);
                })
                .catch((err: Error) => toast.error(err.message))
                .finally(() => setBusy(false));
            }}
          >
            Criar
          </ButtonGlass>
        </>
      }
    >
      <span className={formLabelClass}>Título</span>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className={formControlClass} />
    </FormDialog>
  );
}

export function LinkRecordDialog({
  open,
  onOpenChange,
  workItemId,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workItemId: string | null;
  onLinked?: (item: WorkItem) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<RecordSearchHit[]>([]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (q.trim().length < 1) {
        setHits([]);
        return;
      }
      void searchTeamChatRecords(q)
        .then((r) => setHits(r.records))
        .catch(() => setHits([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, open]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Vincular a um registro"
      description="Negócio, atendimento ou contato."
      icon={
        <FormDialogIcon>
          <CheckSquare className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <ButtonGlass type="button" variant="glass" className={formDialogCancelClass} onClick={() => onOpenChange(false)}>
          Fechar
        </ButtonGlass>
      }
    >
      <span className={formLabelClass}>Buscar</span>
      <input value={q} onChange={(e) => setQ(e.target.value)} className={formControlClass} placeholder="Nome ou número" />
      <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border">
        {hits.map((hit) => (
          <button
            key={`${hit.type}:${hit.id}`}
            type="button"
            className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted"
            onClick={() => {
              if (!workItemId) return;
              void updateTeamChatWorkItem(workItemId, { anchor: { type: hit.type, id: hit.id } })
                .then((item) => {
                  toast.success("Vinculado.");
                  onLinked?.(item);
                  onOpenChange(false);
                })
                .catch((err: Error) => toast.error(err.message));
            }}
          >
            <span className="text-[13px] font-semibold">{hit.title}</span>
            <span className="text-[12px] text-muted-foreground">{hit.subtitle}</span>
          </button>
        ))}
      </div>
    </FormDialog>
  );
}
