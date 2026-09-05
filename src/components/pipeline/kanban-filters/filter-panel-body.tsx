/**
 * Conteudo (body) dos filtros avancados — reusavel em:
 *   - FilterPanel (Sheet lateral, legacy)
 *   - FilterDropdown (popover ancorado no input "Buscar")
 *
 * Layout 3 colunas no estilo Kommo CRM:
 *   Col 1 (200px) — Filtros salvos + quick filters
 *   Col 2 (flex-1) — Propriedades do negócio
 *   Col 3 (220px) — Tags com busca e contagem
 *
 * Cada mudança de campo dispara onApply imediatamente (sem botão Aplicar).
 */

"use client";

import * as React from "react";
import { IconDeviceFloppy as Save, IconSearch as Search, IconTrash as Trash2, IconStar as Star, IconStarOff as StarOff, IconUsers as UsersIcon, IconLock as Lock, IconBookmark as Bookmark, IconCheck as Check, IconChevronDown as ChevronDown } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownGlass,
  FILTER_FIELD_ITEM_CLASS,
  FILTER_FIELD_MENU_CLASS,
  FILTER_FIELD_TRIGGER_CLASS,
} from "@/components/crm/dropdown-glass";
import { UserAvatar } from "@/components/crm/user-avatar";
import { SelectNative } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  DATE_PRESET_LABELS,
  dateRangeFromPreset,
  detectPreset,
  type DatePresetKey,
} from "./date-presets";
import type {
  AdvancedDealFilters,
  CustomField,
  CustomFieldFilter,
  CustomFieldOperator,
  DateRangeValue,
  FilterOptionsResponse,
  SavedFilter,
  TagMode,
} from "./types";
import { isEmptyFilters, SOURCE_NONE } from "./types";
import { fetchSavedFilters } from "./api";

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: "OPEN" | "WON" | "LOST"; label: string }[] = [
  { value: "OPEN", label: "Aberto" },
  { value: "WON", label: "Ganho" },
  { value: "LOST", label: "Perdido" },
];

const TAG_MODE_OPTIONS: { value: TagMode; label: string }[] = [
  { value: "any", label: "Contém (qualquer uma)" },
  { value: "all", label: "Contém todas" },
  { value: "none", label: "Não contém" },
];

const CUSTOM_OPERATORS: { value: CustomFieldOperator; label: string; needsValue: boolean }[] = [
  { value: "contains", label: "Contém", needsValue: true },
  { value: "not_contains", label: "Não contém", needsValue: true },
  { value: "eq", label: "É igual a", needsValue: true },
  { value: "neq", label: "É diferente de", needsValue: true },
  { value: "filled", label: "Preenchido", needsValue: false },
  { value: "empty", label: "Vazio", needsValue: false },
  { value: "in", label: "É uma das", needsValue: true },
  { value: "gt", label: "Maior que", needsValue: true },
  { value: "lt", label: "Menor que", needsValue: true },
  { value: "before", label: "Antes de", needsValue: true },
  { value: "after", label: "Depois de", needsValue: true },
  { value: "between", label: "Entre datas", needsValue: true },
];

function operatorsForType(type: string): CustomFieldOperator[] {
  const t = (type || "").toUpperCase();
  if (t === "DATE") return ["before", "after", "between", "eq", "filled", "empty"];
  if (t === "NUMBER") return ["eq", "neq", "gt", "lt", "filled", "empty"];
  if (t === "SELECT" || t === "RADIO" || t === "DROPDOWN")
    return ["eq", "neq", "in", "filled", "empty"];
  if (t === "MULTI_SELECT" || t === "CHECKBOX")
    return ["in", "contains", "not_contains", "filled", "empty"];
  return ["contains", "not_contains", "eq", "neq", "filled", "empty"];
}

// ─── Helpers de UI internos ────────────────────────────────────────────────────

function SectionHeader({
  label,
  onClear,
  hasClear,
}: {
  label: string;
  onClear?: () => void;
  hasClear?: boolean;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      {hasClear && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-[var(--brand-primary)] transition-colors hover:underline"
        >
          Limpar
        </button>
      )}
    </div>
  );
}

/** Linha de propriedade no estilo Kommo — label acima + controle abaixo */
function PropertyRow({
  label,
  children,
  active,
}: {
  label: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 transition-colors",
        active
          ? "border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/5"
          : "border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] hover:bg-[var(--glass-bg)]",
      )}
    >
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function MultiPickButtons({
  items,
  selected,
  onToggle,
  emptyLabel,
}: {
  items: { id: string; name: string; label?: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-[11px] text-[var(--text-muted)]">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => {
        const active = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
              active
                ? "border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)]/30 hover:text-[var(--text-primary)]",
            )}
          >
            {active && <Check className="size-2.5" />}
            {item.label ?? item.name}
          </button>
        );
      })}
    </div>
  );
}

