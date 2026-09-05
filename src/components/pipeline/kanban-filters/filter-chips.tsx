/**
 * Chips Kommo dos filtros de negócio: `Título: N` (sem listar nomes).
 * Usados dentro da pílula de busca — não numa faixa extra abaixo do header.
 */

"use client";

import { ActiveFilterChip, type ActiveFilterChipModel } from "@/components/crm/active-filter-chip";
import { cn } from "@/lib/utils";

import type { AdvancedDealFilters, CustomFieldFilter, FilterOptionsResponse } from "./types";

type Patch = (partial: Partial<AdvancedDealFilters>) => void;

function customCount(cf: CustomFieldFilter): number {
  if (Array.isArray(cf.value)) return cf.value.length || 1;
  return 1;
}

function customTitle(
  cf: CustomFieldFilter,
  options: FilterOptionsResponse | null,
  entity: "deal" | "contact",
): string {
  const defs = entity === "deal" ? options?.dealCustomFields : options?.contactCustomFields;
  const def = defs?.find((d) => d.name === cf.name);
  const label = def?.label ?? cf.name;
  return entity === "contact" ? `Contato · ${label}` : label;
}

/**
 * @param omitSearch  busca já está no input da pílula
 * @param omitDates   período vive no calendário do header
 */
export function dealFilterChips(
  filters: AdvancedDealFilters,
  options: FilterOptionsResponse | null,
  onPatch: Patch,
  opts: { omitSearch?: boolean; omitDates?: boolean } = {},
): ActiveFilterChipModel[] {
  const omitSearch = opts.omitSearch !== false;
  const omitDates = opts.omitDates !== false;
  const chips: ActiveFilterChipModel[] = [];

  if (!omitSearch && filters.search?.trim()) {
    chips.push({
      id: "search",
      title: "Busca",
      count: 1,
      onRemove: () => onPatch({ search: undefined }),
    });
  }

  if (filters.stageIds && filters.stageIds.length > 0) {
    chips.push({
      id: "stages",
      title: "Etapas",
      count: filters.stageIds.length,
      onRemove: () => onPatch({ stageIds: undefined }),
    });
  }

  if (filters.statuses && filters.statuses.length > 0) {
    chips.push({
      id: "status",
      title: "Status",
      count: filters.statuses.length,
      onRemove: () => onPatch({ statuses: undefined }),
    });
  }

  if (filters.withoutOwner) {
    chips.push({
      id: "owner",
      title: "Sem responsável",
      count: 1,
      onRemove: () => onPatch({ withoutOwner: undefined }),
    });
  } else if (filters.ownerIds && filters.ownerIds.length > 0) {
    chips.push({
      id: "owner",
      title: "Responsável",
      count: filters.ownerIds.filter(Boolean).length,
      onRemove: () => onPatch({ ownerIds: undefined }),
    });
  }

  if (filters.withoutContact) {
    chips.push({
      id: "contact",
      title: "Sem contato",
      count: 1,
      onRemove: () => onPatch({ withoutContact: undefined }),
    });
  }

  if (filters.withoutSource) {
    chips.push({
      id: "source",
      title: "Sem origem",
      count: 1,
      onRemove: () => onPatch({ withoutSource: undefined }),
    });
  } else if (filters.sources && filters.sources.length > 0) {
    chips.push({
      id: "source",
      title: "Origem",
      count: filters.sources.length,
      onRemove: () => onPatch({ sources: undefined }),
    });
  }

  if (filters.withoutUtmSource) {
    chips.push({
      id: "utmsource",
      title: "Sem utm_source",
      count: 1,
      onRemove: () => onPatch({ withoutUtmSource: undefined }),
    });
  } else if (filters.utmSources && filters.utmSources.length > 0) {
    chips.push({
      id: "utmsource",
      title: "utm_source",
      count: filters.utmSources.length,
      onRemove: () => onPatch({ utmSources: undefined }),
    });
  }

  if (filters.lostReasons && filters.lostReasons.length > 0) {
    chips.push({
      id: "lost",
      title: "Perda",
      count: filters.lostReasons.length,
      onRemove: () => onPatch({ lostReasons: undefined }),
    });
  }

  if (filters.withoutTags) {
    chips.push({
      id: "tags",
      title: "Sem tags",
      count: 1,
      onRemove: () => onPatch({ withoutTags: undefined, tagMode: undefined }),
    });
  } else if (filters.tagIds && filters.tagIds.length > 0) {
    chips.push({
      id: "tags",
      title: "Tags",
      count: filters.tagIds.length,
      onRemove: () => onPatch({ tagIds: undefined, tagMode: undefined }),
    });
  }

  if (filters.contactSearch?.trim()) {
    chips.push({
      id: "contact-search",
      title: "Contato",
      count: 1,
      onRemove: () => onPatch({ contactSearch: undefined }),
    });
  }
  if (filters.contactHasPhone === false) {
    chips.push({
      id: "phone",
      title: "Sem telefone",
      count: 1,
      onRemove: () => onPatch({ contactHasPhone: undefined }),
    });
  } else if (filters.contactHasPhone === true) {
    chips.push({
      id: "phone",
      title: "Com telefone",
      count: 1,
      onRemove: () => onPatch({ contactHasPhone: undefined }),
    });
  }
  if (filters.contactHasEmail === false) {
    chips.push({
      id: "email",
      title: "Sem e-mail",
      count: 1,
      onRemove: () => onPatch({ contactHasEmail: undefined }),
    });
  } else if (filters.contactHasEmail === true) {
    chips.push({
      id: "email",
      title: "Com e-mail",
      count: 1,
      onRemove: () => onPatch({ contactHasEmail: undefined }),
    });
  }

  if (!omitDates) {
    if (filters.createdAt && (filters.createdAt.from || filters.createdAt.to)) {
      chips.push({
        id: "created",
        title: "Criado",
        count: 1,
        onRemove: () => onPatch({ createdAt: undefined }),
      });
    }
    if (filters.updatedAt && (filters.updatedAt.from || filters.updatedAt.to)) {
      chips.push({
        id: "updated",
        title: "Atualizado",
        count: 1,
        onRemove: () => onPatch({ updatedAt: undefined }),
      });
    }
    if (filters.closedAt && (filters.closedAt.from || filters.closedAt.to)) {
      chips.push({
        id: "closed",
        title: "Fechado",
        count: 1,
        onRemove: () => onPatch({ closedAt: undefined }),
      });
    }
    if (filters.lastInteractionAt && (filters.lastInteractionAt.from || filters.lastInteractionAt.to)) {
      chips.push({
        id: "last-interaction",
        title: "Última interação",
        count: 1,
        onRemove: () => onPatch({ lastInteractionAt: undefined }),
      });
    }
  }

  if (filters.conversationStatus) {
    chips.push({
      id: "conversation",
      title: "Conversa",
      count: 1,
      onRemove: () => onPatch({ conversationStatus: undefined }),
    });
  }

  if (filters.windowState) {
    chips.push({
      id: "window",
      title: "Sessão da Meta",
      count: 1,
      onRemove: () => onPatch({ windowState: undefined }),
    });
  }

  if (filters.lastMessageDirection) {
    chips.push({
      id: "direction",
      title: filters.lastMessageDirection === "in" ? "Mensagem recebida" : "Mensagem enviada",
      count: 1,
      onRemove: () => onPatch({ lastMessageDirection: undefined }),
    });
  }

  if (filters.exception) {
    const titles = {
      no_task: "Sem próxima tarefa",
      stalled: "Parados",
      overdue: "Fechamento vencido",
      empty_value: "Sem valor",
    } as const;
    chips.push({
      id: "exception",
      title: titles[filters.exception],
      count: 1,
      onRemove: () => onPatch({ exception: undefined, stalledDays: undefined }),
    });
  }

  if (filters.valueFrom != null || filters.valueTo != null) {
    chips.push({
      id: "value",
      title: "Valor",
      count: 1,
      onRemove: () => onPatch({ valueFrom: undefined, valueTo: undefined }),
    });
  }

  for (const cf of filters.dealCustomFields ?? []) {
    chips.push({
      id: `deal-cf-${cf.name}`,
      title: customTitle(cf, options, "deal"),
      count: customCount(cf),
      onRemove: () =>
        onPatch({
          dealCustomFields: (filters.dealCustomFields ?? []).filter((f) => f.name !== cf.name),
        }),
    });
  }

  for (const cf of filters.contactCustomFields ?? []) {
    chips.push({
      id: `contact-cf-${cf.name}`,
      title: customTitle(cf, options, "contact"),
      count: customCount(cf),
      onRemove: () =>
        onPatch({
          contactCustomFields: (filters.contactCustomFields ?? []).filter((f) => f.name !== cf.name),
        }),
    });
  }

  return chips;
}

/** @deprecated Prefira chips na pílula via `dealFilterChips` + `SearchFilterBar`. */
export function FilterChips({
  filters,
  options,
  onPatch,
  className,
}: {
  filters: AdvancedDealFilters;
  options: FilterOptionsResponse | null;
  onPatch: Patch;
  className?: string;
}) {
  const chips = dealFilterChips(filters, options, onPatch, {
    omitSearch: false,
    omitDates: false,
  });
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {chips.map((chip) => (
        <ActiveFilterChip
          key={chip.id}
          title={chip.title}
          count={chip.count}
          onRemove={chip.onRemove}
        />
      ))}
    </div>
  );
}
