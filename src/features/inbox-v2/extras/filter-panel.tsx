"use client";

/*
 * InboxFilterButton — abre modal canônica de filtros (mesmo shell do funil).
 *
 * Layout wide 3 colunas:
 *   Col 1 — Ordenar
 *   Col 2 — Conversa | Negócio (abas)
 *   Col 3 — Tags
 *
 * Backend: ownerId, withoutOwner, channel, channelIds, stageId, tagIds,
 * sources, windowState (Aberta/Fechada).
 * Client-side: sort + lastMessageDirection.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  IconAdjustmentsHorizontal as SlidersHorizontal,
  IconCheck,
  IconFilter,
  IconUserOff,
  IconX as X,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { FilterSearchTrigger } from "@/components/crm/filter-search-trigger";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { TagChip } from "@/components/crm/tag-chip";
import { useOmnisearchMenu } from "@/components/crm/use-omnisearch-menu";
import { useInboxOmnisearch } from "../hooks/use-inbox-omnisearch";
import {
  flattenInboxSearchHits,
  InboxSearchResultsPanel,
} from "./inbox-search-results";
import { UserAvatar } from "@/components/crm/user-avatar";
import { ModalPortalContext } from "@/components/ui/modal-portal-context";
import {
  FieldCard,
  MultiSelectDropdown,
} from "@/components/pipeline/kanban-filters/v2/core";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { useTeamUsers } from "@/features/inbox-v2/hooks";
import {
  getPipelineBoard,
  listInboxFilterChannels,
  listPipelines,
  listTags,
  type ConversationListRow,
  type InboxFilterChannel,
  type InboxFilters,
} from "@/features/inbox-v2/api";
import { normalizeInboxFilters } from "@/features/inbox-v2/api/types";
import { formatConnectionPhone } from "@/lib/connection-label";
import { SOURCE_NONE } from "@/components/pipeline/kanban-filters/types";
import { useContactSources } from "@/hooks/use-contact-sources";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { useIsDesktop } from "@/hooks/use-media-query";

interface InboxFilterButtonProps {
  value: InboxFilters;
  onChange: (next: InboxFilters) => void;
  variant?: "standalone" | "integrated";
  /** Controle externo do modal (ex.: barra com `FilterSearchTrigger`). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Só o portal do modal — o trigger fica no `FilterSearchTrigger`. */
  hideTrigger?: boolean;
}

interface InboxSearchFilterBarProps {
  search: string;
  onSearch: (value: string) => void;
  filters: InboxFilters;
  onChangeFilters: (next: InboxFilters) => void;
  placeholder?: string;
  className?: string;
  onPickConversation?: (row: ConversationListRow) => void;
  onPickDeal?: (id: string) => void;
}

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  meta: "Messenger",
  facebook: "Messenger",
  telegram: "Telegram",
  email: "E-mail",
  webchat: "Webchat / Formulário",
};

function hasChannelFilter(f: InboxFilters): boolean {
  return Boolean(f.channel) || (f.channelIds?.length ?? 0) > 0;
}

function selectedChannelIds(f: InboxFilters): string[] {
  if (f.channelIds?.length) return f.channelIds;
  return f.channel ? [f.channel] : [];
}

function channelStatusBadge(ch: InboxFilterChannel): string | null {
  if (ch.deleted || ch.status === "DELETED") return "Excluído";
  if (ch.status === "CONNECTED") return null;
  return "Desativado";
}

function channelGrantIds(grants: unknown): string[] {
  if (!Array.isArray(grants) || grants.length === 0) return [];
  return grants
    .map((g) => {
      if (typeof g === "string") return g;
      if (g && typeof g === "object" && "id" in g) {
        return String((g as { id: unknown }).id ?? "");
      }
      return "";
    })
    .filter(Boolean);
}

const SORT_OPTIONS: ReadonlyArray<{
  id: string;
  label: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}> = [
  { id: "recent", label: "Mais recentes", sortBy: "lastInboundAt", sortOrder: "desc" },
  { id: "oldest", label: "Mais antigas", sortBy: "lastInboundAt", sortOrder: "asc" },
  { id: "unread", label: "Não lidas primeiro", sortBy: "unreadCount", sortOrder: "desc" },
];

const DEFAULT_SORT_ID = "recent";

type MiddleTab = "conversa" | "negocio";

const MIDDLE_TABS: { id: MiddleTab; label: string; hint: string }[] = [
  { id: "conversa", label: "Conversa", hint: "Responsável, canal e status" },
  { id: "negocio", label: "Negócio", hint: "Etapa e origem" },
];

