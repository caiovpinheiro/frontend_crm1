/**
 * Chips visuais dos filtros ativos no Kanban.
 * Cada chip carrega `onRemove` que limpa apenas aquele critério.
 */

"use client";

import * as React from "react";
import { IconX as X } from "@tabler/icons-react";
import { TooltipGlass } from "@/components/crm/tooltip-glass";

import { cn } from "@/lib/utils";

import { DATE_PRESET_LABELS, detectPreset } from "./date-presets";
import type { AdvancedDealFilters, FilterOptionsResponse } from "./types";
import { SOURCE_NONE } from "./types";

type Props = {
  filters: AdvancedDealFilters;
  options: FilterOptionsResponse | null;
  onPatch: (partial: Partial<AdvancedDealFilters>) => void;
  className?: string;
};

type Chip = { label: string; onRemove: () => void };

function nameById<T extends { id: string; name?: string; label?: string }>(
  list: T[] | undefined,
  id: string,
): string {
  const item = list?.find((x) => x.id === id);
  return item?.label ?? item?.name ?? id.slice(0, 6);
}

function dateRangeLabel(range: { from?: string | null; to?: string | null } | undefined): string {
  const preset = detectPreset(range);
  if (preset !== "custom") return DATE_PRESET_LABELS[preset];
  if (range?.from && range?.to) return `${range.from} → ${range.to}`;
  if (range?.from) return `≥ ${range.from}`;
  if (range?.to) return `≤ ${range.to}`;
  return "Qualquer";
}

