"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconBolt,
  IconCheck,
  IconChevronDown,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { FormDialog } from "@/components/ui/form-dialog";
import { useAutomations } from "@/features/automations-v2/hooks";
import type { AutomationListItemDto } from "@/features/automations-v2/api";
import {
  useChannelOptions,
  useFieldOptions,
  useTagOptions,
  type Opt,
} from "@/components/automations/editor-data";
import {
  newDefaultCondition,
  sanitizeConditions,
  type TriggerCondition,
} from "./trigger-conditions";

// ─── Gatilhos de estágio disponíveis ─────────────────────────────

interface StageTriggerOption {
  value: string;
  label: string;
  description: string;
}

const STAGE_TRIGGERS: StageTriggerOption[] = [
  {
    value: "STAGE_ENTERED",
    label: "Quando criado nesta etapa",
    description: "Executa ao mover ou criar um negócio nesta etapa.",
  },
  {
    value: "STAGE_MOVED_IN",
    label: "Quando movido para etapa",
    description: "Executa ao mover um negócio para a etapa escolhida.",
  },
  {
    value: "STAGE_EXITED",
    label: "Quando sair desta etapa",
    description: "Executa ao mover um negócio para outra etapa.",
  },
  {
    value: "DEAL_CREATED",
    label: "Quando negócio for criado",
    description: "Executa apenas na criação do negócio nesta etapa.",
  },
  {
    value: "MESSAGE_RECEIVED",
    label: "Quando mensagem for recebida",
    description: "Executa ao receber uma mensagem do contato.",
  },
  {
    value: "DEAL_WON",
    label: "Quando negócio for ganho",
    description: "Executa ao marcar o negócio como ganho.",
  },
  {
    value: "DEAL_LOST",
    label: "Quando negócio for perdido",
    description: "Executa ao marcar o negócio como perdido.",
  },
];

// ─── Componente de select glass ───────────────────────────────────

function SelectGlass({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; description?: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const fn = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", fn);
    return () => document.removeEventListener("pointerdown", fn);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <p className="mb-1.5 font-display text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] px-3.5 py-2.5 text-left font-display text-[13px] font-semibold text-[var(--text-primary)] shadow-sm transition-colors hover:border-[var(--brand-primary)]/50 focus:outline-none"
      >
        <span>{selected?.label ?? "Selecionar..."}</span>
        <IconChevronDown
          size={15}
          className={cn(
            "shrink-0 text-[var(--text-muted)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 px-3.5 py-2.5 text-left transition-colors",
                opt.value === value
                  ? "bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]"
                  : "text-[var(--text-primary)] hover:bg-[var(--glass-bg-overlay)]",
              )}
            >
              <span className="font-display text-[13px] font-semibold">{opt.label}</span>
              {opt.description && (
                <span className="font-display text-[11px] text-[var(--text-muted)]">
                  {opt.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Seletor de automação ─────────────────────────────────────────

function AutomationPicker({
  selectedId,
  onSelect,
  onCreateNew,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useAutomations({ perPage: 100 });

  const items: AutomationListItemDto[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...(data?.items ?? [])]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .filter(
        (a) =>
          !q ||
          a.name.toLowerCase().includes(q) ||
          a.triggerType.toLowerCase().includes(q),
      );
  }, [data?.items, search]);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
        Automação
      </p>

      {/* Busca */}
      <div className="relative">
        <IconSearch
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar automação..."
          className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] py-2.5 pl-8 pr-3 font-display text-[13px] text-[var(--text-primary)] shadow-sm placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]/20"
        />
      </div>

      {/* Lista */}
      <div className="max-h-[220px] overflow-y-auto rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-sm">
        {isLoading && (
          <p className="px-3.5 py-3 font-display text-[12.5px] text-[var(--text-muted)]">
            Carregando...
          </p>
        )}

        {!isLoading && items.length === 0 && (
          <p className="px-3.5 py-3 font-display text-[12.5px] text-[var(--text-muted)]">
            Nenhuma automação encontrada.
          </p>
        )}

        {items.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex w-full items-center gap-3 border-b border-[var(--glass-border-subtle)] px-3.5 py-3 text-left last:border-0 transition-colors",
                isSelected
                  ? "bg-[var(--brand-primary)]/6 text-[var(--brand-primary)]"
                  : "text-[var(--text-primary)] hover:bg-[var(--glass-bg-overlay)]",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  isSelected
                    ? "bg-[var(--brand-primary)] text-white"
                    : "bg-[var(--glass-bg-base)] text-[var(--brand-primary)]",
                )}
              >
                {isSelected ? <IconCheck size={14} /> : <IconBolt size={14} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[13px] font-bold text-[var(--text-primary)]">
                  {item.name}
                </p>
                {item.description && (
                  <p className="truncate font-display text-[11.5px] text-[var(--text-muted)]">
                    {item.description}
                  </p>
                )}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 font-display text-[10.5px] font-bold",
                  item.active
                    ? "bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
                    : "bg-[var(--glass-bg-base)] text-[var(--text-muted)]",
                )}
              >
                {item.active ? "Ativa" : "Pausada"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Criar nova */}
      <button
        type="button"
        onClick={onCreateNew}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--glass-border)] py-2.5 font-display text-[12.5px] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
      >
        <IconPlus size={14} />
        Criar nova automação
      </button>
    </div>
  );
}