function sortIdFromFilters(f: InboxFilters): string {
  if (!f.sortBy) return DEFAULT_SORT_ID;
  const match = SORT_OPTIONS.find(
    (o) => o.sortBy === f.sortBy && o.sortOrder === (f.sortOrder ?? "desc"),
  );
  return match?.id ?? DEFAULT_SORT_ID;
}

function countActive(f: InboxFilters): number {
  let n = 0;
  if ((f.ownerIds?.length ?? 0) > 0 || f.ownerId || f.withoutOwner) n += 1;
  if (hasChannelFilter(f)) n += 1;
  if ((f.stageIds?.length ?? 0) > 0 || f.stageId) n += 1;
  if (f.tagIds && f.tagIds.length > 0) n += 1;
  if (f.sources && f.sources.length > 0) n += 1;
  if (f.sessionExpiresWithinHours != null) n += 1;
  if (f.windowState) n += 1;
  if (f.lastMessageDirection) n += 1;
  if (f.painelException) n += 1;
  if (sortIdFromFilters(f) !== DEFAULT_SORT_ID) n += 1;
  return n;
}

function middleTabCount(id: MiddleTab, f: InboxFilters): number {
  if (id === "conversa") {
    return (
      ((f.ownerIds?.length ?? 0) > 0 || f.ownerId || f.withoutOwner ? 1 : 0) +
      (hasChannelFilter(f) ? 1 : 0) +
      (f.sessionExpiresWithinHours != null ? 1 : 0)
    );
  }
  return (
    ((f.stageIds?.length ?? 0) > 0 || f.stageId ? 1 : 0) +
    (f.sources && f.sources.length > 0 ? 1 : 0)
  );
}

