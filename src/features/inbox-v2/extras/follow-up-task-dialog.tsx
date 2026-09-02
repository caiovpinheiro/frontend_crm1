"use client";

import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { useCreateActivity } from "@/features/directory-v2/hooks";

function defaultLocalDatetime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FollowUpTaskDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  dealId,
  submitting,
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId?: string | null;
  contactName?: string | null;
  dealId?: string | null;
  submitting?: boolean;
  /** Depois que a tarefa entrou no calendário — aí sim conclui o Acompanhar. */
  onScheduled: () => void;
}) {
  const defaultTitle = contactName?.trim()
    ? `Acompanhar ${contactName.trim()}`
    : "Acompanhar conversa";
  const [title, setTitle] = useState(defaultTitle);
  const [scheduled, setScheduled] = useState(defaultLocalDatetime);
  const createActivity = useCreateActivity();
  const busy = createActivity.isPending || Boolean(submitting);

  useEffect(() => {
    if (!open) return;
    setTitle(
      contactName?.trim()
        ? `Acompanhar ${contactName.trim()}`
        : "Acompanhar conversa",
    );
    setScheduled(defaultLocalDatetime());
  }, [open, contactName]);

  async function handleCreate() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Informe o título da tarefa.");
      return;
    }
    if (!scheduled.trim()) {
      toast.error("Informe data e hora no calendário.");
      return;
    }
    const when = new Date(scheduled);
    if (Number.isNaN(when.getTime())) {
      toast.error("Data inválida.");
      return;
    }
    try {
      await createActivity.mutateAsync({
        type: "TASK",
        title: trimmed,
        scheduledAt: when.toISOString(),
        completed: false,
        contactId: contactId ?? null,
        dealId: dealId ?? null,
      });
      toast.success("Tarefa criada no seu calendário.");
      onScheduled();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar tarefa");
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title="Agendar acompanhamento"
      description="Defina a data no calendário. Só depois o ticket vai para Resolvendo."
      icon={
        <FormDialogIcon>
          <CalendarPlus className="size-4" />
        </FormDialogIcon>
      }
      size="sm"
      footer={
        <>
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={busy}
            onClick={() => void handleCreate()}
          >
            {busy ? "Agendando…" : "Agendar"}
          </ButtonGlass>
        </>
      }
    >
      <div>
        <span className={formLabelClass}>Título *</span>
        <InputGlass
          className={formControlClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Acompanhar contato"
        />
      </div>
      <div>
        <span className={formLabelClass}>Data e hora *</span>
        <InputGlass
          type="datetime-local"
          className={formControlClass}
          value={scheduled}
          onChange={(e) => setScheduled(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}
