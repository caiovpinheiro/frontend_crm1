"use client";

import { useMemo, useState } from "react";
import { LayoutDashboard } from "lucide-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";
import type { CustomField } from "@/components/pipeline/kanban-filters/types";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { EVENT_CONFIG } from "@/components/crm/feed/event-config";
import {
  DEFAULT_CARD_CHART_TYPE,
  type DashboardChartType,
} from "@/features/dashboard-v2/chart-types";
import { ChartTypePicker } from "@/features/dashboard-v2/components/chart-type-picker";
import type { NegociosCustomCard } from "@/features/dashboard-v2/use-negocios-grid";

export const PRESET_EVENT_TYPES = [
  { id: "messages_in", label: "Mensagens recebidas" },
  { id: "messages_out", label: "Mensagens respondidas" },
  { id: "avg_response", label: "Tempo médio de resposta" },
  { id: "queue", label: "Quantidade por fila" },
] as const;

function activityEventOptions() {
  return Object.entries(EVENT_CONFIG)
    .map(([id, cfg]) => ({ id, label: cfg.label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function AddDashboardCardDialog({
  open,
  onOpenChange,
  fields,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: CustomField[];
  onCreate: (card: NegociosCustomCard) => void;
}) {
  const [kind, setKind] = useState<"event" | "customField">("event");
  const [eventType, setEventType] = useState<string>("messages_in");
  const [fieldId, setFieldId] = useState("");
  const [agg, setAgg] = useState<"count" | "sum">("count");
  const [title, setTitle] = useState("");
  const [chartType, setChartType] = useState<DashboardChartType>(DEFAULT_CARD_CHART_TYPE);

  const eventOptions = useMemo(
    () => [
      ...PRESET_EVENT_TYPES,
      ...activityEventOptions().filter((o) => !PRESET_EVENT_TYPES.some((p) => p.id === o.id)),
    ],
    [],
  );

  const selectedEvent = eventOptions.find((o) => o.id === eventType);
  const selectedField = fields.find((f) => f.id === fieldId);
  const canSum = selectedField?.type === "NUMBER";

  function submit() {
    if (kind === "event") {
      onCreate({
        id: crypto.randomUUID(),
        type: "event",
        eventType,
        title: title.trim() || selectedEvent?.label || "Card de evento",
        chartType,
      });
    } else if (fieldId) {
      onCreate({
        id: crypto.randomUUID(),
        type: "customField",
        fieldId,
        fieldName: selectedField?.name,
        agg: canSum ? agg : "count",
        title: title.trim() || selectedField?.label || "Campo personalizado",
        chartType,
      });
    }
    setTitle("");
    setChartType(DEFAULT_CARD_CHART_TYPE);
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Adicionar card"
      description="Crie um indicador por tipo de evento ou campo personalizado de negócio."
      size="lg"
      icon={
        <FormDialogIcon>
          <LayoutDashboard className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <>
          <ButtonGlass variant="glass" className={formDialogCancelClass} onClick={() => onOpenChange(false)}>
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            variant="primary"
            className={formDialogPrimaryClass}
            onClick={submit}
            disabled={kind === "customField" && !fieldId}
          >
            Criar
          </ButtonGlass>
        </>
      }
    >
      <span className={formLabelClass}>Tipo</span>
      <div className="mb-4 flex gap-2">
        {(
          [
            ["event", "Por evento"],
            ["customField", "Por campo personalizado"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              kind === id
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {kind === "event" ? (
        <>
          <span className={formLabelClass}>Evento</span>
          <select
            className={formControlClass}
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          >
            {eventOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <span className={formLabelClass}>Campo do negócio</span>
          <select
            className={formControlClass}
            value={fieldId}
            onChange={(e) => setFieldId(e.target.value)}
          >
            <option value="">Selecione</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          {canSum ? (
            <>
              <span className={`${formLabelClass} mt-4`}>Agregação</span>
              <select
                className={formControlClass}
                value={agg}
                onChange={(e) => setAgg(e.target.value as "count" | "sum")}
              >
                <option value="count">Contagem</option>
                <option value="sum">Soma</option>
              </select>
            </>
          ) : null}
        </>
      )}

      <span className={`${formLabelClass} mt-4`}>Tipo de gráfico</span>
      <ChartTypePicker value={chartType} onChange={setChartType} className="mb-4" />

      <span className={`${formLabelClass} mt-4`}>Título</span>
      <InputGlass
        className={formControlClass}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={kind === "event" ? selectedEvent?.label : selectedField?.label}
      />
    </FormDialog>
  );
}