function ConversationSegmentation({
  draft,
  setDraft,
}: {
  draft: InboxFilters;
  setDraft: React.Dispatch<React.SetStateAction<InboxFilters>>;
}) {
  const activeCount =
    (draft.windowState ? 1 : 0) +
    (draft.lastMessageDirection ? 1 : 0) +
    (draft.sessionExpiresWithinHours != null ? 1 : 0);
  const statusOptions = [
    { value: "open" as const, label: "Aberta" },
    { value: "closed" as const, label: "Fechada" },
  ];
  const directionOptions = [
    { value: "out" as const, label: "Agente" },
    { value: "in" as const, label: "Cliente" },
  ];

  return (
    <div className="mb-4 border-b border-[var(--glass-border-subtle)] pb-4">
      <div className="mb-2.5 flex items-center justify-between px-2">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.09em] text-[var(--text-muted)]">
          Segmentar conversas
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                windowState: undefined,
                lastMessageDirection: undefined,
                sessionExpiresWithinHours: undefined,
              }))
            }
            className="font-display text-[10px] font-semibold text-[var(--brand-primary)]"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="space-y-3 rounded-[var(--radius-lg)] border border-slate-200/90 bg-slate-50/80 p-2.5 v2-dark:border-white/10 v2-dark:bg-white/5">
        <div>
          <span className="mb-1.5 block font-body text-[10.5px] text-[var(--text-muted)]">
            Status
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {statusOptions.map((option) => {
              const active = draft.windowState === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      windowState: active ? undefined : option.value,
                    }))
                  }
                  className={cn(
                    "rounded-[var(--radius-md)] px-2 py-1.5 font-display text-[11px] font-semibold transition-colors",
                    active
                      ? "bg-[var(--brand-primary)] text-white"
                      : "bg-[var(--glass-bg-modal)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)]",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block font-body text-[10.5px] text-[var(--text-muted)]">
            Sessão do WhatsApp expira em até
          </span>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 4, 6, 12].map((hours) => {
              const active = draft.sessionExpiresWithinHours === hours;
              return (
                <button
                  key={hours}
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      sessionExpiresWithinHours: active ? undefined : hours,
                    }))
                  }
                  className={cn(
                    "rounded-[var(--radius-md)] px-1 py-1.5 font-display text-[11px] font-semibold transition-colors",
                    active
                      ? "bg-[var(--brand-primary)] text-white"
                      : "bg-[var(--glass-bg-modal)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)]",
                  )}
                >
                  {hours}h
                </button>
              );
            })}
          </div>
          <input
            type="number"
            min={0.1}
            max={23.9}
            step={0.5}
            value={draft.sessionExpiresWithinHours ?? ""}
            onChange={(event) => {
              const hours = Number(event.target.value);
              setDraft((d) => ({
                ...d,
                sessionExpiresWithinHours:
                  Number.isFinite(hours) && hours > 0 && hours < 24
                    ? hours
                    : undefined,
              }));
            }}
            placeholder="Outro valor (0–24h)"
            className="mt-1.5 h-8 w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] px-2.5 font-body text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)]/40"
          />
          <p className="mt-1 font-body text-[10px] text-[var(--text-muted)]">
            Apenas sessões Meta ainda abertas.
          </p>
        </div>

        <div>
          <span className="mb-1.5 block font-body text-[10.5px] text-[var(--text-muted)]">
            Direção da última mensagem
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {directionOptions.map((option) => {
              const active = draft.lastMessageDirection === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      lastMessageDirection: active ? undefined : option.value,
                    }))
                  }
                  className={cn(
                    "rounded-[var(--radius-md)] px-2 py-1.5 font-display text-[11px] font-semibold transition-colors",
                    active
                      ? "bg-[var(--brand-primary)] text-white"
                      : "bg-[var(--glass-bg-modal)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)]",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxFilterModalShell({
  onClose,
  draftCount,
  onClear,
  onApply,
  clearDisabled,
  wide,
  children,
}: {
  onClose: () => void;
  draftCount: number;
  onClear: () => void;
  onApply: () => void;
  clearDisabled: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [portalNode, setPortalNode] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-(--z-popover) flex items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-md"
        onMouseDown={onClose}
        aria-hidden
      />
      <div
        ref={setPortalNode}
        role="dialog"
        aria-modal="true"
        aria-label="Filtros de conversas"
        className={cn(
          "relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] text-[var(--text-primary)] shadow-[var(--glass-shadow-lg)] backdrop-blur-xl",
          wide ? "h-[min(84vh,720px)] max-w-[980px]" : "h-[min(92dvh,100%)] max-w-lg",
        )}
      >
        <ModalPortalContext.Provider value={portalNode}>
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--glass-border-subtle)] px-5 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
                <SlidersHorizontal className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-[16px] font-bold tracking-tight text-[var(--text-primary)]">
                    Filtros de conversas
                  </h2>
                  {draftCount > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1.5 font-display text-[10px] font-bold text-white">
                      {draftCount}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-body text-[12px] text-[var(--text-muted)]">
                  Ordenação, responsável, canal, etapa, origem e tags
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
              aria-label="Fechar"
            >
              <X className="size-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1">{children}</div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)] px-5 py-3">
            <p className="font-body text-[12px] text-[var(--text-muted)]">
              <b className="font-semibold text-[var(--brand-primary)]">{draftCount}</b>{" "}
              critérios selecionados
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onClear}
                disabled={clearDisabled}
                className="inline-flex h-9 items-center rounded-[var(--radius-md)] px-3 font-display text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-overlay)] disabled:opacity-40"
              >
                Limpar tudo
              </button>
              <button
                type="button"
                onClick={onApply}
                className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-4 font-display text-[12px] font-bold text-white shadow-[0_4px_12px_rgba(91,111,245,0.35)] transition-opacity hover:opacity-90"
              >
                <IconCheck size={13} />
                Aplicar filtros
              </button>
            </div>
          </footer>
        </ModalPortalContext.Provider>
      </div>
    </div>
  );
}

