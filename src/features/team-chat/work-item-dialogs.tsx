"use client";

import { useEffect, useState } from "react";
import { CheckSquare, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { dateKey } from "@/lib/activities-data";
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
  addWorkItemEntry,
  createTeamChatWorkItem,
  deleteTeamChatWorkItem,
  deleteWorkItemEntry,
  extractWorkItemEntries,
  messageToChecklist,
  searchTeamChatRecords,
  updateTeamChatWorkItem,
  updateWorkItemEntry,
} from "./api";
import { TopicAssigneePicker } from "./topic-assignee";
import type { RecordSearchHit, WorkItem, WorkItemType } from "./types";

export function isAgendaWorkItem(item: WorkItem) {
  return (
    item.type === "meeting" ||
    item.type === "ata" ||
    item.type === "pauta" ||
    item.originType === "meeting"
  );
}

export function agendaKindLabel(item: WorkItem) {
  if (item.type === "meeting") return "Reunião";
  if (item.type === "pauta") return "Pauta";
  return "Ata";
}

function agendaNoun(item: WorkItem) {
  if (item.type === "meeting") return "reunião";
  if (item.type === "pauta") return "pauta";
  return "ata";
}

export function workItemNoun(item: WorkItem) {
  if (item.type === "checklist") return "checklist";
  if (item.type === "feedback") return "feedback";
  return agendaNoun(item);
}

function agendaEditTitle(item: WorkItem) {
  if (item.type === "meeting") return "Editar reunião";
  if (item.type === "pauta") return "Editar pauta";
  if (item.type === "checklist") return "Editar checklist";
  if (item.type === "feedback") return "Editar feedback";
  return "Editar ata";
}

export function dueAtToDateKey(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateKey(d);
}