function DateRangeField({
  value,
  onChange,
}: {
  value: DateRangeValue | undefined;
  onChange: (v: DateRangeValue | undefined) => void;
}) {
  const preset = detectPreset(value);
  return (
    <div className="space-y-1.5">
      <DropdownGlass
        options={(Object.keys(DATE_PRESET_LABELS) as DatePresetKey[]).map((k) => ({
          value: k,
          label: DATE_PRESET_LABELS[k],
        }))}
        value={preset}
        onValueChange={(v) => {
          const key = v as DatePresetKey;
          if (key === "custom") return;
          if (key === "any") return onChange(undefined);
          onChange(dateRangeFromPreset(key) ?? undefined);
        }}
        triggerClassName="h-7 w-full text-[11px]"
      />
      {preset === "custom" && (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={value?.from ?? ""}
            onChange={(e) => onChange({ ...value, from: e.target.value || null })}
            className="h-7 text-[11px]"
          />
          <span className="shrink-0 text-[10px] text-[var(--text-muted)]">até</span>
          <Input
            type="date"
            value={value?.to ?? ""}
            onChange={(e) => onChange({ ...value, to: e.target.value || null })}
            className="h-7 text-[11px]"
          />
        </div>
      )}
    </div>
  );
}

function ValueRangeField({
  from,
  to,
  onChange,
}: {
  from: number | null | undefined;
  to: number | null | undefined;
  onChange: (from: number | null, to: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        placeholder="Mínimo"
        value={from ?? ""}
        onChange={(e) =>
          onChange(e.target.value !== "" ? Number(e.target.value) : null, to ?? null)
        }
        className="h-7 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] px-2 text-[11px] text-[var(--text-primary)] shadow-none outline-none transition-colors placeholder:text-[var(--text-muted)] hover:bg-[var(--color-primary-soft)] focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)]/20"
      />
      <span className="shrink-0 text-[10px] text-[var(--text-muted)]">–</span>
      <input
        type="number"
        placeholder="Máximo"
        value={to ?? ""}
        onChange={(e) =>
          onChange(from ?? null, e.target.value !== "" ? Number(e.target.value) : null)
        }
        className="h-7 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] px-2 text-[11px] text-[var(--text-primary)] shadow-none outline-none transition-colors placeholder:text-[var(--text-muted)] hover:bg-[var(--color-primary-soft)] focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)]/20"
      />
    </div>
  );
}

/** Dropdown de etapas com checkboxes inline */
function StagesDropdown({
  stages,
  selected,
  onToggle,
  loading,
}: {
  stages: { id: string; name: string; color: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label =
    selected.length === 0
      ? "Todas as etapas"
      : selected.length === 1
        ? (stages.find((s) => s.id === selected[0])?.name ?? "1 etapa")
        : `${selected.length} etapas`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          FILTER_FIELD_TRIGGER_CLASS,
          "h-7 rounded-lg px-2.5 text-[11px]",
          selected.length > 0 && "text-[var(--brand-primary)]",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{loading ? "Carregando..." : label}</span>
        <ChevronDown className={cn("size-3 shrink-0 text-current opacity-60 transition-transform", open && "rotate-180")} />
      </button>
      {open && stages.length > 0 && (
        <div className={cn(FILTER_FIELD_MENU_CLASS, "absolute left-0 top-full z-10 mt-1 w-full")}>
          {stages.map((stage) => {
            const active = selected.includes(stage.id);
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => onToggle(stage.id)}
                className={cn(FILTER_FIELD_ITEM_CLASS, "w-full text-[11px]")}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: stage.color || "#94a3b8" }}
                />
                <span className="flex-1 truncate text-left">{stage.name}</span>
                {active && <Check className="size-3 text-[var(--brand-primary)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Multi-select de origens com busca */
function SourcesMultiPick({
  sources,
  selected,
  withoutSource,
  onChange,
}: {
  sources: string[];
  selected: string[];
  withoutSource?: boolean;
  onChange: (ids: string[], withoutSource: boolean) => void;
}) {
  const [search, setSearch] = React.useState("");
  const filtered = search
    ? sources.filter((s) => s.toLowerCase().includes(search.toLowerCase()))
    : sources;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Buscar origem..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] pl-6 pr-2 text-[11px] text-[var(--text-primary)] shadow-none outline-none transition-colors placeholder:text-[var(--text-muted)] hover:bg-[var(--color-primary-soft)] focus:border-[var(--brand-primary)]"
        />
      </div>
      <div className="max-h-28 space-y-0.5 overflow-y-auto">
        <button
          type="button"
          onClick={() => onChange([], !withoutSource)}
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] transition-colors",
            withoutSource
              ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
          )}
        >
          {withoutSource && <Check className="size-3" />}
          Sem origem
        </button>
        {filtered.map((source) => {
          const active = selected.includes(source);
          return (
            <button
              key={source}
              type="button"
              onClick={() => {
                const next = active ? selected.filter((x) => x !== source) : [...selected, source];
                onChange(next, false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] transition-colors",
                active
                  ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
              )}
            >
              <span className="flex-1 truncate text-left">{source}</span>
              {active && <Check className="size-3 shrink-0" />}
            </button>
          );
        })}
        {filtered.length === 0 && search && (
          <p className="px-2 py-2 text-center text-[11px] text-[var(--text-muted)]">Nenhuma origem encontrada.</p>
        )}
        {sources.length === 0 && !search && (
          <p className="px-2 py-2 text-[11px] text-[var(--text-muted)]">
            Nenhuma origem cadastrada ainda.
          </p>
        )}
      </div>
    </div>
  );
}

/** Multi-select de usuários com busca */
function UsersMultiPick({
  users,
  selected,
  withoutOwner,
  onChange,
}: {
  users: { id: string; name: string; avatarUrl?: string | null }[];
  selected: string[];
  withoutOwner?: boolean;
  onChange: (ids: string[], withoutOwner: boolean) => void;
}) {
  const [search, setSearch] = React.useState("");
  const filtered = search
    ? users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Buscar usuário..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] pl-6 pr-2 text-[11px] text-[var(--text-primary)] shadow-none outline-none transition-colors placeholder:text-[var(--text-muted)] hover:bg-[var(--color-primary-soft)] focus:border-[var(--brand-primary)]"
        />
      </div>
      <div className="max-h-28 overflow-y-auto space-y-0.5">
        <button
          type="button"
          onClick={() => onChange([], !withoutOwner)}
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] transition-colors",
            withoutOwner
              ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
          )}
        >
          {withoutOwner && <Check className="size-3" />}
          Sem responsável
        </button>
        {filtered.map((u) => {
          const active = selected.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                const next = active ? selected.filter((x) => x !== u.id) : [...selected, u.id];
                onChange(next, false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] transition-colors",
                active
                  ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
              )}
            >
              <UserAvatar name={u.name} imageUrl={u.avatarUrl ?? null} size={16} />
              <span className="flex-1 truncate text-left">{u.name}</span>
              {active && <Check className="size-3 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CustomFieldRow({
  field,
  filter,
  onChange,
  onRemove,
}: {
  field: CustomField;
  filter: CustomFieldFilter;
  onChange: (next: CustomFieldFilter) => void;
  onRemove: () => void;
}) {
  const allowedOps = operatorsForType(field.type);
  const currentOp =
    filter.operator && allowedOps.includes(filter.operator) ? filter.operator : allowedOps[0];
  const opDef = CUSTOM_OPERATORS.find((o) => o.value === currentOp);
  const hasOptions = field.options && field.options.length > 0;
  const isMulti = currentOp === "in" || field.type === "MULTI_SELECT";
  const t = (field.type || "").toUpperCase();
  const inputType = t === "DATE" ? "date" : t === "NUMBER" ? "number" : "text";

  React.useEffect(() => {
    if (filter.operator !== currentOp) {
      onChange({ ...filter, operator: currentOp });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-1.5 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{field.label}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--text-muted)] hover:text-[var(--color-danger)]"
          aria-label="Remover"
        >
          <span className="text-[11px]">×</span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <DropdownGlass
          options={allowedOps.map((op) => ({
            value: op,
            label: CUSTOM_OPERATORS.find((o) => o.value === op)?.label ?? op,
          }))}
          value={currentOp}
          onValueChange={(v) =>
            onChange({ ...filter, operator: v as CustomFieldOperator, value: undefined })
          }
          triggerClassName="h-7 w-full text-[11px]"
        />
        {opDef?.needsValue ? (
          currentOp === "between" ? (
            <div className="col-span-1 grid grid-cols-2 gap-1">
              <Input
                type="date"
                value={
                  filter.value && typeof filter.value === "object" && !Array.isArray(filter.value)
                    ? (filter.value as DateRangeValue).from ?? ""
                    : ""
                }
                onChange={(e) => {
                  const prev =
                    filter.value && typeof filter.value === "object" && !Array.isArray(filter.value)
                      ? (filter.value as DateRangeValue)
                      : {};
                  onChange({ ...filter, value: { ...prev, from: e.target.value || null } });
                }}
                className="h-7 text-[11px]"
              />
              <Input
                type="date"
                value={
                  filter.value && typeof filter.value === "object" && !Array.isArray(filter.value)
                    ? (filter.value as DateRangeValue).to ?? ""
                    : ""
                }
                onChange={(e) => {
                  const prev =
                    filter.value && typeof filter.value === "object" && !Array.isArray(filter.value)
                      ? (filter.value as DateRangeValue)
                      : {};
                  onChange({ ...filter, value: { ...prev, to: e.target.value || null } });
                }}
                className="h-7 text-[11px]"
              />
            </div>
          ) : hasOptions ? (
            isMulti ? (
              <SelectNative
                multiple
                value={Array.isArray(filter.value) ? filter.value : []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                  onChange({ ...filter, value: selected });
                }}
                className="h-16 text-[11px]"
              >
                {field.options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </SelectNative>
            ) : (
              <DropdownGlass
                options={field.options.map((o) => ({ value: o, label: o }))}
                value={typeof filter.value === "string" ? filter.value || undefined : undefined}
                onValueChange={(v) => onChange({ ...filter, value: v })}
                placeholder="— escolha —"
                triggerClassName="h-7 w-full text-[11px]"
              />
            )
          ) : (
            <Input
              type={inputType}
              value={typeof filter.value === "string" ? filter.value : ""}
              onChange={(e) => onChange({ ...filter, value: e.target.value })}
              placeholder="Valor"
              className="h-7 text-[11px]"
            />
          )
        ) : (
          <span className="self-center text-[10px] italic text-[var(--text-muted)]">sem valor</span>
        )}
      </div>
    </div>
  );
}

