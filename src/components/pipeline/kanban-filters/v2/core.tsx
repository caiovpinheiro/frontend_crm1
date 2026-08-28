/**
 * Núcleo compartilhado dos filtros avançados — DS v2.
 *
 * Toda a lógica de estado e TODAS as seções de campo vivem aqui, estilizadas
 * exclusivamente com tokens do DS v2 (`ds` em `@/lib/design-system`):
 * slate/blue flat, radius 8/12/16, borda `black/6`, chips soft.
 *
 * As 4 variações de layout (drawer, barra+mega-painel, modal 2 col, modal 3 col)
 * apenas *arranjam* estas mesmas seções — a lógica nunca é duplicada.
 */

"use client";

import * as React from "react";
import {
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconSearch as Search,
  IconDeviceFloppy as Save,
  IconTrash as Trash2,
  IconBookmark as Bookmark,
  IconLock as Lock,
  IconUsers as UsersIcon,
  IconX as X,
} from "@tabler/icons-react";

import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";

import { cn } from "@/lib/utils";
import { ds } from "@/lib/design-system";
import {
  DropdownGlass,
  FILTER_FIELD_ITEM_CLASS,
  FILTER_FIELD_MENU_CLASS,
  FILTER_FIELD_TRIGGER_CLASS,
} from "@/components/crm/dropdown-glass";
import { UserAvatar } from "@/components/crm/user-avatar";
import { useModalPortalContainer } from "@/components/ui/modal-portal-context";
import { DatePicker } from "@/components/ui/date-picker";
import { SelectNative } from "@/components/ui/select";

import {
  DATE_PRESET_LABELS,
  dateRangeFromPreset,
  detectPreset,
  type DatePresetKey,
} from "../date-presets";
import { fetchSavedFilters, searchContactsForFilter, type ContactFilterHit } from "../api";
import type {
  AdvancedDealFilters,
  CustomField,
  CustomFieldFilter,
  CustomFieldOperator,
  DateRangeValue,
  FilterOptionsResponse,
  SavedFilter,
  TagMode,
} from "../types";
import { countActiveFilters, countPanelFilters, isEmptyFilters, SOURCE_NONE } from "../types";

// ─── Constantes ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: "OPEN" | "WON" | "LOST"; label: string; tone: "info" | "success" | "danger" }[] = [
  { value: "OPEN", label: "Aberto", tone: "info" },
  { value: "WON", label: "Ganho", tone: "success" },
  { value: "LOST", label: "Perdido", tone: "danger" },
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
  if (t === "SELECT" || t === "RADIO" || t === "DROPDOWN") return ["eq", "neq", "in", "filled", "empty"];
  if (t === "MULTI_SELECT" || t === "CHECKBOX") return ["in", "contains", "not_contains", "filled", "empty"];
  return ["contains", "not_contains", "eq", "neq", "filled", "empty"];
}

export const QUICK_FILTERS: { label: string; dot?: string; filters: AdvancedDealFilters }[] = [
  { label: "Leads ativos", dot: "var(--color-info)", filters: { statuses: ["OPEN"] } },
  { label: "Meus leads", dot: "#6366f1", filters: { ownerIds: ["__me__"] } },
  { label: "Leads ganhos", dot: "var(--color-success)", filters: { statuses: ["WON"] } },
  { label: "Leads perdidos", dot: "var(--color-danger)", filters: { statuses: ["LOST"] } },
  { label: "Sem responsável", dot: "var(--color-warning)", filters: { withoutOwner: true } },
  { label: "Mensagem recebida", dot: "#0ea5e9", filters: { lastMessageDirection: "in" } },
  { label: "Mensagem enviada", dot: "#8b5cf6", filters: { lastMessageDirection: "out" } },
];

// ─── Hook de estado (apply imediato, estilo Kommo) ──────────────────────────────

export type SetDraftField = <K extends keyof AdvancedDealFilters>(
  k: K,
  v: AdvancedDealFilters[K],
) => void;