export function FilterChips({ filters, options, onPatch, className }: Props) {
  const chips: Chip[] = [];

  if (filters.search?.trim()) {
    chips.push({
      label: `Buscar: ${filters.search}`,
      onRemove: () => onPatch({ search: undefined }),
    });
  }

  if (filters.stageIds && filters.stageIds.length > 0) {
    const allStages = options?.pipelines.flatMap((p) => p.stages) ?? [];
    const names = filters.stageIds
      .map((id) => allStages.find((s) => s.id === id)?.name ?? id.slice(0, 6))
      .join(", ");
    chips.push({
      label: `Etapas: ${names}`,
      onRemove: () => onPatch({ stageIds: undefined }),
    });
  }

  if (filters.statuses && filters.statuses.length > 0) {
    const map = { OPEN: "Aberto", WON: "Ganho", LOST: "Perdido" } as const;
    chips.push({
      label: `Status: ${filters.statuses.map((s) => map[s] ?? s).join(", ")}`,
      onRemove: () => onPatch({ statuses: undefined }),
    });
  }

  if (filters.withoutOwner) {
    chips.push({
      label: "Sem responsável",
      onRemove: () => onPatch({ withoutOwner: undefined }),
    });
  } else if (filters.ownerIds && filters.ownerIds.length > 0) {
    const names = filters.ownerIds
      .filter((id): id is string => !!id)
      .map((id) => nameById(options?.users, id))
      .join(", ");
    chips.push({
      label: `Responsável: ${names || "—"}`,
      onRemove: () => onPatch({ ownerIds: undefined }),
    });
  }

  if (filters.withoutContact) {
    chips.push({
      label: "Sem contato",
      onRemove: () => onPatch({ withoutContact: undefined }),
    });
  }

  if (filters.withoutSource) {
    chips.push({
      label: "Sem origem",
      onRemove: () => onPatch({ withoutSource: undefined }),
    });
  } else if (filters.sources && filters.sources.length > 0) {
    chips.push({
      label: `Origem: ${filters.sources.map((s) => (s === SOURCE_NONE ? "Sem origem" : s)).join(", ")}`,
      onRemove: () => onPatch({ sources: undefined }),
    });
  }

  if (filters.withoutTags) {
    chips.push({
      label: "Sem tags",
      onRemove: () => onPatch({ withoutTags: undefined }),
    });
  } else if (filters.tagIds && filters.tagIds.length > 0) {
    const names = filters.tagIds.map((id) => nameById(options?.tags, id)).join(", ");
    const modeLabel =
      filters.tagMode === "all"
        ? "contém todas"
        : filters.tagMode === "none"
          ? "não contém"
          : "contém";
    chips.push({
      label: `Tags (${modeLabel}): ${names}`,
      onRemove: () => onPatch({ tagIds: undefined, tagMode: undefined }),
    });
  }

  if (filters.contactSearch?.trim()) {
    chips.push({
      label: `Contato: ${filters.contactSearch}`,
      onRemove: () => onPatch({ contactSearch: undefined }),
    });
  }
  if (filters.contactHasPhone === false) {
    chips.push({
      label: "Sem telefone",
      onRemove: () => onPatch({ contactHasPhone: undefined }),
    });
  } else if (filters.contactHasPhone === true) {
    chips.push({
      label: "Com telefone",
      onRemove: () => onPatch({ contactHasPhone: undefined }),
    });
  }
  if (filters.contactHasEmail === false) {
    chips.push({
      label: "Sem e-mail",
      onRemove: () => onPatch({ contactHasEmail: undefined }),
    });
  } else if (filters.contactHasEmail === true) {
    chips.push({
      label: "Com e-mail",
      onRemove: () => onPatch({ contactHasEmail: undefined }),
    });
  }

  if (filters.createdAt && (filters.createdAt.from || filters.createdAt.to)) {
    chips.push({
      label: `Criado: ${dateRangeLabel(filters.createdAt)}`,
      onRemove: () => onPatch({ createdAt: undefined }),
    });
  }
  if (filters.updatedAt && (filters.updatedAt.from || filters.updatedAt.to)) {
    chips.push({
      label: `Atualizado: ${dateRangeLabel(filters.updatedAt)}`,
      onRemove: () => onPatch({ updatedAt: undefined }),
    });
  }
  if (filters.closedAt && (filters.closedAt.from || filters.closedAt.to)) {
    chips.push({
      label: `Fechado: ${dateRangeLabel(filters.closedAt)}`,
      onRemove: () => onPatch({ closedAt: undefined }),
    });
  }
  if (filters.lastInteractionAt && (filters.lastInteractionAt.from || filters.lastInteractionAt.to)) {
    chips.push({
      label: `Última interação: ${dateRangeLabel(filters.lastInteractionAt)}`,
      onRemove: () => onPatch({ lastInteractionAt: undefined }),
    });
  }

  if (filters.lastMessageDirection) {
    chips.push({
      label:
        filters.lastMessageDirection === "in"
          ? "Mensagem recebida"
          : "Mensagem enviada",
      onRemove: () => onPatch({ lastMessageDirection: undefined }),
    });
  }

  if (filters.exception) {
    const labels = {
      no_task: "Sem próxima tarefa",
      stalled: `Parados > ${filters.stalledDays ?? 7} dias`,
      overdue: "Fechamento previsto vencido",
      empty_value: "Sem valor preenchido",
    } as const;
    chips.push({
      label: labels[filters.exception],
      onRemove: () => onPatch({ exception: undefined, stalledDays: undefined }),
    });
  }

  for (const cf of filters.dealCustomFields ?? []) {
    const def = options?.dealCustomFields.find((d) => d.name === cf.name);
    const label = def?.label ?? cf.name;
    const valueStr =
      typeof cf.value === "string"
        ? cf.value
        : Array.isArray(cf.value)
          ? cf.value.join(", ")
          : cf.operator === "filled"
            ? "preenchido"
            : cf.operator === "empty"
              ? "vazio"
              : "";
    chips.push({
      label: `${label}${valueStr ? `: ${valueStr}` : ""}`,
      onRemove: () =>
        onPatch({
          dealCustomFields: (filters.dealCustomFields ?? []).filter((f) => f.name !== cf.name),
        }),
    });
  }

  for (const cf of filters.contactCustomFields ?? []) {
    const def = options?.contactCustomFields.find((d) => d.name === cf.name);
    const label = `Contato · ${def?.label ?? cf.name}`;
    const valueStr =
      typeof cf.value === "string"
        ? cf.value
        : Array.isArray(cf.value)
          ? cf.value.join(", ")
          : cf.operator === "filled"
            ? "preenchido"
            : cf.operator === "empty"
              ? "vazio"
              : "";
    chips.push({
      label: `${label}${valueStr ? `: ${valueStr}` : ""}`,
      onRemove: () =>
        onPatch({
          contactCustomFields: (filters.contactCustomFields ?? []).filter((f) => f.name !== cf.name),
        }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip, idx) => (
        <TooltipGlass key={`${chip.label}-${idx}`} label="Remover filtro" side="top">
          <button
            type="button"
            onClick={chip.onRemove}
            className="group inline-flex items-center gap-1 rounded-full border border-primary/25 bg-[var(--color-primary-soft)] px-2.5 py-0.5 text-[11px] font-medium text-primary backdrop-blur-sm transition-all hover:border-[var(--color-danger)]/35 hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
          >
            <span>{chip.label}</span>
            <X className="size-3 opacity-60 group-hover:opacity-100" />
          </button>
        </TooltipGlass>
      ))}
    </div>
  );
}