export function dateKeyToDueAt(value: string) {
  if (!value) return null;
  const local = new Date(`${value}T09:00:00`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

export function WorkItemDeadlineField({
  value,
  onChange,
  disabled,
  compact,
}: {
  value?: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <DatePicker
      value={dueAtToDateKey(value)}
      onChange={(day) => onChange(dateKeyToDueAt(day))}
      placeholder="Prazo"
      disabled={disabled}
      triggerClassName={compact ? "h-8 w-[7.5rem] rounded-xl px-2 text-[11px]" : undefined}
    />
  );
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function draftKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type DraftLine = {
  key: string;
  id?: string;
  text: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
};

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
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDueAt(null);
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
        entries: extracted.entries.map((entry) => ({
          ...entry,
          dueAt: type === "meeting" ? entry.dueAt : dueAt,
        })),
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
      description="Os itens ficam no card. Um prazo vira tarefa no calendário."
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
      {type !== "meeting" && (
        <>
          <span className={cn(formLabelClass, "mt-3")}>Prazo</span>
          <WorkItemDeadlineField value={dueAt} onChange={setDueAt} />
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

export function EditWorkItemDialog({
  open,
  onOpenChange,
  item,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: WorkItem;
  onUpdated?: (item: WorkItem) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [callUrl, setCallUrl] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(item.title);
    setStartsAt(toLocalInput(item.startsAt));
    setEndsAt(toLocalInput(item.endsAt));
    setCallUrl(item.callUrl ?? "");
    setLines(
      item.entries.map((entry) => ({
        key: entry.id,
        id: entry.id,
        text: entry.text,
        assigneeId: entry.assigneeId,
        assigneeName: entry.assigneeName,
        dueAt: entry.dueAt,
      })),
    );
  }, [open, item]);

  async function submit() {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setBusy(true);
    try {
      let latest = await updateTeamChatWorkItem(item.id, {
        title: nextTitle,
        startsAt: item.type === "meeting" ? (startsAt ? new Date(startsAt).toISOString() : null) : undefined,
        endsAt: item.type === "meeting" ? (endsAt ? new Date(endsAt).toISOString() : null) : undefined,
        callUrl: item.type === "meeting" ? callUrl.trim() || null : undefined,
      });
      const keep = new Set(lines.filter((line) => line.id && line.text.trim()).map((line) => line.id));
      for (const entry of item.entries) {
        if (!keep.has(entry.id)) {
          latest = await deleteWorkItemEntry(item.id, entry.id);
        }
      }
      for (const line of lines) {
        const text = line.text.trim();
        if (!text) continue;
        if (line.id) {
          const prev = item.entries.find((entry) => entry.id === line.id);
          const patch: { text?: string; assigneeId?: string | null; dueAt?: string | null } = {};
          if (prev && prev.text !== text) patch.text = text;
          if (prev && prev.assigneeId !== line.assigneeId) patch.assigneeId = line.assigneeId;
          if (prev && prev.dueAt !== line.dueAt) patch.dueAt = line.dueAt;
          if (Object.keys(patch).length > 0) {
            latest = await updateWorkItemEntry(item.id, line.id, patch);
          }
        } else {
          latest = await addWorkItemEntry(item.id, {
            text,
            assigneeId: line.assigneeId,
            dueAt: line.dueAt,
          });
        }
      }
      toast.success("Alterações salvas.");
      onUpdated?.(latest);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={agendaEditTitle(item)}
      description="Título, prazo, tópicos e responsável de cada linha."
      icon={
        <FormDialogIcon>
          <Pencil className="size-4" />
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
            Salvar
          </ButtonGlass>
        </>
      }
    >
      <span className={formLabelClass}>Título *</span>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className={formControlClass} />
      {item.type === "meeting" && (
        <>
          <span className={cn(formLabelClass, "mt-3")}>Início</span>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={formControlClass}
          />
          <span className={cn(formLabelClass, "mt-3")}>Fim</span>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={formControlClass}
          />
          <span className={cn(formLabelClass, "mt-3")}>Link da chamada</span>
          <input value={callUrl} onChange={(e) => setCallUrl(e.target.value)} className={formControlClass} />
        </>
      )}
      <span className={cn(formLabelClass, "mt-3")}>Tópicos</span>
      <div className="mt-1 flex flex-col gap-1.5">
        {lines.map((line) => (
          <div key={line.key} className="flex flex-wrap items-center gap-1.5">
            <input
              value={line.text}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((row) => (row.key === line.key ? { ...row, text: e.target.value } : row)),
                )
              }
              className={cn(formControlClass, "min-w-[10rem] flex-1")}
            />
            <WorkItemDeadlineField
              compact
              value={line.dueAt}
              onChange={(next) =>
                setLines((prev) =>
                  prev.map((row) => (row.key === line.key ? { ...row, dueAt: next } : row)),
                )
              }
            />
            <TopicAssigneePicker
              assigneeId={line.assigneeId}
              assigneeName={line.assigneeName}
              onChange={(next) =>
                setLines((prev) =>
                  prev.map((row) =>
                    row.key === line.key
                      ? { ...row, assigneeId: next.id, assigneeName: next.name }
                      : row,
                  ),
                )
              }
            />
            <button
              type="button"
              aria-label="Remover tópico"
              onClick={() => setLines((prev) => prev.filter((row) => row.key !== line.key))}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setLines((prev) => [
              ...prev,
              { key: draftKey(), text: "", assigneeId: null, assigneeName: null, dueAt: null },
            ])
          }
          className="self-start text-[12px] font-semibold text-primary hover:underline"
        >
          Adicionar tópico
        </button>
      </div>
    </FormDialog>
  );
}

export function WorkItemManageButtons({
  item,
  onUpdated,
  onDeleted,
  className,
}: {
  item: WorkItem;
  onUpdated?: (item: WorkItem) => void;
  onDeleted?: (id: string) => void;
  className?: string;
}) {
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState(false);
  const noun = workItemNoun(item);

  return (
    <div className={cn("flex shrink-0 items-center gap-0.5", className)}>
      <TooltipGlass label="Editar" side="top">
        <button
          type="button"
          aria-label={`Editar ${noun}`}
          onClick={() => setEditing(true)}
          className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
      </TooltipGlass>
      <TooltipGlass label="Excluir" side="top">
        <button
          type="button"
          aria-label={`Excluir ${noun}`}
          onClick={() =>
            void confirm({
              title: `Excluir ${noun}?`,
              description: `“${item.title}” sai desta conversa. Esta ação não pode ser desfeita.`,
              confirmLabel: "Excluir",
              pendingLabel: "Excluindo…",
              destructive: true,
              action: async () => {
                try {
                  await deleteTeamChatWorkItem(item.id);
                  onDeleted?.(item.id);
                  toast.success("Excluído.");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
                  throw err;
                }
              },
            })
          }
          className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </TooltipGlass>
      <EditWorkItemDialog open={editing} onOpenChange={setEditing} item={item} onUpdated={onUpdated} />
      {dialog}
    </div>
  );
}