export function useFilterDraft(value: AdvancedDealFilters, onApply: (f: AdvancedDealFilters) => void) {
  const [draft, setDraft] = React.useState<AdvancedDealFilters>(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  const setDraftField: SetDraftField = React.useCallback(
    (key, next) => {
      setDraft((prev) => {
        const updated = { ...prev, [key]: next };
        onApply(updated);
        return updated;
      });
    },
    [onApply],
  );

  const applyWhole = React.useCallback(
    (next: AdvancedDealFilters) => {
      setDraft(next);
      onApply(next);
    },
    [onApply],
  );

  const toggleArray = React.useCallback((prev: string[] | undefined, id: string): string[] | undefined => {
    const arr = prev ?? [];
    const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
    return next.length === 0 ? undefined : next;
  }, []);

  const reset = React.useCallback(() => {
    setDraft({});
    onApply({});
  }, [onApply]);

  return { draft, setDraft, setDraftField, applyWhole, toggleArray, reset };
}

export type SectionProps = {
  draft: AdvancedDealFilters;
  options: FilterOptionsResponse | null;
  optionsLoading: boolean;
  optionsError?: string | null;
  setDraftField: SetDraftField;
  toggleArray: (prev: string[] | undefined, id: string) => string[] | undefined;
};

// ─── Primitivas DS v2 ───────────────────────────────────────────────────────────

/** Card de campo — superfície glass, hairline, label uppercase, estado ativo brand. */
export function FieldCard({
  label,
  active,
  onClear,
  children,
  className,
}: {
  label: string;
  active?: boolean;
  onClear?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-[border-color,background-color,box-shadow]",
        active
          ? "border-[var(--brand-primary)]/30 bg-[var(--color-enterprise-bg)] shadow-[0_1px_3px_rgba(91,111,245,0.08)]"
          : "border-slate-200/90 bg-slate-50/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] hover:border-[var(--brand-primary)]/25 hover:bg-white v2-dark:border-white/10 v2-dark:bg-white/5 v2-dark:hover:bg-white/8",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
        {active && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-medium text-[var(--brand-primary)] transition-colors hover:text-[var(--brand-primary-light)]"
          >
            Limpar
          </button>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
        active
          ? "border-transparent bg-primary text-white"
          : "border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] text-[var(--text-secondary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
      )}
    >
      {active && <Check className="size-3" />}
      {children}
    </button>
  );
}

type MultiSelectOption = {
  value: string;
  label: React.ReactNode;
  searchText?: string;
};

/**
 * Dropdown multi-select para listas nos filtros.
 * Clique no item faz toggle sem fechar o menu.
 */
export function MultiSelectDropdown({
  options,
  selected,
  onToggle,
  placeholder = "Selecionar…",
  emptyLabel = "Nenhuma opção.",
  searchable,
  searchPlaceholder = "Buscar…",
  leading,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onToggle: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  leading?: React.ReactNode;
}) {
  const [search, setSearch] = React.useState("");
  const portalContainer = useModalPortalContainer();
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay =
        o.searchText ??
        (typeof o.label === "string" ? o.label : String(o.value));
      return hay.toLowerCase().includes(q);
    });
  }, [options, search]);

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (() => {
            const hit = options.find((o) => o.value === selected[0]);
            return (
              hit?.searchText ??
              (typeof hit?.label === "string" ? hit.label : "1 selecionado")
            );
          })()
        : `${selected.length} selecionados`;

  return (
    <DropdownPrimitive.Root modal={false} onOpenChange={(open) => !open && setSearch("")}>
      <DropdownPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            FILTER_FIELD_TRIGGER_CLASS,
            selected.length && "text-[var(--text-primary)]",
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">{summary}</span>
          <ChevronDown
            size={15}
            className="shrink-0 text-current opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </button>
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal container={portalContainer ?? undefined}>
        <DropdownPrimitive.Content
          align="start"
          sideOffset={6}
          className={cn(
            FILTER_FIELD_MENU_CLASS,
            "w-[var(--radix-dropdown-menu-trigger-width)] min-w-[220px]",
            "animate-in fade-in-0 zoom-in-95",
          )}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {searchable && (
            <div className="sticky top-0 z-[1] mb-1 bg-[var(--dropdown-solid-bg,var(--glass-bg-modal,#fff))] p-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-8 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] pl-8 pr-2 text-[12px] text-[var(--text-primary)] shadow-none outline-none transition-colors hover:bg-[var(--color-primary-soft)] focus:border-[var(--brand-primary)]/40 focus:ring-2 focus:ring-[var(--brand-primary)]/20"
                  onKeyDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}
          {leading}
          {filtered.length === 0 ? (
            <p className="px-2.5 py-3 text-center text-[12px] text-[var(--text-muted)]">
              {search.trim() ? "Nenhum resultado." : emptyLabel}
            </p>
          ) : (
            filtered.map((opt) => {
              const isOn = selectedSet.has(opt.value);
              return (
                <DropdownPrimitive.Item
                  key={opt.value}
                  onSelect={(e) => {
                    e.preventDefault();
                    onToggle(opt.value);
                  }}
                  className={cn(
                    FILTER_FIELD_ITEM_CLASS,
                    isOn && "bg-[var(--color-primary-soft)] text-[var(--brand-primary)]",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {isOn && (
                    <Check size={15} strokeWidth={2.5} className="shrink-0 text-[var(--brand-primary)]" />
                  )}
                </DropdownPrimitive.Item>
              );
            })
          )}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

/** Input texto compacto DS v2. */
export function TextField({
  value,
  onChange,
  placeholder,
  icon,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  type?: string;
}) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">{icon}</span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] px-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] shadow-none outline-none transition-colors",
          "hover:bg-[var(--color-primary-soft)] hover:border-[var(--input-border-focus)]",
          "focus:border-[var(--brand-primary)]/40 focus:bg-[var(--glass-bg-modal)] focus:ring-2 focus:ring-[var(--brand-primary)]/20",
          icon && "pl-8",
        )}
      />
    </div>
  );
}