export function InboxSearchFilterBar({
  search,
  onSearch,
  filters,
  onChangeFilters,
  placeholder = "Pesquisar e filtrar...",
  className,
  onPickConversation,
  onPickDeal,
}: InboxSearchFilterBarProps) {
  const [open, setOpen] = React.useState(false);
  const activeCount = countActive(filters);
  const hits = useInboxOmnisearch(search, search.trim().length >= 3);
  const flatHits = flattenInboxSearchHits(hits.conversations, hits.deals);
  const menu = useOmnisearchMenu(search, flatHits.length);

  function pickConversation(row: ConversationListRow) {
    onPickConversation?.(row);
    onSearch("");
    menu.close();
  }

  function pickDeal(id: string) {
    onPickDeal?.(id);
    onSearch("");
    menu.close();
  }

  function pickActiveHit() {
    const hit = flatHits[menu.activeIndex] ?? flatHits[0];
    if (!hit) return;
    if (hit.kind === "conversation") pickConversation(hit.row);
    else pickDeal(hit.deal.id);
  }

  // Chips de filtros ativos ficam ABAIXO da pill de busca (mesma UX do
  // Pipeline v2 — ver `FilterChips` em kanban-filters + render em
  // `pipeline/_v2-client.tsx`). Antes o inbox só mostrava contador dentro
  // do botão de filtro, e o operador não sabia quais critérios estavam
  // ativos sem reabrir o modal.
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div ref={menu.wrapRef}>
        <FilterSearchTrigger
          search={search}
          onSearch={onSearch}
          onFocus={() => menu.setFocused(true)}
          onKeyDown={(e) => menu.onInputKeyDown(e, pickActiveHit)}
          onOpenFilters={() => {
            setOpen(true);
            menu.close();
          }}
          filtersOpen={open}
          activeCount={activeCount}
          placeholder={placeholder}
          ariaLabel="Buscar conversas e negócios"
          tooltipLabel="Filtrar conversas"
        />
      </div>
      {menu.showHits && menu.coords && typeof document !== "undefined" && (
        <InboxSearchResultsPanel
          coords={menu.coords}
          loading={hits.isLoading || hits.waitingDebounce}
          query={hits.query || search.trim()}
          conversations={hits.conversations}
          deals={hits.deals}
          activeIndex={menu.activeIndex}
          onActiveIndexChange={menu.setActiveIndex}
          onPickConversation={pickConversation}
          onPickDeal={pickDeal}
        />
      )}
      {activeCount > 0 && (
        <InboxActiveFilterChips
          filters={filters}
          onChange={onChangeFilters}
        />
      )}
      <InboxFilterButton
        value={filters}
        onChange={onChangeFilters}
        open={open}
        onOpenChange={setOpen}
        hideTrigger
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Chips visuais dos filtros ativos do Inbox.
//
// Paridade com `FilterChips` do Kanban: cada chip é clicável e remove
// APENAS o critério dele; um botão "Limpar todos" limpa tudo. Os labels
// resolvidos usam as MESMAS queries do modal (users/tags/channels/
// stages/sources) — carregadas quando o inbox monta, com `staleTime`
// generoso pra não bater no backend a cada re-render.
// ─────────────────────────────────────────────────────────────
function InboxActiveFilterChips({
  filters,
  onChange,
}: {
  filters: InboxFilters;
  onChange: (next: InboxFilters) => void;
}) {
  const hasOwnerish =
    (filters.ownerIds?.length ?? 0) > 0 || Boolean(filters.ownerId);
  const hasTags = (filters.tagIds?.length ?? 0) > 0;
  const hasChannel = hasChannelFilter(filters);
  const hasStages =
    (filters.stageIds?.length ?? 0) > 0 || Boolean(filters.stageId);
  const hasSources = (filters.sources?.length ?? 0) > 0;

  const { data: users = [] } = useTeamUsers(hasOwnerish);
  const { data: tags = [] } = useQuery({
    queryKey: ["tags", "filter-chips"],
    queryFn: listTags,
    enabled: hasTags,
    staleTime: 60_000,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["channels", "inbox-filter"],
    queryFn: listInboxFilterChannels,
    enabled: hasChannel,
    staleTime: 60_000,
  });
  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines", "filter-chips"],
    queryFn: listPipelines,
    enabled: hasStages,
    staleTime: 5 * 60_000,
  });
  const defaultPipelineId =
    pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? null;
  const { data: stages = [] } = useQuery({
    queryKey: ["pipeline-board", "filter-chips", defaultPipelineId],
    queryFn: () => getPipelineBoard(defaultPipelineId as string),
    enabled: hasStages && Boolean(defaultPipelineId),
    staleTime: 5 * 60_000,
  });

  const chips: { label: string; onRemove: () => void }[] = [];

  // Responsável
  if (filters.withoutOwner) {
    chips.push({
      label: "Sem responsável",
      onRemove: () =>
        onChange({ ...filters, withoutOwner: undefined, ownerIds: undefined, ownerId: undefined }),
    });
  } else if (hasOwnerish) {
    const ids = filters.ownerIds ?? (filters.ownerId ? [filters.ownerId] : []);
    const names = ids
      .map((id) => users.find((u) => u.id === id)?.name ?? id.slice(0, 6))
      .join(", ");
    chips.push({
      label: `Responsável: ${names || "—"}`,
      onRemove: () =>
        onChange({ ...filters, ownerIds: undefined, ownerId: undefined }),
    });
  }

  // Canal
  if (hasChannel) {
    const ids = selectedChannelIds(filters);
    const names = ids
      .map((id) => {
        const instance = channels.find((c) => c.id === id);
        if (instance) return instance.name;
        return CHANNEL_TYPE_LABELS[id.toLowerCase()] ?? id;
      })
      .join(", ");
    chips.push({
      label: `Canal: ${names || "—"}`,
      onRemove: () =>
        onChange({ ...filters, channel: undefined, channelIds: undefined }),
    });
  }

  // Etapa — `getPipelineBoard` já devolve `BoardStage[]` flat (id + name).
  if (hasStages) {
    const ids = filters.stageIds ?? (filters.stageId ? [filters.stageId] : []);
    const names = ids
      .map((id) => stages.find((s) => s.id === id)?.name ?? id.slice(0, 6))
      .join(", ");
    chips.push({
      label: `Etapas: ${names || "—"}`,
      onRemove: () =>
        onChange({ ...filters, stageIds: undefined, stageId: undefined }),
    });
  }

  // Tags
  if (hasTags) {
    const names = (filters.tagIds ?? [])
      .map((id) => tags.find((t) => t.id === id)?.name ?? id.slice(0, 6))
      .join(", ");
    chips.push({
      label: `Tags: ${names}`,
      onRemove: () => onChange({ ...filters, tagIds: undefined }),
    });
  }

  // Origens (Contact.source) — `useContactSources` retorna `string[]`;
  // o próprio valor já é o rótulo (mesmo padrão do modal).
  if (hasSources) {
    const names = (filters.sources ?? [])
      .map((src) => (src === SOURCE_NONE ? "Sem origem" : src))
      .join(", ");
    chips.push({
      label: `Origem: ${names}`,
      onRemove: () => onChange({ ...filters, sources: undefined }),
    });
  }

  // Sessão / janela Meta
  if (filters.sessionExpiresWithinHours != null) {
    chips.push({
      label: `Sessão expira em: ${filters.sessionExpiresWithinHours}h`,
      onRemove: () =>
        onChange({ ...filters, sessionExpiresWithinHours: undefined }),
    });
  }
  if (filters.windowState) {
    const label = filters.windowState === "open" ? "aberta" : "encerrada";
    chips.push({
      label: `Sessão: ${label}`,
      onRemove: () => onChange({ ...filters, windowState: undefined }),
    });
  }
  if (filters.lastMessageDirection) {
    const label =
      filters.lastMessageDirection === "in" ? "recebida" : "enviada";
    chips.push({
      label: `Última msg: ${label}`,
      onRemove: () =>
        onChange({ ...filters, lastMessageDirection: undefined }),
    });
  }

  if (filters.painelException) {
    const labels = {
      no_reply: "Sem resposta > 1h comercial",
      open_24h: "Abertas > 24h",
      unassigned: "Sem atendente",
      send_failure: "Falha de envio",
    } as const;
    chips.push({
      label: labels[filters.painelException],
      onRemove: () => onChange({ ...filters, painelException: undefined }),
    });
  }

  // Ordenação (só aparece quando não é o default)
  if (sortIdFromFilters(filters) !== DEFAULT_SORT_ID) {
    const sortLabel =
      SORT_OPTIONS.find((o) => o.id === sortIdFromFilters(filters))?.label ??
      "personalizada";
    chips.push({
      label: `Ordem: ${sortLabel}`,
      onRemove: () =>
        onChange({ ...filters, sortBy: undefined, sortOrder: undefined }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-0.5">
      <span className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--brand-primary)]">
        Filtros ativos
      </span>
      {chips.map((chip, idx) => (
        <TooltipGlass
          key={`${chip.label}-${idx}`}
          label="Remover filtro"
          side="top"
        >
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
      <button
        type="button"
        onClick={() => onChange({})}
        className="font-display text-[11px] font-semibold text-[var(--text-muted)] underline-offset-2 hover:text-[var(--brand-primary)] hover:underline"
      >
        Limpar todos
      </button>
    </div>
  );
}

export function InboxFilterButton({
  value,
  onChange,
  variant = "standalone",
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: InboxFilterButtonProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  const [draft, setDraft] = React.useState<InboxFilters>(() =>
    normalizeInboxFilters(value),
  );
  const [middleTab, setMiddleTab] = React.useState<MiddleTab>("conversa");
  const [tagQuery, setTagQuery] = React.useState("");
  const isDesktop = useIsDesktop();

  React.useEffect(() => {
    if (!open) return;
    setDraft(normalizeInboxFilters(value));
    setMiddleTab("conversa");
    setTagQuery("");
  }, [open, value]);

  const { data: users = [] } = useTeamUsers(open);
  const { data: tags = [] } = useQuery({
    queryKey: ["tags", "filter-panel"],
    queryFn: listTags,
    enabled: open,
    staleTime: 60_000,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["channels", "inbox-filter"],
    queryFn: listInboxFilterChannels,
    enabled: open,
    staleTime: 60_000,
  });
  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines", "filter-panel"],
    queryFn: listPipelines,
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const defaultPipelineId =
    pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? null;
  const { data: stages = [] } = useQuery({
    queryKey: ["pipeline-board", "filter-panel", defaultPipelineId],
    queryFn: () => getPipelineBoard(defaultPipelineId as string),
    enabled: open && Boolean(defaultPipelineId),
    staleTime: 5 * 60_000,
  });
  const { data: contactSources = [] } = useContactSources(open);
  const { data: myPerms } = useMyPermissions();

  const channelOptions = React.useMemo(() => {
    const grantIds = channelGrantIds(myPerms?.channelGrants);
    if (grantIds.length === 0) return channels;
    const allowed = new Set(grantIds);
    const filtered = channels.filter((c) => {
      if (c.deleted) return true;
      if (allowed.has(c.id)) return true;
      const type = (c.type ?? "").toLowerCase();
      return grantIds.some(
        (g) => g === type || g === c.type || g.startsWith(`${type}:`),
      );
    });
    return filtered.length > 0 ? filtered : channels;
  }, [channels, myPerms?.channelGrants]);

  const selectedTagIds = draft.tagIds ?? [];
  const selectedSources = draft.sources ?? [];
  const selectedOwnerIds = draft.ownerIds ?? [];
  const selectedStageIds = draft.stageIds ?? [];
  const activeCount = countActive(value);
  const draftCount = countActive(draft);
  const ownerActive =
    selectedOwnerIds.length > 0 || Boolean(draft.withoutOwner);

  const filteredTags = React.useMemo(() => {
    const needle = tagQuery.trim().toLowerCase();
    if (!needle) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(needle));
  }, [tags, tagQuery]);

  function toggleTag(id: string) {
    setDraft((d) => {
      const current = d.tagIds ?? [];
      const next = current.includes(id)
        ? current.filter((t) => t !== id)
        : [...current, id];
      return { ...d, tagIds: next.length > 0 ? next : undefined };
    });
  }

  function toggleSource(source: string) {
    setDraft((d) => {
      const current = d.sources ?? [];
      const next = current.includes(source)
        ? current.filter((s) => s !== source)
        : [...current, source];
      return { ...d, sources: next.length > 0 ? next : undefined };
    });
  }

  function apply() {
    onChange(normalizeInboxFilters(draft));
    setOpen(false);
  }

  function clear() {
    setDraft({});
  }

  const sortColumn = (
    <div className="space-y-1">
      <span className="px-2 font-display text-[10px] font-bold uppercase tracking-[0.09em] text-[var(--text-muted)]">
        Ordenar
      </span>
      {SORT_OPTIONS.map((opt) => {
        const selected = sortIdFromFilters(draft) === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                sortBy: opt.sortBy,
                sortOrder: opt.sortOrder,
              }))
            }
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left font-display text-[11.5px] font-semibold transition-colors",
              selected
                ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
            )}
          >
            <span>{opt.label}</span>
            {selected && <IconCheck size={13} stroke={2.6} className="shrink-0" />}
          </button>
        );
      })}
      <div className="my-3 border-t border-[var(--glass-border-subtle)]" />
      <ConversationSegmentation draft={draft} setDraft={setDraft} />
    </div>
  );

  const conversaContent = (
    <div className="space-y-3">
      <FieldCard
        label="Responsável"
        active={ownerActive}
        onClear={() =>
          setDraft((d) => ({
            ...d,
            ownerId: undefined,
            ownerIds: undefined,
            withoutOwner: undefined,
          }))
        }
      >
        <MultiSelectDropdown
          placeholder="Selecionar responsáveis…"
          searchable={users.length > 6}
          searchPlaceholder="Buscar usuário…"
          selected={
            draft.withoutOwner
              ? ["__none__", ...selectedOwnerIds]
              : selectedOwnerIds
          }
          options={[
            {
              value: "__none__",
              searchText: "Sem responsável",
              label: (
                <span className="inline-flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--glass-bg-strong)] text-[var(--text-muted)]">
                    <IconUserOff size={13} stroke={2.2} />
                  </span>
                  Sem responsável
                </span>
              ),
            },
            ...users.map((u) => {
              const name = u.name || u.email;
              return {
                value: u.id,
                searchText: name,
                label: (
                  <span className="inline-flex items-center gap-2">
                    <UserAvatar
                      name={name}
                      imageUrl={u.avatarUrl ?? null}
                      size={24}
                    />
                    {name}
                  </span>
                ),
              };
            }),
          ]}
          onToggle={(value) => {
            if (value === "__none__") {
              setDraft((d) => ({
                ...d,
                withoutOwner: d.withoutOwner ? undefined : true,
                ownerId: undefined,
                ownerIds: undefined,
              }));
              return;
            }
            setDraft((d) => {
              const current = d.ownerIds ?? [];
              const next = current.includes(value)
                ? current.filter((id) => id !== value)
                : [...current, value];
              return {
                ...d,
                withoutOwner: undefined,
                ownerId: undefined,
                ownerIds: next.length ? next : undefined,
              };
            });
          }}
        />
      </FieldCard>

      <FieldCard
        label="Canal"
        active={hasChannelFilter(draft)}
        onClear={() =>
          setDraft((d) => ({ ...d, channel: undefined, channelIds: undefined }))
        }
      >
        <DropdownGlass
          placeholder="Selecionar canal…"
          searchable={channelOptions.length > 6}
          searchPlaceholder="Buscar canal…"
          options={channelOptions.map((ch) => {
            const badge = channelStatusBadge(ch);
            const phone = formatConnectionPhone(ch.phoneNumber);
            return {
              value: ch.id,
              searchText: [ch.name, phone, ch.type, badge]
                .filter(Boolean)
                .join(" "),
              description: phone ?? undefined,
              label: (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate">{ch.name}</span>
                  {badge && (
                    <span
                      className={
                        badge === "Excluído"
                          ? "shrink-0 rounded-full bg-[var(--color-danger)]/10 px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide text-[var(--color-danger)]"
                          : "shrink-0 rounded-full bg-[var(--glass-bg-strong)] px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]"
                      }
                    >
                      {badge}
                    </span>
                  )}
                </span>
              ),
            };
          })}
          value={selectedChannelIds(draft)[0]}
          onValueChange={(v) =>
            setDraft((d) => {
              const current = selectedChannelIds(d)[0];
              if (current === v) {
                return { ...d, channel: undefined, channelIds: undefined };
              }
              return { ...d, channel: undefined, channelIds: [v] };
            })
          }
        />
      </FieldCard>
    </div>
  );

  const negocioContent = (
    <div className="grid grid-cols-1 items-stretch gap-3 [&>*]:h-full">
      <FieldCard
        label="Negócio na etapa"
        active={selectedStageIds.length > 0}
        onClear={() =>
          setDraft((d) => ({ ...d, stageId: undefined, stageIds: undefined }))
        }
      >
        <MultiSelectDropdown
          placeholder="Selecionar etapas…"
          emptyLabel="Nenhuma etapa."
          searchable={stages.length > 8}
          searchPlaceholder="Buscar etapa…"
          selected={selectedStageIds}
          options={stages.map((s) => ({
            value: s.id,
            searchText: s.name,
            label: (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: s.color || "#94a3b8" }}
                />
                {s.name}
              </span>
            ),
          }))}
          onToggle={(id) =>
            setDraft((d) => {
              const current = d.stageIds ?? [];
              const next = current.includes(id)
                ? current.filter((x) => x !== id)
                : [...current, id];
              return {
                ...d,
                stageId: undefined,
                stageIds: next.length ? next : undefined,
              };
            })
          }
        />
      </FieldCard>

      <FieldCard
        label="Origem"
        active={selectedSources.length > 0}
        onClear={() => setDraft((d) => ({ ...d, sources: undefined }))}
      >
        <MultiSelectDropdown
          placeholder="Selecionar origem…"
          emptyLabel="Nenhuma origem cadastrada."
          searchable={contactSources.length > 6}
          searchPlaceholder="Buscar origem…"
          selected={selectedSources}
          options={[
            {
              value: SOURCE_NONE,
              label: "Sem origem",
              searchText: "Sem origem",
            },
            ...contactSources.map((source) => ({
              value: source,
              label: source,
              searchText: source,
            })),
          ]}
          onToggle={toggleSource}
        />
      </FieldCard>
    </div>
  );

  const tagsColumn = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-[1] space-y-2 bg-[var(--glass-bg-modal)] pb-2">
        <div className="flex items-center justify-between px-0.5">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.09em] text-[var(--text-muted)]">
            Tags
          </span>
          <span className="font-display text-[10.5px] font-bold text-[var(--brand-primary)]">
            {selectedTagIds.length} selecionadas
          </span>
        </div>
        <input
          type="search"
          value={tagQuery}
          onChange={(e) => setTagQuery(e.target.value)}
          placeholder="Localizar tags…"
          className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 font-body text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)]/40 focus:ring-2 focus:ring-[var(--brand-primary)]/20"
        />
        {selectedTagIds.length > 0 && (
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, tagIds: undefined }))}
            className="font-display text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--brand-primary)]"
          >
            Limpar tags
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-wrap content-start gap-1.5 pt-1">
          {filteredTags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);
            return (
              <TagChip
                key={tag.id}
                name={tag.name}
                color={tag.color}
                selected={selected}
                onClick={() => toggleTag(tag.id)}
              />
            );
          })}
          {filteredTags.length === 0 && (
            <p className="w-full py-6 text-center font-body text-[12px] text-[var(--text-muted)]">
              {tagQuery.trim() ? "Nenhuma tag encontrada." : "Nenhuma tag cadastrada."}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const middleContent = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-[2] border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-modal)] px-4 pb-3 pt-4">
        <div
          role="tablist"
          aria-label="Categorias de filtros"
          className="flex items-center gap-1 overflow-x-auto rounded-[var(--radius-lg)] bg-[var(--glass-bg-strong)] p-1 [scrollbar-width:none]"
        >
          {MIDDLE_TABS.map((tab) => {
            const active = middleTab === tab.id;
            const count = middleTabCount(tab.id, draft);
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMiddleTab(tab.id)}
                className={cn(
                  "inline-flex min-w-max flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-2 font-display text-[11px] font-bold transition-colors",
                  active
                    ? "bg-[var(--glass-bg-modal)] text-[var(--text-primary)] shadow-[var(--glass-shadow-sm)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                      active
                        ? "bg-[var(--brand-primary)] text-white"
                        : "bg-[var(--glass-border)] text-[var(--text-secondary)]",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 [scrollbar-width:thin]">
        <div className="mb-4">
          <h3 className="font-display text-[15px] font-bold text-[var(--text-primary)]">
            {MIDDLE_TABS.find((t) => t.id === middleTab)?.label}
          </h3>
          <p className="mt-0.5 font-body text-[11.5px] text-[var(--text-muted)]">
            {MIDDLE_TABS.find((t) => t.id === middleTab)?.hint}
          </p>
        </div>
        {middleTab === "conversa" ? conversaContent : negocioContent}
      </div>
    </div>
  );

  return (
    <>
      {!hideTrigger && (
        <TooltipGlass label="Filtrar conversas" side="bottom">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={
              activeCount > 0
                ? `Filtros (${activeCount} ativos)`
                : "Filtrar conversas"
            }
            className={cn(
              variant === "integrated"
                ? "absolute right-1.5 top-1/2 flex h-7 -translate-y-1/2 items-center justify-center gap-0.5 rounded-full transition-colors"
                : "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border transition-colors",
              variant === "integrated" && (activeCount > 0 ? "min-w-7 px-1.5" : "w-7"),
              variant === "integrated"
                ? activeCount > 0 || open
                  ? "bg-[var(--brand-primary)] text-white shadow-[0_4px_12px_rgba(91,111,245,0.35)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)]"
                : activeCount > 0 || open
                  ? "border-[var(--brand-primary)]/40 bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] hover:text-[var(--brand-primary)]",
            )}
          >
            <IconFilter size={variant === "integrated" ? 15 : 17} stroke={2} />
            {activeCount > 0 && (
              <span
                className={cn(
                  "font-display font-bold leading-none tabular-nums",
                  variant === "integrated"
                    ? "text-[10px]"
                    : "absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 text-[9px] text-white",
                )}
              >
                {activeCount}
              </span>
            )}
          </button>
        </TooltipGlass>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <InboxFilterModalShell
            wide={isDesktop}
            onClose={() => setOpen(false)}
            draftCount={draftCount}
            onClear={clear}
            clearDisabled={draftCount === 0 && activeCount === 0}
            onApply={apply}
          >
            {isDesktop ? (
              <div
                className="grid h-full min-h-0"
                style={{
                  gridTemplateColumns: "235px minmax(0,1.2fr) minmax(220px,.85fr)",
                }}
              >
                <aside className="min-h-0 overflow-y-auto border-r border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)] p-4 [scrollbar-width:none]">
                  {sortColumn}
                </aside>
                <main className="min-h-0 overflow-hidden bg-[var(--glass-bg-base)]">
                  {middleContent}
                </main>
                <aside className="min-h-0 overflow-hidden border-l border-[var(--glass-border-subtle)] p-4">
                  {tagsColumn}
                </aside>
              </div>
            ) : (
              <div className="h-full space-y-4 overflow-y-auto p-4">
                {sortColumn}
                <div className="border-t border-[var(--glass-border-subtle)] pt-3">
                  {middleContent}
                </div>
                <div className="min-h-[220px] rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] p-3">
                  {tagsColumn}
                </div>
              </div>
            )}
          </InboxFilterModalShell>,
          document.body,
        )}
    </>
  );
}