// ─── Coluna 1: Filtros Salvos ──────────────────────────────────────────────────

const QUICK_FILTERS: {
  label: string;
  dot?: string;
  filters: AdvancedDealFilters;
}[] = [
  { label: "Leads ativos",   filters: { statuses: ["OPEN"] } },
  { label: "Meus leads",     filters: { ownerIds: ["__me__"] } },
  { label: "Leads perdidos", filters: { statuses: ["LOST"] } },
  { label: "Leads ganhos",   filters: { statuses: ["WON"] } },
  {
    label: "Sem responsável",
    dot: "var(--color-warning)",
    filters: { withoutOwner: true },
  },
];

function SavedFiltersColumn({
  value,
  onApply,
  onRequestSave,
}: {
  value: AdvancedDealFilters;
  onApply: (f: AdvancedDealFilters) => void;
  onRequestSave?: (f: AdvancedDealFilters) => void;
}) {
  const [savedFilters, setSavedFilters] = React.useState<SavedFilter[]>([]);

  React.useEffect(() => {
    fetchSavedFilters()
      .then(setSavedFilters)
      .catch(() => {/* silencioso */});
  }, []);

  function isActiveQuick(qf: (typeof QUICK_FILTERS)[number]) {
    const keys = Object.keys(qf.filters) as (keyof AdvancedDealFilters)[];
    return keys.every((k) => JSON.stringify(value[k]) === JSON.stringify(qf.filters[k]));
  }

  return (
    <div className="flex flex-col gap-0.5 px-2">
      {QUICK_FILTERS.map((qf) => {
        const active = isActiveQuick(qf);
        return (
          <button
            key={qf.label}
            type="button"
            onClick={() => onApply(qf.filters)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12px] transition-colors",
              active
                ? "bg-[var(--brand-primary)]/10 font-semibold text-[var(--brand-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-subtle)] hover:text-[var(--text-primary)]",
            )}
          >
            {qf.dot && (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: qf.dot }}
              />
            )}
            {qf.label}
          </button>
        );
      })}

      {savedFilters.length > 0 && (
        <>
          <div className="my-2 border-t border-[var(--glass-border-subtle)]" />
          <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Salvos
          </span>
          {savedFilters.map((sf) => {
            const active =
              JSON.stringify(value) === JSON.stringify(sf.filterConfig);
            return (
              <button
                key={sf.id}
                type="button"
                onClick={() => onApply(sf.filterConfig as AdvancedDealFilters)}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12px] transition-colors",
                  active
                    ? "bg-[var(--brand-primary)]/10 font-semibold text-[var(--brand-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-subtle)] hover:text-[var(--text-primary)]",
                )}
              >
                <Bookmark className="size-3 shrink-0 text-[var(--brand-primary)]/60" />
                <span className="flex-1 truncate">{sf.name}</span>
                {sf.isShared ? (
                  <UsersIcon className="size-3 shrink-0 opacity-40" />
                ) : (
                  <Lock className="size-3 shrink-0 opacity-40" />
                )}
              </button>
            );
          })}
        </>
      )}

      {onRequestSave && !isEmptyFilters(value) && (
        <>
          <div className="my-2 border-t border-[var(--glass-border-subtle)]" />
          <button
            type="button"
            onClick={() => onRequestSave(value)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            <Save className="size-3" />
            Salvar filtro atual
          </button>
        </>
      )}
    </div>
  );
}

