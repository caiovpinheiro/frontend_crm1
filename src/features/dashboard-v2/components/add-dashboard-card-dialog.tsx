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
  DEFAULT_USAGE_CHART_TYPE,
  type DashboardChartType,
} from "@/features/dashboard-v2/chart-types";
import { ChartTypePicker } from "@/features/dashboard-v2/components/chart-type-picker";
import {
  stageWidgetId,
  type NegociosCustomCard,
} from "@/features/dashboard-v2/use-negocios-grid";
import { cn } from "@/lib/utils";

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

const MODE_OPTIONS = [
  ["preset", "Prontos"],
  ["dynamic", "Dinâmico"],
] as const;

const DYNAMIC_KINDS = [
  ["event", "Por evento"],
  ["customField", "Por campo"],
  ["stage", "Por fase"],
  ["users", "Por usuários"],
] as const;

type CatalogMode = (typeof MODE_OPTIONS)[number][0];
type DynamicKind = (typeof DYNAMIC_KINDS)[number][0];

function pillClass(active: boolean) {
  return cn(
    "rounded-full px-3 py-1.5 text-sm font-semibold",
    active
      ? "bg-primary text-primary-foreground"
      : "border border-border bg-card text-muted-foreground",
  );
}

export function AddDashboardCardDialog({
  open,
  onOpenChange,
  fields,
  stages,
  presentIds,
  presets,
  onAddPreset,
  onAddStage,
  onCreate,
  presetsOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: CustomField[];
  stages: { id: string; name: string }[];
  presentIds: string[];
  presets: { id: string; label: string }[];
  onAddPreset: (id: string, chartType?: DashboardChartType) => void;
  onAddStage: (stageId: string) => void;
  onCreate: (card: NegociosCustomCard) => void;
  presetsOnly?: boolean;
}) {
  const [mode, setMode] = useState<CatalogMode>("preset");
  const [kind, setKind] = useState<DynamicKind>("event");
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "usage");
  const [eventType, setEventType] = useState<string>("messages_in");
  const [fieldId, setFieldId] = useState("");
  const [stageId, setStageId] = useState("");
  const [agg, setAgg] = useState<"count" | "sum">("count");
  const [title, setTitle] = useState("");
  const [chartType, setChartType] = useState<DashboardChartType>(DEFAULT_CARD_CHART_TYPE);

  const present = useMemo(() => new Set(presentIds), [presentIds]);
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
  const selectedPreset = presets.find((p) => p.id === presetId);
  const presetPresent = Boolean(presetId && present.has(presetId));
  const stagePresent = Boolean(stageId && present.has(stageWidgetId(stageId)));
  const showChartType =
    mode === "dynamic"
      ? kind !== "stage"
      : presetId === "usage";

  function reset() {
    setTitle("");
    setChartType(mode === "preset" && presetId === "usage" ? DEFAULT_USAGE_CHART_TYPE : DEFAULT_CARD_CHART_TYPE);
  }

  function submit() {
    if (mode === "preset") {
      if (!presetId || present.has(presetId)) return;
      onAddPreset(presetId, presetId === "usage" ? chartType : undefined);
      reset();
      onOpenChange(false);
      return;
    }
    if (kind === "stage") {
      if (!stageId || present.has(stageWidgetId(stageId))) return;
      onAddStage(stageId);
      setStageId("");
      onOpenChange(false);
      return;
    }
    if (kind === "customField") {
      if (!fieldId) return;
      onCreate({
        id: crypto.randomUUID(),
        type: "customField",
        fieldId,
        fieldName: selectedField?.name,
        agg: canSum ? agg : "count",
        title: title.trim() || selectedField?.label || "Campo personalizado",
        chartType,
      });
    } else {
      const defaultTitle =
        kind === "users"
          ? `Por usuários · ${selectedEvent?.label ?? "Evento"}`
          : selectedEvent?.label || "Card de evento";
      onCreate({
        id: crypto.randomUUID(),
        type: "event",
        eventType,
        title: title.trim() || defaultTitle,
        chartType,
      });
    }
    reset();
    onOpenChange(false);
  }

  const canSubmit =
    mode === "preset"
      ? Boolean(presetId) && !presetPresent
      : kind === "stage"
        ? Boolean(stageId) && !stagePresent
        : kind === "customField"
          ? Boolean(fieldId)
          : true;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Adicionar card"
      description="Insira gráficos prontos ou crie indicadores dinâmicos por campo, fase ou usuários."
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
            disabled={!canSubmit}
          >
            Adicionar
          </ButtonGlass>
        </>
      }
    >
      {presetsOnly ? null : (
        <>
          <span className={formLabelClass}>Catálogo</span>
          <div className="mb-4 flex gap-2">
            {MODE_OPTIONS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setMode(id)} className={pillClass(mode === id)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {mode === "preset" || presetsOnly ? (
        <>
          <span className={formLabelClass}>Gráfico pronto</span>
          <div className="mb-4 grid gap-2">
            {presets.map((item) => {
              const already = present.has(item.id);
              const selected = presetId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setPresetId(item.id);
                    if (item.id === "usage") setChartType(DEFAULT_USAGE_CHART_TYPE);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm font-semibold",
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground",
                  )}
                >
                  <span>{item.label}</span>
                  {already ? (
                    <span className="text-[11px] font-semibold text-muted-foreground">Já no painel</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <span className={formLabelClass}>Tipo</span>
          <div className="mb-4 flex flex-wrap gap-2">
            {DYNAMIC_KINDS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setKind(id)} className={pillClass(kind === id)}>
                {label}
              </button>
            ))}
          </div>

          {kind === "customField" ? (
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
          ) : kind === "stage" ? (
            <>
              <span className={formLabelClass}>Fase</span>
              <select
                className={formControlClass}
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
              >
                <option value="">Selecione</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {present.has(stageWidgetId(s.id)) ? " (já no painel)" : ""}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span className={formLabelClass}>{kind === "users" ? "Métrica" : "Evento"}</span>
              {kind === "users" ? (
                <p className="mb-2 text-sm text-muted-foreground">
                  O gráfico é distribuído por usuário.
                </p>
              ) : null}
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
          )}
        </>
      )}

      {showChartType ? (
        <>
          <span className={`${formLabelClass} mt-4`}>Estilo do gráfico</span>
          <ChartTypePicker
            value={chartType}
            onChange={setChartType}
            className="mb-4"
          />
        </>
      ) : null}

      {mode === "dynamic" && kind !== "stage" ? (
        <>
          <span className={`${formLabelClass} mt-4`}>Título</span>
          <InputGlass
            className={formControlClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              kind === "customField"
                ? selectedField?.label
                : kind === "users"
                  ? `Por usuários · ${selectedEvent?.label ?? ""}`
                  : selectedEvent?.label
            }
          />
        </>
      ) : null}

      {mode === "preset" && selectedPreset && presetPresent ? (
        <p className="text-sm text-muted-foreground">
          Esse gráfico já está no dashboard. Exclua o card para inseri-lo de novo com outro estilo.
        </p>
      ) : null}
    </FormDialog>
  );
}