// ─── Select inline compacto (linhas de condição) ──────────────────

function InlineSelect({
  value,
  options,
  placeholder,
  onChange,
  className,
}: {
  value: string;
  options: Opt[];
  placeholder?: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const fn = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", fn);
    return () => document.removeEventListener("pointerdown", fn);
  }, [open]);

  // Agrupa por `group` preservando a ordem de inserção.
  const grouped = useMemo(() => {
    const groups: { group: string | undefined; items: Opt[] }[] = [];
    for (const o of options) {
      const last = groups[groups.length - 1];
      if (last && last.group === o.group) last.items.push(o);
      else groups.push({ group: o.group, items: [o] });
    }
    return groups;
  }, [options]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] px-2.5 py-1.5 text-left font-display text-[12.5px] font-semibold text-[var(--text-primary)] shadow-sm transition-colors hover:border-[var(--brand-primary)]/50 focus:outline-none"
      >
        <span className={cn("truncate", !selected && "text-[var(--text-muted)] font-normal")}>
          {selected?.label ?? placeholder ?? "Selecionar..."}
        </span>
        <IconChevronDown
          size={13}
          className={cn(
            "shrink-0 text-[var(--text-muted)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[60] mt-1 max-h-[240px] w-full overflow-y-auto rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] py-1 shadow-[0_8px_24px_rgba(15,23,42,0.14)]">
          {options.length === 0 && (
            <p className="px-3 py-2 font-display text-[12px] text-[var(--text-muted)]">
              Nenhuma opção.
            </p>
          )}
          {grouped.map((g) => (
            <div key={g.group ?? "_"}>
              {g.group && (
                <p className="px-3 pb-0.5 pt-2 font-display text-[9.5px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  {g.group}
                </p>
              )}
              {g.items.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-1.5 text-left font-display text-[12.5px] transition-colors",
                    opt.value === value
                      ? "bg-[var(--brand-primary)]/8 font-semibold text-[var(--brand-primary)]"
                      : "text-[var(--text-primary)] hover:bg-[var(--glass-bg-overlay)]",
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.value === value && <IconCheck size={13} className="shrink-0" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Editor de condições ──────────────────────────────────────────

const CONDITION_TYPE_OPTIONS: Opt[] = [
  { value: "tag", label: "Tag" },
  { value: "field", label: "Campo" },
  { value: "channel", label: "Canal" },
];

function ConditionsEditor({
  conditions,
  onChange,
}: {
  conditions: TriggerCondition[];
  onChange: (next: TriggerCondition[]) => void;
}) {
  const { options: tagOptions } = useTagOptions();
  const { options: channelOptions } = useChannelOptions();
  const { options: contactFields } = useFieldOptions("contact");
  const { options: dealFields } = useFieldOptions("deal");

  // Campos de contato e negócio mesclados; a entidade é inferida na escolha.
  const fieldOptions = useMemo<Opt[]>(() => {
    const contact = contactFields.map((o) => ({
      ...o,
      value: `contact:${o.value}`,
      group: `Contato · ${o.group ?? ""}`.trim(),
    }));
    const deal = dealFields.map((o) => ({
      ...o,
      value: `deal:${o.value}`,
      group: `Negócio · ${o.group ?? ""}`.trim(),
    }));
    return [...contact, ...deal];
  }, [contactFields, dealFields]);

  const update = (idx: number, next: TriggerCondition) => {
    onChange(conditions.map((c, i) => (i === idx ? next : c)));
  };
  const remove = (idx: number) => {
    onChange(conditions.filter((_, i) => i !== idx));
  };
  const changeType = (idx: number, type: string) => {
    if (type === "tag") update(idx, { type: "tag", tagName: "" });
    else if (type === "field")
      update(idx, { type: "field", entity: "contact", fieldId: "", value: "" });
    else if (type === "channel") update(idx, { type: "channel", channelId: "" });
  };

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4">
      <p className="mb-2.5 font-display text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
        Para todos os leads com:
      </p>

      {conditions.length > 0 && (
        <div className="mb-2.5 flex flex-col gap-2">
          {conditions.map((cond, idx) => (
            <div
              key={idx}
              className="flex items-start gap-1.5 rounded-lg border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-modal)] p-1.5"
            >
              <InlineSelect
                className="w-[92px] shrink-0"
                value={cond.type}
                options={CONDITION_TYPE_OPTIONS}
                onChange={(t) => changeType(idx, t)}
              />

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {cond.type === "tag" && (
                  <InlineSelect
                    value={cond.tagName}
                    options={tagOptions}
                    placeholder="Escolher tag..."
                    onChange={(v) => update(idx, { type: "tag", tagName: v })}
                  />
                )}

                {cond.type === "field" && (
                  <>
                    <InlineSelect
                      value={`${cond.entity}:${cond.fieldId}`}
                      options={fieldOptions}
                      placeholder="Escolher campo..."
                      onChange={(v) => {
                        const [entity, ...rest] = v.split(":");
                        const fieldId = rest.join(":");
                        const opt = fieldOptions.find((o) => o.value === v);
                        update(idx, {
                          type: "field",
                          entity: entity === "deal" ? "deal" : "contact",
                          fieldId,
                          fieldLabel: opt?.label,
                          value: cond.value,
                        });
                      }}
                    />
                    <input
                      type="text"
                      value={cond.value}
                      placeholder="Valor esperado..."
                      onChange={(e) =>
                        update(idx, { ...cond, value: e.target.value })
                      }
                      className="w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] px-2.5 py-1.5 font-display text-[12.5px] text-[var(--text-primary)] shadow-sm placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]/20"
                    />
                  </>
                )}

                {cond.type === "channel" && (
                  <InlineSelect
                    value={cond.channelId}
                    options={channelOptions}
                    placeholder="Escolher canal..."
                    onChange={(v) => {
                      const opt = channelOptions.find((o) => o.value === v);
                      update(idx, {
                        type: "channel",
                        channelId: v,
                        channelName: opt?.label,
                      });
                    }}
                  />
                )}
              </div>

              <button
                type="button"
                onClick={() => remove(idx)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)]"
                title="Remover condição"
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange([...conditions, newDefaultCondition()])}
        className="inline-flex items-center gap-1 font-display text-[13px] font-semibold text-[var(--brand-primary)] hover:underline"
      >
        <IconPlus size={13} />
        Adicionar uma condição
      </button>

      {conditions.length > 0 && (
        <p className="mt-2 font-display text-[11px] text-[var(--text-muted)]">
          A automação só executa quando <span className="font-semibold">todas</span> as condições
          forem atendidas.
        </p>
      )}
    </div>
  );
}

// ─── Drawer principal ─────────────────────────────────────────────

/** Gatilhos que exigem escolher a etapa de destino (toStageId) inline. */
const STAGE_TARGET_TRIGGERS = new Set(["STAGE_MOVED_IN"]);

export interface AddAutomationDrawerProps {
  open: boolean;
  stageName: string;
  /** Etapas do pipeline — usado pelo seletor inline do gatilho "movido para etapa". */
  stages?: { id: string; name: string }[];
  /** Etapa do painel; default do seletor inline de destino. */
  currentStageId?: string;
  /** Pré-preenche para modo de edição */
  initialAutomationId?: string | null;
  initialTrigger?: string;
  /** Etapa de destino pré-selecionada (edição de "movido para etapa"). */
  initialTargetStageId?: string | null;
  /** Condições pré-preenchidas (edição). */
  initialConditions?: TriggerCondition[];
  onClose: () => void;
  onConfirm: (payload: {
    automationId: string;
    trigger: string;
    applyToExisting: boolean;
    /** Só para gatilhos de destino (movido para etapa): etapa escolhida. */
    targetStageId?: string;
    /** Condições extras (Tag/Campo/Canal) — semântica E. */
    conditions: TriggerCondition[];
  }) => void;
}

export function AddAutomationDrawer({
  open,
  stageName,
  stages = [],
  currentStageId,
  initialAutomationId,
  initialTrigger,
  initialTargetStageId,
  initialConditions,
  onClose,
  onConfirm,
}: AddAutomationDrawerProps) {
  const [trigger, setTrigger] = useState(initialTrigger ?? "STAGE_ENTERED");
  const [automationId, setAutomationId] = useState<string | null>(initialAutomationId ?? null);
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [targetStageId, setTargetStageId] = useState<string | null>(
    initialTargetStageId ?? currentStageId ?? null,
  );
  const [conditions, setConditions] = useState<TriggerCondition[]>(initialConditions ?? []);

  // Re-inicializa quando abre para edição
  useEffect(() => {
    if (open) {
      setTrigger(initialTrigger ?? "STAGE_ENTERED");
      setAutomationId(initialAutomationId ?? null);
      setApplyToExisting(false);
      setTargetStageId(initialTargetStageId ?? currentStageId ?? null);
      setConditions(initialConditions ?? []);
    }
    // `initialConditions` é intencionalmente omitido das deps: é uma nova
    // referência a cada render do pai; só queremos re-hidratar ao ABRIR.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTrigger, initialAutomationId, initialTargetStageId, currentStageId]);

  const needsTargetStage = STAGE_TARGET_TRIGGERS.has(trigger);

  const canConfirm = !!automationId && (!needsTargetStage || !!targetStageId);

  const handleConfirm = () => {
    if (!automationId) return;
    if (needsTargetStage && !targetStageId) return;
    onConfirm({
      automationId,
      trigger,
      applyToExisting,
      conditions: sanitizeConditions(conditions),
      ...(needsTargetStage && targetStageId ? { targetStageId } : {}),
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={initialAutomationId ? "Editar automação" : "Adicionar automação"}
      description={
        <>
          Estágio: <span className="font-semibold text-[var(--brand-primary)]">{stageName}</span>
        </>
      }
      icon={<IconBolt size={18} className="text-[var(--brand-primary)]" />}
      size="lg"
      bodyClassName="flex flex-col gap-5"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] px-5 py-2 font-display text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--glass-border)] hover:bg-[var(--glass-bg-overlay)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-5 py-2 font-display text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(91,111,245,0.30)] transition-all hover:-translate-y-px hover:bg-[var(--brand-primary-dark)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconCheck size={14} />
            Finalizado
          </button>
        </>
      }
    >

          {/* Condições */}
          <ConditionsEditor conditions={conditions} onChange={setConditions} />

          {/* Gatilho */}
          <SelectGlass
            label="Executar"
            value={trigger}
            options={STAGE_TRIGGERS.map((t) => ({
              value: t.value,
              label: t.label,
              description: t.description,
            }))}
            onChange={setTrigger}
          />

          {/* Seletor inline de etapa de destino (gatilho "movido para etapa") */}
          {needsTargetStage && (
            <div>
              <p className="mb-1.5 font-display text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Para qual etapa
              </p>
              {stages.length === 0 ? (
                <p className="font-display text-[12px] text-[var(--text-muted)]">
                  Nenhuma etapa disponível.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] p-1.5 shadow-sm">
                  {stages.map((s) => {
                    const isSel = s.id === targetStageId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setTargetStageId(s.id)}
                        className={cn(
                          "flex items-center justify-between rounded-lg px-3 py-2 text-left font-display text-[13px] font-semibold transition-colors",
                          isSel
                            ? "bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]"
                            : "text-[var(--text-primary)] hover:bg-[var(--glass-bg-overlay)]",
                        )}
                      >
                        <span className="truncate">{s.name}</span>
                        {isSel && <IconCheck size={14} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Separador */}
          <div className="h-px w-full bg-[var(--glass-bg-base)]" />

          {/* Seleção de automação */}
          <AutomationPicker
            selectedId={automationId}
            onSelect={setAutomationId}
            onCreateNew={() => {
              onClose();
              window.open("/automations/new", "_blank");
            }}
          />

          {/* Aplicar a leads existentes */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3">
            <div
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                applyToExisting
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg-modal)]",
              )}
            >
              {applyToExisting && <IconCheck size={10} className="text-white" strokeWidth={3} />}
            </div>
            <input
              type="checkbox"
              className="sr-only"
              checked={applyToExisting}
              onChange={(e) => setApplyToExisting(e.target.checked)}
            />
            <div>
              <p className="font-display text-[13px] font-semibold text-[var(--text-primary)]">
                Aplicar o gatilho a todos os leads já nesta etapa
              </p>
              <p className="mt-0.5 font-display text-[11.5px] text-[var(--text-muted)]">
                Executa imediatamente para leads existentes neste estágio.
              </p>
            </div>
          </label>
    </FormDialog>
  );
}