function DateRangeField({ value, onChange }: { value?: DateRangeValue; onChange: (v: DateRangeValue | undefined) => void }) {
  const preset = detectPreset(value);
  return (
    <div className="space-y-2">
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
      />
      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value?.from ?? ""}
            onChange={(e) => onChange({ ...value, from: e.target.value || null })}
            className="h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] px-2 text-[13px] text-[var(--text-primary)] shadow-none outline-none transition-colors hover:bg-[var(--color-primary-soft)] focus:border-[var(--brand-primary)]/40 focus:ring-2 focus:ring-[var(--brand-primary)]/20"
          />
          <span className="shrink-0 text-[12px] text-ink-subtle">até</span>
          <input
            type="date"
            value={value?.to ?? ""}
            onChange={(e) => onChange({ ...value, to: e.target.value || null })}
            className="h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] px-2 text-[13px] text-[var(--text-primary)] shadow-none outline-none transition-colors hover:bg-[var(--color-primary-soft)] focus:border-[var(--brand-primary)]/40 focus:ring-2 focus:ring-[var(--brand-primary)]/20"
          />
        </div>
      )}
    </div>
  );
}

// ─── Seções de campo ────────────────────────────────────────────────────────────

export function SearchSection({ draft, setDraftField }: SectionProps) {
  return (
    <FieldCard label="Nome do lead" active={!!draft.search} onClear={() => setDraftField("search", undefined)}>
      <TextField
        value={draft.search ?? ""}
        onChange={(v) => setDraftField("search", v || undefined)}
        placeholder="Título, contato, e-mail…"
        icon={<Search className="size-3.5" />}
      />
    </FieldCard>
  );
}

export function StatusSection({ draft, setDraftField, toggleArray }: SectionProps) {
  const selected = draft.statuses ?? [];
  return (
    <FieldCard label="Status" active={!!selected.length} onClear={() => setDraftField("statuses", undefined)}>
      <MultiSelectDropdown
        placeholder="Selecionar status…"
        selected={selected}
        options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label, searchText: s.label }))}
        onToggle={(v) =>
          setDraftField("statuses", toggleArray(draft.statuses, v) as typeof draft.statuses)
        }
      />
    </FieldCard>
  );
}

/** Grupo de pílulas single-select (clicar na ativa limpa). */
function PillGroup<T extends string>({
  value,
  options,
  onSelect,
}: {
  value: T | undefined;
  options: { value: T; label: string }[];
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelect(o.value)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 font-display text-[12.5px] font-semibold transition-colors",
              active
                ? "bg-[var(--brand-primary)] text-white"
                : "bg-[var(--glass-bg-strong)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const CONVERSATION_STATUS_OPTIONS: { value: "open" | "closed"; label: string }[] = [
  { value: "open", label: "Aberta" },
  { value: "closed", label: "Fechada" },
];
const LAST_DIRECTION_OPTIONS: { value: "in" | "out"; label: string }[] = [
  { value: "out", label: "Agente" },
  { value: "in", label: "Cliente" },
];

/** Filtra negócios pela conversa do contato: status + direção da última mensagem. */
export function ConversationSection({ draft, setDraftField }: SectionProps) {
  const status = draft.conversationStatus;
  const dir = draft.lastMessageDirection;
  return (
    <FieldCard
      label="Conversa"
      active={!!status || !!dir}
      onClear={() => {
        setDraftField("conversationStatus", undefined);
        setDraftField("lastMessageDirection", undefined);
      }}
    >
      <div className="space-y-2.5">
        <div>
          <span className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">
            Status
          </span>
          <PillGroup
            value={status}
            options={CONVERSATION_STATUS_OPTIONS}
            onSelect={(v) =>
              setDraftField("conversationStatus", status === v ? undefined : v)
            }
          />
        </div>
        <div>
          <span className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">
            Última mensagem
          </span>
          <PillGroup
            value={dir}
            options={LAST_DIRECTION_OPTIONS}
            onSelect={(v) =>
              setDraftField("lastMessageDirection", dir === v ? undefined : v)
            }
          />
        </div>
      </div>
    </FieldCard>
  );
}

export function StagesSection({ draft, options, optionsLoading, setDraftField, toggleArray }: SectionProps) {
  const stages = options?.pipelines.flatMap((p) => p.stages) ?? [];
  const selected = draft.stageIds ?? [];
  return (
    <FieldCard label="Etapas" active={!!selected.length} onClear={() => setDraftField("stageIds", undefined)}>
      {optionsLoading ? (
        <p className="text-[12px] text-ink-subtle">Carregando…</p>
      ) : (
        <MultiSelectDropdown
          placeholder="Selecionar etapas…"
          emptyLabel="Nenhuma etapa."
          searchable={stages.length > 8}
          searchPlaceholder="Buscar etapa…"
          selected={selected}
          options={stages.map((stage) => ({
            value: stage.id,
            searchText: stage.name,
            label: (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: stage.color || "#94a3b8" }}
                />
                {stage.name}
              </span>
            ),
          }))}
          onToggle={(id) => setDraftField("stageIds", toggleArray(draft.stageIds, id))}
        />
      )}
    </FieldCard>
  );
}

