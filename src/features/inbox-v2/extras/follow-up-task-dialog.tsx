"use client";

import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId?: string | null;
  contactName?: string | null;
}) {
  const defaultTitle = contactName?.trim()
    ? `Acompanhar ${contactName.trim()}`
    : "Acompanhar conversa";
  const [title, setTitle] = useState(defaultTitle);
  const [scheduled, setScheduled] = useState(defaultLocalDatetime);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        type: "TASK",
        title: trimmed,
        scheduledAt: when.toISOString(),
      };
      if (contactId) body.contactId = contactId;
      const res = await apiFetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.message === "string" ? data.message : "Erro ao criar tarefa",
        );
      }
      toast.success("Tarefa criada no seu calendário.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar tarefa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title="Nova tarefa"
      description="Agende o acompanhamento no calendário do agente."
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
            {busy ? "Criando…" : "Criar"}
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