// ─── Coluna 2: Propriedades ────────────────────────────────────────────────────

function PropertiesColumn({
  draft,
  options,
  optionsLoading,
  optionsError,
  setDraftField,
  toggleArray,
}: {
  draft: AdvancedDealFilters;
  options: FilterOptionsResponse | null;
  optionsLoading: boolean;
  optionsError?: string | null;
  setDraftField: <K extends keyof AdvancedDealFilters>(k: K, v: AdvancedDealFilters[K]) => void;
  toggleArray: (prev: string[] | undefined, id: string) => string[] | undefined;
}) {
  const stages = options?.pipelines.flatMap((p) => p.stages) ?? [];
  const users = options?.users ?? [];

  const [pickDealCfId, setPickDealCfId] = React.useState("");
  const [pickContactCfId, setPickContactCfId] = React.useState("");

  function addDealCustomField() {
    const cf = options?.dealCustomFields.find((d) => d.id === pickDealCfId);
    if (!cf) return;
    if (draft.dealCustomFields?.some((x) => x.name === cf.name)) {
      setPickDealCfId("");
      return;
    }
    const op = operatorsForType(cf.type)[0];
    setDraftField("dealCustomFields", [
      ...(draft.dealCustomFields ?? []),
      { name: cf.name, operator: op, value: "" },
    ]);
    setPickDealCfId("");
  }

  function addContactCustomField() {
    const cf = options?.contactCustomFields.find((d) => d.id === pickContactCfId);
    if (!cf) return;
    if (draft.contactCustomFields?.some((x) => x.name === cf.name)) {
      setPickContactCfId("");
      return;
    }
    const op = operatorsForType(cf.type)[0];
    setDraftField("contactCustomFields", [
      ...(draft.contactCustomFields ?? []),
      { name: cf.name, operator: op, value: "" },
    ]);
    setPickContactCfId("");
  }

  return (
    <div className="space-y-2">
      {/* Busca */}
      <PropertyRow label="Nome do lead" active={!!draft.search}>
        <Input
          value={draft.search ?? ""}
          onChange={(e) => setDraftField("search", e.target.value || undefined)}
          placeholder="Título, contato, e-mail..."
          className="h-7 text-[11px]"
        />
      </PropertyRow>

      {/* Status */}
      <PropertyRow label="Status" active={!!draft.statuses?.length}>
        <div className="flex flex-wrap gap-1">
          {STATUS_OPTIONS.map((s) => {
            const active = (draft.statuses ?? []).includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                onClick={() =>
                  setDraftField(
                    "statuses",
                    toggleArray(draft.statuses, s.value) as typeof draft.statuses,
                  )
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
                  active
                    ? "border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                    : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)]/30",
                )}
              >
                {active && <Check className="size-2.5" />}
                {s.label}
              </button>
            );
          })}
        </div>
      </PropertyRow>

      {/* Data de criação */}
      <PropertyRow
        label="A qualquer hora"
        active={!!(draft.createdAt?.from || draft.createdAt?.to)}
      >
        <DateRangeField
          value={draft.createdAt}
          onChange={(v) => setDraftField("createdAt", v)}
        />
      </PropertyRow>

      {/* Etapas */}
      <PropertyRow label="Etapas" active={!!draft.stageIds?.length}>
        <StagesDropdown
          stages={stages}
          selected={draft.stageIds ?? []}
          onToggle={(id) => setDraftField("stageIds", toggleArray(draft.stageIds, id))}
          loading={optionsLoading}
        />
      </PropertyRow>

      {/* Origem */}
      <PropertyRow
        label="Origem"
        active={!!((draft.sources ?? []).filter((s) => s !== SOURCE_NONE).length || draft.withoutSource)}
      >
        <SourcesMultiPick
          sources={options?.sources ?? []}
          selected={(draft.sources ?? []).filter((s) => s !== SOURCE_NONE)}
          withoutSource={draft.withoutSource}
          onChange={(ids, withoutSource) => {
            setDraftField("sources", ids.length ? ids : undefined);
            setDraftField("withoutSource", withoutSource || undefined);
          }}
        />
      </PropertyRow>

      {/* utm_source (informação rastreada) */}
      <PropertyRow
        label="utm_source"
        active={!!((draft.utmSources ?? []).filter((s) => s !== SOURCE_NONE).length || draft.withoutUtmSource)}
      >
        <SourcesMultiPick
          sources={options?.utmSources ?? []}
          selected={(draft.utmSources ?? []).filter((s) => s !== SOURCE_NONE)}
          withoutSource={draft.withoutUtmSource}
          onChange={(ids, withoutSource) => {
            setDraftField("utmSources", ids.length ? ids : undefined);
            setDraftField("withoutUtmSource", withoutSource || undefined);
          }}
        />
      </PropertyRow>

      {/* Responsável */}
      <PropertyRow label="Usuários" active={!!(draft.ownerIds?.length || draft.withoutOwner)}>
        <UsersMultiPick
          users={users}
          selected={(draft.ownerIds ?? []).filter((id): id is string => !!id)}
          withoutOwner={draft.withoutOwner}
          onChange={(ids, wo) => {
            setDraftField("ownerIds", ids.length ? ids : undefined);
            setDraftField("withoutOwner", wo || undefined);
          }}
        />
      </PropertyRow>

      {/* Contato */}
      <PropertyRow
        label="Contato"
        active={!!(draft.contactSearch || draft.contactHasPhone != null || draft.contactHasEmail != null || draft.withoutContact)}
      >
        <div className="space-y-1.5">
          <Input
            value={draft.contactSearch ?? ""}
            onChange={(e) => setDraftField("contactSearch", e.target.value || undefined)}
            placeholder="Nome, telefone, e-mail..."
            className="h-7 text-[11px]"
          />
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
            {[
              { label: "Tem telefone", field: "contactHasPhone" as const, val: true },
              { label: "Tem e-mail",   field: "contactHasEmail" as const, val: true },
              { label: "Sem contato",  field: "withoutContact"  as const, val: true },
            ].map(({ label, field, val }) => (
              <label key={label} className="flex cursor-pointer items-center gap-1">
                <input
                  type="checkbox"
                  checked={draft[field] === val}
                  onChange={(e) =>
                    setDraftField(field, e.target.checked ? (val as boolean) : undefined)
                  }
                  className="size-3"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </PropertyRow>

      {/* Valor de venda */}
      <PropertyRow
        label="Valor de venda"
        active={draft.valueFrom != null || draft.valueTo != null}
      >
        <ValueRangeField
          from={draft.valueFrom}
          to={draft.valueTo}
          onChange={(from, to) => {
            setDraftField("valueFrom", from ?? undefined);
            setDraftField("valueTo", to ?? undefined);
          }}
        />
      </PropertyRow>

      {/* Datas adicionais (colapsadas em grid compacto) */}
      <PropertyRow
        label="Outras datas"
        active={
          !!(draft.updatedAt?.from || draft.updatedAt?.to || draft.closedAt?.from || draft.closedAt?.to || draft.lastInteractionAt?.from || draft.lastInteractionAt?.to)
        }
      >
        <div className="space-y-1.5">
          {[
            { label: "Atualizado em", key: "updatedAt" as const },
            { label: "Fechado em",    key: "closedAt" as const },
            { label: "Última interação", key: "lastInteractionAt" as const },
          ].map(({ label, key }) => (
            <div key={key}>
              <span className="mb-0.5 block text-[10px] text-[var(--text-muted)]">{label}</span>
              <DateRangeField
                value={draft[key]}
                onChange={(v) => setDraftField(key, v)}
              />
            </div>
          ))}
        </div>
      </PropertyRow>

      {/* Custom fields — Deal */}
      {((options?.dealCustomFields ?? []).length > 0 || (draft.dealCustomFields ?? []).length > 0) && (
        <PropertyRow
          label="Campos do negócio"
          active={!!draft.dealCustomFields?.length}
        >
          <div className="space-y-1.5">
            {optionsLoading ? (
              <p className="text-[11px] text-[var(--text-muted)]">Carregando…</p>
            ) : optionsError ? (
              <p className="text-[11px] text-[var(--color-danger)]">Erro: {optionsError}</p>
            ) : (
              <div className="flex items-center gap-1.5">
                <DropdownGlass
                  options={(options?.dealCustomFields ?? []).map((cf) => ({ value: cf.id, label: cf.label }))}
                  value={pickDealCfId || undefined}
                  onValueChange={setPickDealCfId}
                  placeholder="+ Adicionar critério..."
                  triggerClassName="h-7 flex-1 text-[11px]"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={addDealCustomField}
                  disabled={!pickDealCfId}
                >
                  +
                </Button>
              </div>
            )}
            {(draft.dealCustomFields ?? []).map((cf) => {
              const def = options?.dealCustomFields.find((d) => d.name === cf.name);
              if (!def) return null;
              return (
                <CustomFieldRow
                  key={cf.name}
                  field={def}
                  filter={cf}
                  onChange={(next) =>
                    setDraftField(
                      "dealCustomFields",
                      (draft.dealCustomFields ?? []).map((x) => (x.name === cf.name ? next : x)),
                    )
                  }
                  onRemove={() =>
                    setDraftField(
                      "dealCustomFields",
                      (draft.dealCustomFields ?? []).filter((x) => x.name !== cf.name),
                    )
                  }
                />
              );
            })}
          </div>
        </PropertyRow>
      )}

      {/* Custom fields — Contact */}
      {((options?.contactCustomFields ?? []).length > 0 || (draft.contactCustomFields ?? []).length > 0) && (
        <PropertyRow
          label="Campos do contato"
          active={!!draft.contactCustomFields?.length}
        >
          <div className="space-y-1.5">
            {optionsLoading ? (
              <p className="text-[11px] text-[var(--text-muted)]">Carregando…</p>
            ) : (
              <div className="flex items-center gap-1.5">
                <DropdownGlass
                  options={(options?.contactCustomFields ?? []).map((cf) => ({ value: cf.id, label: cf.label }))}
                  value={pickContactCfId || undefined}
                  onValueChange={setPickContactCfId}
                  placeholder="+ Adicionar critério..."
                  triggerClassName="h-7 flex-1 text-[11px]"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={addContactCustomField}
                  disabled={!pickContactCfId}
                >
                  +
                </Button>
              </div>
            )}
            {(draft.contactCustomFields ?? []).map((cf) => {
              const def = options?.contactCustomFields.find((d) => d.name === cf.name);
              if (!def) return null;
              return (
                <CustomFieldRow
                  key={cf.name}
                  field={def}
                  filter={cf}
                  onChange={(next) =>
                    setDraftField(
                      "contactCustomFields",
                      (draft.contactCustomFields ?? []).map((x) => (x.name === cf.name ? next : x)),
                    )
                  }
                  onRemove={() =>
                    setDraftField(
                      "contactCustomFields",
                      (draft.contactCustomFields ?? []).filter((x) => x.name !== cf.name),
                    )
                  }
                />
              );
            })}
          </div>
        </PropertyRow>
      )}
    </div>
  );
}

// ─── Coluna 3: Tags ────────────────────────────────────────────────────────────

function TagsColumn({
  draft,
  options,
  setDraftField,
}: {
  draft: AdvancedDealFilters;
  options: FilterOptionsResponse | null;
  setDraftField: <K extends keyof AdvancedDealFilters>(k: K, v: AdvancedDealFilters[K]) => void;
}) {
  const [tagSearch, setTagSearch] = React.useState("");
  const allTags = options?.tags ?? [];
  const filtered = tagSearch
    ? allTags.filter((t) => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
    : allTags;
  const selectedIds = draft.tagIds ?? [];

  function toggleTag(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    setDraftField("tagIds", next.length ? next : undefined);
    setDraftField("withoutTags", undefined);
    if (next.length === 0) setDraftField("tagMode", undefined);
  }

  return (
    <div className="flex h-full flex-col gap-2 px-3 py-3">
      <SectionHeader
        label="Tags"
        hasClear={selectedIds.length > 0 || !!draft.withoutTags}
        onClear={() => {
          setDraftField("tagIds", undefined);
          setDraftField("withoutTags", undefined);
          setDraftField("tagMode", undefined);
        }}
      />

      {/* Modo de combinação */}
      {selectedIds.length > 0 && (
        <DropdownGlass
          options={TAG_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={draft.tagMode ?? "any"}
          onValueChange={(v) =>
            setDraftField("tagMode", v === "any" ? undefined : (v as TagMode))
          }
          triggerClassName="h-7 w-full text-[11px]"
        />
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Localizar tags"
          value={tagSearch}
          onChange={(e) => setTagSearch(e.target.value)}
          className="h-7 w-full rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] pl-6 pr-2 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)]/20"
        />
      </div>

      {/* Lista de tags */}
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {/* Sem tags */}
        <button
          type="button"
          onClick={() => {
            setDraftField("withoutTags", !draft.withoutTags || undefined);
            setDraftField("tagIds", undefined);
          }}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors",
            draft.withoutTags
              ? "bg-[var(--brand-primary)]/10 font-semibold text-[var(--brand-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-subtle)]",
          )}
        >
          <span className="size-2 shrink-0 rounded-full border border-[var(--glass-border)] inline-block" />
          Sem tags
        </button>

        {filtered.map((tag) => {
          const isSelected = selectedIds.includes(tag.id);
          const color = tag.color || "#6366f1";
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                isSelected
                  ? "bg-[var(--brand-primary)]/5"
                  : "hover:bg-[var(--glass-bg-subtle)]",
              )}
            >
              <span
                className="max-w-[120px] truncate rounded px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  background: isSelected ? color : `${color}22`,
                  color: isSelected ? "#fff" : color,
                  border: `1px solid ${color}44`,
                }}
              >
                {tag.name}
              </span>
              {tag.dealCount != null && (
                <span className="ml-auto shrink-0 tabular-nums text-[10px] text-[var(--text-muted)]">
                  {tag.dealCount.toLocaleString("pt-BR")}
                </span>
              )}
            </button>
          );
        })}

        {filtered.length === 0 && tagSearch && (
          <p className="px-2 py-3 text-center text-[11px] text-[var(--text-muted)]">
            Nenhuma tag encontrada.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal: FilterPanelBody ─────────────────────────────────────

export type FilterPanelBodyProps = {
  value: AdvancedDealFilters;
  options: FilterOptionsResponse | null;
  optionsLoading: boolean;
  optionsError?: string | null;
  onApply: (next: AdvancedDealFilters) => void;
  onClear: () => void;
  onRequestSave?: (current: AdvancedDealFilters) => void;
  onClose?: () => void;
  syncOnce?: boolean;
  withHeader?: boolean;
  className?: string;
};

export function FilterPanelBody({
  value,
  options,
  optionsLoading,
  optionsError,
  onApply,
  onClear,
  onRequestSave,
  onClose,
  syncOnce = false,
  withHeader = false,
  className,
}: FilterPanelBodyProps) {
  const [draft, setDraft] = React.useState<AdvancedDealFilters>(value);
  const initializedRef = React.useRef(false);

  React.useEffect(() => {
    if (syncOnce && initializedRef.current) return;
    setDraft(value);
    initializedRef.current = true;
  }, [value, syncOnce]);

  // Apply imediato a cada mudança de campo (estilo Kommo)
  function setDraftField<K extends keyof AdvancedDealFilters>(
    key: K,
    next: AdvancedDealFilters[K],
  ) {
    setDraft((prev) => {
      const updated = { ...prev, [key]: next };
      onApply(updated);
      return updated;
    });
  }

  function toggleArray(prev: string[] | undefined, id: string): string[] | undefined {
    const arr = prev ?? [];
    const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
    return next.length === 0 ? undefined : next;
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {withHeader && (
        <div className="flex items-center justify-between border-b border-[var(--glass-border-subtle)] px-4 py-2.5">
          <h3 className="font-display text-[13px] font-bold text-[var(--text-primary)]">
            Filtros avançados
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-[11px] text-[var(--text-secondary)]"
            onClick={() => {
              setDraft({});
              onClear();
            }}
            disabled={isEmptyFilters(draft)}
          >
            <Trash2 className="size-3" />
            Limpar tudo
          </Button>
        </div>
      )}

      {/* Layout 3 colunas — cada coluna tem scroll independente */}
      <div className="grid min-h-0 flex-1 overflow-hidden" style={{ gridTemplateColumns: "200px 1fr 220px" }}>
        {/* Col 1 — Filtros Salvos */}
        <aside className="flex flex-col overflow-y-auto border-r border-[var(--glass-border-subtle)] py-3">
          <SavedFiltersColumn
            value={draft}
            onApply={(f) => {
              setDraft(f);
              onApply(f);
              onClose?.();
            }}
            onRequestSave={onRequestSave}
          />
        </aside>

        {/* Col 2 — Propriedades */}
        <main className="flex flex-col overflow-y-auto border-r border-[var(--glass-border-subtle)] px-4 py-3">
          <PropertiesColumn
            draft={draft}
            options={options}
            optionsLoading={optionsLoading}
            optionsError={optionsError}
            setDraftField={setDraftField}
            toggleArray={toggleArray}
          />
        </main>

        {/* Col 3 — Tags */}
        <aside className="flex flex-col overflow-y-auto">
          <TagsColumn
            draft={draft}
            options={options}
            setDraftField={setDraftField}
          />
        </aside>
      </div>

      {/* Footer — apenas Limpar + Salvar (Aplicar é automático) */}
      {!withHeader && (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--glass-border-subtle)] px-4 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-[11px] text-[var(--text-secondary)]"
            onClick={() => {
              setDraft({});
              onClear();
            }}
            disabled={isEmptyFilters(draft)}
          >
            <Trash2 className="size-3" />
            Limpar
          </Button>
          {onRequestSave && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1 text-[11px]"
              onClick={() => onRequestSave(draft)}
              disabled={isEmptyFilters(draft)}
            >
              <Save className="size-3" />
              Salvar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