export function SourcesSection({ draft, options, setDraftField, toggleArray }: SectionProps) {
  const allSources = options?.sources ?? [];
  const selected = (draft.sources ?? []).filter((s) => s !== SOURCE_NONE);
  const selectedKeys = draft.withoutSource
    ? ["__none__", ...selected]
    : selected;

  return (
    <FieldCard
      label="Origem"
      active={!!(selected.length || draft.withoutSource)}
      onClear={() => {
        setDraftField("sources", undefined);
        setDraftField("withoutSource", undefined);
      }}
    >
      <MultiSelectDropdown
        placeholder="Selecionar origem…"
        emptyLabel="Nenhuma origem cadastrada."
        searchable={allSources.length > 6}
        searchPlaceholder="Buscar origem…"
        selected={selectedKeys}
        options={[
          {
            value: "__none__",
            label: "Sem origem",
            searchText: "Sem origem",
          },
          ...allSources.map((source) => ({
            value: source,
            label: source,
            searchText: source,
          })),
        ]}
        onToggle={(value) => {
          if (value === "__none__") {
            const next = !draft.withoutSource;
            setDraftField("withoutSource", next || undefined);
            if (next) setDraftField("sources", undefined);
            return;
          }
          setDraftField("withoutSource", undefined);
          setDraftField("sources", toggleArray(selected, value));
        }}
      />
    </FieldCard>
  );
}

export function LossReasonsSection({ draft, options, setDraftField, toggleArray }: SectionProps) {
  const reasons = options?.lossReasons ?? [];
  if (reasons.length === 0) return null;
  const selected = draft.lostReasons ?? [];
  return (
    <FieldCard
      label="Motivo da perda"
      active={!!selected.length}
      onClear={() => setDraftField("lostReasons", undefined)}
    >
      <MultiSelectDropdown
        placeholder="Selecionar motivos…"
        searchable={reasons.length > 6}
        searchPlaceholder="Buscar motivo…"
        selected={selected}
        options={reasons.map((r) => ({ value: r, label: r, searchText: r }))}
        onToggle={(r) => setDraftField("lostReasons", toggleArray(draft.lostReasons, r))}
      />
    </FieldCard>
  );
}

export function OwnersSection({ draft, options, setDraftField }: SectionProps) {
  const users = options?.users ?? [];
  const selected = (draft.ownerIds ?? []).filter((id): id is string => !!id);
  const selectedKeys = draft.withoutOwner ? ["__none__", ...selected] : selected;

  return (
    <FieldCard
      label="Responsável"
      active={!!(selected.length || draft.withoutOwner)}
      onClear={() => {
        setDraftField("ownerIds", undefined);
        setDraftField("withoutOwner", undefined);
      }}
    >
      <MultiSelectDropdown
        placeholder="Selecionar responsável…"
        searchable={users.length > 6}
        searchPlaceholder="Buscar usuário…"
        selected={selectedKeys}
        options={[
          {
            value: "__none__",
            label: (
              <span className="inline-flex items-center gap-2">
                <span className={ds.avatar.empty + " size-5"}>
                  <X className="size-2.5" />
                </span>
                Sem responsável
              </span>
            ),
            searchText: "Sem responsável",
          },
          ...users.map((u) => ({
            value: u.id,
            searchText: u.name,
            label: (
              <span className="inline-flex items-center gap-2">
                <UserAvatar name={u.name} imageUrl={u.avatarUrl ?? null} size={20} />
                {u.name}
              </span>
            ),
          })),
        ]}
        onToggle={(value) => {
          if (value === "__none__") {
            const next = !draft.withoutOwner;
            setDraftField("withoutOwner", next || undefined);
            if (next) setDraftField("ownerIds", undefined);
            return;
          }
          const active = selected.includes(value);
          const next = active ? selected.filter((x) => x !== value) : [...selected, value];
          setDraftField("ownerIds", next.length ? next : undefined);
          setDraftField("withoutOwner", undefined);
        }}
      />
    </FieldCard>
  );
}

export function ContactSection({ draft, setDraftField }: SectionProps) {
  const search = draft.contactSearch ?? "";
  const [debounced, setDebounced] = React.useState("");
  const [hits, setHits] = React.useState<ContactFilterHit[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    if (debounced.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void searchContactsForFilter(debounced).then((rows) => {
      if (cancelled) return;
      setHits(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const active = !!(
    draft.contactSearch ||
    draft.contactHasPhone != null ||
    draft.contactHasEmail != null ||
    draft.withoutContact
  );
  const showResults = debounced.length >= 2;

  return (
    <FieldCard
      label="Contato"
      active={active}
      onClear={() => {
        setDraftField("contactSearch", undefined);
        setDraftField("contactHasPhone", undefined);
        setDraftField("contactHasEmail", undefined);
        setDraftField("withoutContact", undefined);
      }}
    >
      <div className="space-y-2">
        <TextField
          value={search}
          onChange={(v) => setDraftField("contactSearch", v || undefined)}
          placeholder="Nome, telefone, e-mail…"
          icon={<Search className="size-3.5" />}
        />
        {showResults && (
          <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] p-1">
            {loading ? (
              <p className="px-2 py-1.5 text-[12px] text-ink-subtle">Buscando…</p>
            ) : hits.length === 0 ? (
              <p className="px-2 py-1.5 text-[12px] text-ink-subtle">Nenhum contato encontrado.</p>
            ) : (
              hits.map((c) => {
                const selected = search.trim().toLowerCase() === c.name.trim().toLowerCase();
                const subtitle = [c.phone, c.email].filter(Boolean).join(" · ");
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setDraftField("contactSearch", c.name);
                      setDraftField("withoutContact", undefined);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors",
                      selected
                        ? "bg-primary-soft font-medium text-primary-dark"
                        : "text-ink-soft hover:bg-muted",
                    )}
                  >
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{ background: `hsl(${(c.name.charCodeAt(0) * 47) % 360} 55% 50%)` }}
                    >
                      {c.name[0]?.toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate">{c.name}</span>
                      {subtitle ? (
                        <span className="block truncate text-[11px] text-ink-subtle">{subtitle}</span>
                      ) : null}
                    </span>
                    {selected && <Check className="size-3.5 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "Tem telefone", field: "contactHasPhone" as const },
            { label: "Tem e-mail", field: "contactHasEmail" as const },
            { label: "Sem contato", field: "withoutContact" as const },
          ].map(({ label, field }) => (
            <ChipToggle
              key={label}
              active={draft[field] === true}
              onClick={() => setDraftField(field, draft[field] === true ? undefined : true)}
            >
              {label}
            </ChipToggle>
          ))}
        </div>
      </div>
    </FieldCard>
  );
}

export function ValueSection({ draft, setDraftField }: SectionProps) {
  return (
    <FieldCard
      label="Valor de venda"
      active={draft.valueFrom != null || draft.valueTo != null}
      onClear={() => {
        setDraftField("valueFrom", undefined);
        setDraftField("valueTo", undefined);
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="Mínimo"
          value={draft.valueFrom ?? ""}
          onChange={(e) => setDraftField("valueFrom", e.target.value !== "" ? Number(e.target.value) : undefined)}
          className="h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] px-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] shadow-none outline-none transition-colors hover:bg-[var(--color-primary-soft)] focus:border-[var(--brand-primary)]/40 focus:ring-2 focus:ring-[var(--brand-primary)]/20"
        />
        <span className="shrink-0 text-[12px] text-ink-subtle">–</span>
        <input
          type="number"
          placeholder="Máximo"
          value={draft.valueTo ?? ""}
          onChange={(e) => setDraftField("valueTo", e.target.value !== "" ? Number(e.target.value) : undefined)}
          className="h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] px-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] shadow-none outline-none transition-colors hover:bg-[var(--color-primary-soft)] focus:border-[var(--brand-primary)]/40 focus:ring-2 focus:ring-[var(--brand-primary)]/20"
        />
      </div>
    </FieldCard>
  );
}

/** Presets rápidos — mesmos do filtro de Contatos (aba Período). */
const CREATED_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "last_7", label: "Últimos 7 dias" },
  { key: "last_30", label: "Últimos 30 dias" },
  { key: "this_month", label: "Este mês" },
];

const DATE_TRIGGER_CLASS = cn(
  "h-9 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] px-3 shadow-none",
  "hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
  "focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40",
);

function patchDateSide(
  current: DateRangeValue | undefined,
  side: "from" | "to",
  raw: string,
): DateRangeValue | undefined {
  const next: DateRangeValue = { ...current, [side]: raw || null };
  if (!next.from && !next.to) return undefined;
  return next;
}

/**
 * Aba Datas no modelo Contatos: atalhos (criação) + ranges Criação / Fechamento.
 * Substitui os dropdowns "Qualquer data" anteriores.
 */
export function DatesPeriodSection({ draft, setDraftField }: SectionProps) {
  const createdActive = !!(draft.createdAt?.from || draft.createdAt?.to);
  const closedActive = !!(draft.closedAt?.from || draft.closedAt?.to);
  const createdPreset = detectPreset(draft.createdAt);

  function applyCreatedPreset(key: DatePresetKey) {
    const range = dateRangeFromPreset(key);
    if (!range) return;
    setDraftField("createdAt", range);
  }

  return (
    <div className="flex flex-col gap-3">
      <FieldCard label="Atalhos de criação">
        <div className="flex flex-wrap gap-1.5">
          {CREATED_PRESETS.map((p) => {
            const on = createdPreset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => applyCreatedPreset(p.key)}
                className={cn(
                  "rounded-full px-3 py-1.5 font-display text-[12px] font-bold transition-colors",
                  on
                    ? "bg-[var(--brand-primary)] text-white shadow-[0_4px_12px_rgba(91,111,245,0.3)]"
                    : "border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] text-[var(--text-secondary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </FieldCard>

      <FieldCard
        label="Criação"
        active={createdActive}
        onClear={() => setDraftField("createdAt", undefined)}
      >
        <div className="flex items-center gap-2">
          <DatePicker
            value={draft.createdAt?.from ?? null}
            onChange={(v) => setDraftField("createdAt", patchDateSide(draft.createdAt, "from", v))}
            placeholder="dd/mm/aaaa"
            className="min-w-0 flex-1"
            triggerClassName={DATE_TRIGGER_CLASS}
          />
          <span className="shrink-0 font-body text-[12px] text-[var(--text-muted)]">até</span>
          <DatePicker
            value={draft.createdAt?.to ?? null}
            onChange={(v) => setDraftField("createdAt", patchDateSide(draft.createdAt, "to", v))}
            placeholder="dd/mm/aaaa"
            className="min-w-0 flex-1"
            triggerClassName={DATE_TRIGGER_CLASS}
          />
        </div>
      </FieldCard>

      <FieldCard
        label="Fechamento"
        active={closedActive}
        onClear={() => setDraftField("closedAt", undefined)}
      >
        <div className="flex items-center gap-2">
          <DatePicker
            value={draft.closedAt?.from ?? null}
            onChange={(v) => setDraftField("closedAt", patchDateSide(draft.closedAt, "from", v))}
            placeholder="dd/mm/aaaa"
            className="min-w-0 flex-1"
            triggerClassName={DATE_TRIGGER_CLASS}
          />
          <span className="shrink-0 font-body text-[12px] text-[var(--text-muted)]">até</span>
          <DatePicker
            value={draft.closedAt?.to ?? null}
            onChange={(v) => setDraftField("closedAt", patchDateSide(draft.closedAt, "to", v))}
            placeholder="dd/mm/aaaa"
            className="min-w-0 flex-1"
            triggerClassName={DATE_TRIGGER_CLASS}
          />
        </div>
      </FieldCard>
    </div>
  );
}

/** @deprecated Use `DatesPeriodSection` — mantido para imports legados. */
export function CreatedAtSection(props: SectionProps) {
  return <DatesPeriodSection {...props} />;
}

/** @deprecated Conteúdo migrado para `DatesPeriodSection`. */
export function OtherDatesSection(_props: SectionProps) {
  return null;
}

// ── Custom fields ──

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
  const currentOp = filter.operator && allowedOps.includes(filter.operator) ? filter.operator : allowedOps[0];
  const opDef = CUSTOM_OPERATORS.find((o) => o.value === currentOp);
  const hasOptions = field.options && field.options.length > 0;
  const isMulti = currentOp === "in" || field.type === "MULTI_SELECT";
  const t = (field.type || "").toUpperCase();
  const inputType = t === "DATE" ? "date" : t === "NUMBER" ? "number" : "text";
  const dateVal =
    filter.value && typeof filter.value === "object" && !Array.isArray(filter.value)
      ? (filter.value as DateRangeValue)
      : {};

  const solidPanel = "bg-[var(--dropdown-solid-bg,var(--glass-bg-modal,#fff))]";
  const inputCls =
    "h-8 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] px-2 text-[12px] text-[var(--text-primary)] shadow-none outline-none transition-colors hover:bg-[var(--color-primary-soft)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20";

  return (
    <div className="space-y-1.5 rounded-lg border border-[var(--glass-border)] bg-white/70 px-2 py-2">
      <div className="flex items-center gap-1.5">
        <span
          className="min-w-0 flex-1 truncate rounded-md bg-[var(--brand-primary)]/8 px-2 py-1 text-[12px] font-semibold text-[var(--brand-primary)]"
          title={field.label}
        >
          {field.label}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-primary)]/8 hover:text-[var(--color-danger)]"
          aria-label={`Remover ${field.label}`}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <DropdownGlass
          options={allowedOps.map((op) => ({
            value: op,
            label: CUSTOM_OPERATORS.find((o) => o.value === op)?.label ?? op,
          }))}
          value={currentOp}
          onValueChange={(v) => onChange({ ...filter, operator: v as CustomFieldOperator, value: undefined })}
          triggerClassName="h-8 w-[120px] shrink-0 text-[12px] px-2"
          className={solidPanel}
        />
        {opDef?.needsValue ? (
          currentOp === "between" ? (
            <div className="grid min-w-0 flex-1 basis-full grid-cols-2 gap-1">
              <input
                type="date"
                value={dateVal.from ?? ""}
                onChange={(e) => onChange({ ...filter, value: { ...dateVal, from: e.target.value || null } })}
                className={inputCls}
              />
              <input
                type="date"
                value={dateVal.to ?? ""}
                onChange={(e) => onChange({ ...filter, value: { ...dateVal, to: e.target.value || null } })}
                className={inputCls}
              />
            </div>
          ) : hasOptions ? (
            isMulti ? (
              <SelectNative
                multiple
                value={Array.isArray(filter.value) ? filter.value : []}
                onChange={(e) => onChange({ ...filter, value: Array.from(e.target.selectedOptions).map((o) => o.value) })}
                className="min-w-0 flex-1 basis-[140px] rounded-md text-[12px]"
              >
                {field.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </SelectNative>
            ) : (
              <DropdownGlass
                options={field.options.map((o) => ({ value: o, label: o }))}
                value={typeof filter.value === "string" ? filter.value || undefined : undefined}
                onValueChange={(v) => onChange({ ...filter, value: v })}
                placeholder="— valor —"
                triggerClassName="h-8 min-w-0 flex-1 basis-[140px] text-[12px] px-2"
                className={solidPanel}
              />
            )
          ) : (
            <input
              type={inputType}
              value={typeof filter.value === "string" ? filter.value : ""}
              onChange={(e) => onChange({ ...filter, value: e.target.value })}
              placeholder="Valor"
              className={cn(inputCls, "min-w-0 flex-1 basis-[140px]")}
            />
          )
        ) : (
          <span className="flex-1 text-[11px] italic text-[var(--text-muted)]">sem valor</span>
        )}
      </div>
    </div>
  );
}

function CustomFieldsSection({
  label,
  entityKey,
  fieldsKey,
  draft,
  options,
  optionsLoading,
  setDraftField,
}: SectionProps & {
  label: string;
  entityKey: "dealCustomFields" | "contactCustomFields";
  fieldsKey: "dealCustomFields" | "contactCustomFields";
}) {
  const available = options?.[entityKey] ?? [];
  const selected = draft[fieldsKey] ?? [];
  if (available.length === 0 && selected.length === 0) return null;

  const unused = available.filter((cf) => !selected.some((x) => x.name === cf.name));

  function addFieldById(id: string) {
    const cf = available.find((d) => d.id === id);
    if (!cf) return;
    if (selected.some((x) => x.name === cf.name)) return;
    setDraftField(fieldsKey, [
      ...selected,
      { name: cf.name, operator: operatorsForType(cf.type)[0], value: "" },
    ]);
  }

  return (
    <FieldCard label={label} active={!!selected.length} onClear={() => setDraftField(fieldsKey, undefined)}>
      <div className="space-y-2">
        {optionsLoading ? (
          <p className="text-[12px] text-ink-subtle">Carregando…</p>
        ) : unused.length > 0 ? (
          <DropdownGlass
            options={unused.map((cf) => ({ value: cf.id, label: cf.label }))}
            value={undefined}
            onValueChange={addFieldById}
            placeholder="+ Escolher campo…"
          />
        ) : (
          <p className="text-[12px] text-[var(--text-muted)]">Todos os campos já foram adicionados.</p>
        )}
        {selected.map((cf) => {
          const def = available.find((d) => d.name === cf.name);
          if (!def) return null;
          return (
            <CustomFieldRow
              key={cf.name}
              field={def}
              filter={cf}
              onChange={(next) => setDraftField(fieldsKey, selected.map((x) => (x.name === cf.name ? next : x)))}
              onRemove={() => setDraftField(fieldsKey, selected.filter((x) => x.name !== cf.name))}
            />
          );
        })}
        {selected.length > 0 && (
          <p className="text-[11px] text-[var(--text-muted)]">
            Defina operador e valor em cada linha — o filtro fica ativo na hora.
          </p>
        )}
      </div>
    </FieldCard>
  );
}

export function DealCustomFieldsSection(props: SectionProps) {
  return (
    <CustomFieldsSection
      {...props}
      label="Campos do negócio"
      entityKey="dealCustomFields"
      fieldsKey="dealCustomFields"
    />
  );
}

export function ContactCustomFieldsSection(props: SectionProps) {
  return (
    <CustomFieldsSection
      {...props}
      label="Campos do contato"
      entityKey="contactCustomFields"
      fieldsKey="contactCustomFields"
    />
  );
}

// ── Tags ──

export function TagsSection({ draft, options, setDraftField }: SectionProps) {
  const allTags = options?.tags ?? [];
  const selectedIds = draft.tagIds ?? [];
  const selectedKeys = draft.withoutTags ? ["__none__", ...selectedIds] : selectedIds;

  function toggleTag(id: string) {
    if (id === "__none__") {
      const next = !draft.withoutTags;
      setDraftField("withoutTags", next || undefined);
      if (next) {
        setDraftField("tagIds", undefined);
        setDraftField("tagMode", undefined);
      }
      return;
    }
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    setDraftField("tagIds", next.length ? next : undefined);
    setDraftField("withoutTags", undefined);
    if (next.length === 0) setDraftField("tagMode", undefined);
  }

  return (
    <FieldCard
      label="Tags"
      active={!!(selectedIds.length || draft.withoutTags)}
      onClear={() => {
        setDraftField("tagIds", undefined);
        setDraftField("withoutTags", undefined);
        setDraftField("tagMode", undefined);
      }}
    >
      <div className="space-y-2">
        {selectedIds.length > 0 && (
          <DropdownGlass
            options={TAG_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={draft.tagMode ?? "any"}
            onValueChange={(v) =>
              setDraftField("tagMode", v === "any" ? undefined : (v as TagMode))
            }
          />
        )}
        <MultiSelectDropdown
          placeholder="Selecionar tags…"
          emptyLabel="Nenhuma tag."
          searchable={allTags.length > 6}
          searchPlaceholder="Localizar tags…"
          selected={selectedKeys}
          options={[
            {
              value: "__none__",
              label: "Sem tags",
              searchText: "Sem tags",
            },
            ...allTags.map((tag) => {
              const color = tag.color || "#6366f1";
              return {
                value: tag.id,
                searchText: tag.name,
                label: (
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span
                      className="max-w-[160px] truncate rounded-md px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        background: `${color}1f`,
                        color,
                        border: `1px solid ${color}40`,
                      }}
                    >
                      {tag.name}
                    </span>
                    {tag.dealCount != null && (
                      <span className="tabular-nums text-[11px] text-ink-subtle">
                        {tag.dealCount.toLocaleString("pt-BR")}
                      </span>
                    )}
                  </span>
                ),
              };
            }),
          ]}
          onToggle={toggleTag}
        />
      </div>
    </FieldCard>
  );
}

// ── Filtros rápidos / salvos ──

export function QuickFiltersList({
  draft,
  onApply,
  onRequestSave,
  orientation = "vertical",
}: {
  draft: AdvancedDealFilters;
  onApply: (f: AdvancedDealFilters) => void;
  onRequestSave?: (f: AdvancedDealFilters) => void;
  orientation?: "vertical" | "horizontal";
}) {
  const [savedFilters, setSavedFilters] = React.useState<SavedFilter[]>([]);

  React.useEffect(() => {
    fetchSavedFilters()
      .then(setSavedFilters)
      .catch(() => {});
  }, []);

  function isActiveQuick(qf: (typeof QUICK_FILTERS)[number]) {
    const keys = Object.keys(qf.filters) as (keyof AdvancedDealFilters)[];
    return keys.every((k) => JSON.stringify(draft[k]) === JSON.stringify(qf.filters[k]));
  }

  if (orientation === "horizontal") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_FILTERS.map((qf) => {
          const active = isActiveQuick(qf);
          return (
            <button
              key={qf.label}
              type="button"
              onClick={() => onApply(qf.filters)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                active
                  ? "border-transparent bg-[var(--brand-primary)] text-white shadow-sm"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] text-ink-soft hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
              )}
            >
              {qf.dot && <span className="size-2 rounded-full" style={{ background: qf.dot }} />}
              {qf.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {QUICK_FILTERS.map((qf) => {
        const active = isActiveQuick(qf);
        return (
          <button
            key={qf.label}
            type="button"
            onClick={() => onApply(qf.filters)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
              active
                ? "bg-[var(--brand-primary)]/12 font-semibold text-[var(--brand-primary)] ring-1 ring-inset ring-[var(--brand-primary)]/25"
                : "text-ink-soft hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
            )}
          >
            {qf.dot && <span className="size-2 shrink-0 rounded-full" style={{ background: qf.dot }} />}
            {qf.label}
          </button>
        );
      })}

      {savedFilters.length > 0 && (
        <>
          <div className="my-2 border-t border-black/5" />
          <span className="px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Salvos</span>
          {savedFilters.map((sf) => {
            const active = JSON.stringify(draft) === JSON.stringify(sf.filterConfig);
            return (
              <button
                key={sf.id}
                type="button"
                onClick={() => onApply(sf.filterConfig as AdvancedDealFilters)}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                  active
                    ? "bg-[var(--brand-primary)]/12 font-semibold text-[var(--brand-primary)] ring-1 ring-inset ring-[var(--brand-primary)]/25"
                    : "text-ink-soft hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
                )}
              >
                <Bookmark className="size-3.5 shrink-0 text-primary/60" />
                <span className="flex-1 truncate">{sf.name}</span>
                {sf.isShared ? <UsersIcon className="size-3.5 shrink-0 opacity-40" /> : <Lock className="size-3.5 shrink-0 opacity-40" />}
              </button>
            );
          })}
        </>
      )}

      {onRequestSave && !isEmptyFilters(draft) && (
        <>
          <div className="my-2 border-t border-black/5" />
          <button
            type="button"
            onClick={() => onRequestSave(draft)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-ink-muted transition-colors hover:bg-muted hover:text-foreground"
          >
            <Save className="size-3.5" />
            Salvar filtro atual
          </button>
        </>
      )}
    </div>
  );
}

// ─── Header / Footer compartilhados ─────────────────────────────────────────────

export function FilterHeaderActions({
  draft,
  onClear,
  onRequestSave,
}: {
  draft: AdvancedDealFilters;
  onClear: () => void;
  onRequestSave?: (f: AdvancedDealFilters) => void;
}) {
  const empty = isEmptyFilters(draft);
  return (
    <div className="flex items-center gap-2">
      {onRequestSave && (
        <button
          type="button"
          onClick={() => onRequestSave(draft)}
          disabled={empty}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-ink-soft transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <Save className="size-3.5" />
          Salvar
        </button>
      )}
      <button
        type="button"
        onClick={onClear}
        disabled={empty}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-ink-soft transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <Trash2 className="size-3.5" />
        Limpar
      </button>
    </div>
  );
}

export function ActiveCountBadge({ draft }: { draft: AdvancedDealFilters }) {
  const n = countPanelFilters(draft);
  if (n === 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
      {n}
    </span>
  );
}

export { ChevronDown, countActiveFilters, countPanelFilters, isEmptyFilters };
