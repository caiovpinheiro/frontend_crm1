"use client";

import * as React from "react";

import type { BoardDeal } from "@/components/pipeline/kanban-types";
import type { BoardStage } from "@/components/pipeline/kanban-board";
import {
  cn,
  dealNumericValue,
  formatDate,
  pipelineDealMatchesSearch,
  resolveContactAvatarDisplayUrl,
} from "@/lib/utils";
import { ds } from "@/lib/design-system";
import { ChatAvatar, type ChatAvatarChannel } from "@/components/inbox/chat-avatar";
import { LIST_CARD_HEAD_CLASS, LIST_CARD_ROW_CLASS, LIST_CARD_STACK_CLASS, SortableHeader } from "@/components/crm/sortable-header";

function normalizeChannel(raw: string | null | undefined): ChatAvatarChannel {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "whatsapp" || v === "instagram" || v === "email" || v === "meta") {
    return v as ChatAvatarChannel;
  }
  return null;
}

type SortField = "title" | "contact" | "value" | "stage" | "owner" | "createdAt" | "status";
type SortDir = "asc" | "desc";

type FlatDeal = BoardDeal & { stageName: string; stageColor: string; stagePosition: number };

type PipelineListViewProps = {
  stages: BoardStage[];
  selectedDeals: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onDealClick: (dealId: string) => void;
  searchQuery?: string;
  filterAgent?: string;
  filterStage?: string;
  filterMsg?: "all" | "unread" | "no-reply";
  filterOverdue?: boolean;
  filter?: "mine" | "urgent" | "vip" | null;
  currentUserId?: string;
};

function flattenDeals(stages: BoardStage[]): FlatDeal[] {
  const result: FlatDeal[] = [];
  for (const s of stages) {
    for (const d of s.deals) {
      result.push({ ...d, stageName: s.name, stageColor: s.color, stagePosition: s.position });
    }
  }
  return result;
}

function applyFilters(
  deals: FlatDeal[],
  opts: Pick<PipelineListViewProps, "searchQuery" | "filterAgent" | "filterStage" | "filterMsg" | "filterOverdue" | "filter" | "currentUserId">,
): FlatDeal[] {
  const q = (opts.searchQuery ?? "").trim().toLowerCase();
  return deals.filter((d) => {
    if (opts.filter === "mine" && d.owner?.id !== opts.currentUserId) return false;
    if (opts.filter === "urgent" && !(d.priority === "HIGH" || d.isRotting)) return false;
    if (opts.filter === "vip" && !d.tags?.some((t) => t.name.toLowerCase() === "vip")) return false;

    if (opts.filterStage && opts.filterStage !== "all" && d.stageName !== opts.filterStage) {
      const stageMatch = d.stageName === opts.filterStage;
      if (!stageMatch) return false;
    }
    if (opts.filterAgent && opts.filterAgent !== "all") {
      if (opts.filterAgent === "none" && d.owner) return false;
      if (opts.filterAgent !== "none" && d.owner?.id !== opts.filterAgent) return false;
    }
    if (opts.filterMsg === "unread" && (d.unreadCount ?? 0) === 0) return false;
    // FIX: padroniza com `kanban-board.tsx` que usa `"in"` (valor real
    // armazenado em `Message.direction` no banco). Antes estava
    // comparando com `"INBOUND"`, ent\u00e3o este filtro nunca matchava
    // nada na Lista \u2014 inconsist\u00eancia silenciosa entre as views.
    if (opts.filterMsg === "no-reply" && d.lastMessage?.direction !== "in") return false;
    if (opts.filterOverdue && !d.hasOverdueActivity) return false;

    if (q) {
      const ok = pipelineDealMatchesSearch(opts.searchQuery ?? "", {
        title: d.title,
        contactName: d.contact?.name,
        contactEmail: d.contact?.email,
        contactPhone: d.contact?.phone,
        ownerName: d.owner?.name,
        productName: d.productName,
        tagNames: d.tags?.map((t) => t.name),
        dealNumber: d.number,
      });
      if (!ok) return false;
    }
    return true;
  });
}

export function PipelineListView({
  stages,
  selectedDeals,
  onSelectionChange,
  onDealClick,
  searchQuery,
  filterAgent,
  filterStage,
  filterMsg,
  filterOverdue,
  filter,
  currentUserId,
}: PipelineListViewProps) {
  const [sortField, setSortField] = React.useState<SortField>("createdAt");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const allDeals = React.useMemo(() => flattenDeals(stages), [stages]);

  const filtered = React.useMemo(
    () => applyFilters(allDeals, { searchQuery, filterAgent, filterStage, filterMsg, filterOverdue, filter, currentUserId }),
    [allDeals, searchQuery, filterAgent, filterStage, filterMsg, filterOverdue, filter, currentUserId],
  );

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = (a.title ?? "").localeCompare(b.title ?? "");
          break;
        case "contact":
          cmp = (a.contact?.name ?? "").localeCompare(b.contact?.name ?? "");
          break;
        case "value":
          cmp = dealNumericValue(a.value) - dealNumericValue(b.value);
          break;
        case "stage":
          cmp = a.stagePosition - b.stagePosition;
          break;
        case "owner":
          cmp = (a.owner?.name ?? "").localeCompare(b.owner?.name ?? "");
          break;
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return cmp * dir;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const allSelected = sorted.length > 0 && sorted.every((d) => selectedDeals.has(d.id));
  const someSelected = sorted.some((d) => selectedDeals.has(d.id));

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(sorted.map((d) => d.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedDeals);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const columnClass =
    "grid grid-cols-[auto_1fr] items-center gap-4 lg:grid-cols-[36px_minmax(200px,1.4fr)_minmax(180px,1.3fr)_110px_minmax(150px,1fr)_150px_120px_110px]";

  const formatCurrency = (val: number | string) => {
    const n = dealNumericValue(val);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  // Status como tokens do design-system: chips soft idênticos em
  // forma/spacing/tipografia ao chat e ao card do sales-hub.
  const statusLabel = (s: string) => {
    if (s === "WON") return { text: "Ganho", cls: ds.chip.success };
    if (s === "LOST") return { text: "Perdido", cls: ds.chip.danger };
    return { text: "Aberto", cls: ds.chip.soft };
  };

  return (
    <div className={cn("min-w-0 overflow-x-auto", LIST_CARD_STACK_CLASS)}>
      <div className={cn(columnClass, LIST_CARD_HEAD_CLASS)}>
        <span className="flex items-center">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
            onChange={toggleAll}
            className="size-4 rounded border-border"
            aria-label="Selecionar todos"
          />
        </span>
        {([
          ["title", "Negócio"],
          ["contact", "Contato"],
          ["value", "Valor"],
          ["stage", "Etapa"],
          ["owner", "Responsável"],
          ["createdAt", "Criado em"],
          ["status", "Status"],
        ] as [SortField, string][]).map(([field, label]) => (
          <SortableHeader
            key={field}
            label={label}
            sort={sortField === field ? sortDir : null}
            onSort={() => handleSort(field)}
          />
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="px-5 py-16 text-center text-sm text-muted-foreground">
          Nenhum negócio encontrado
        </p>
      ) : (
        sorted.map((deal) => {
          const sl = statusLabel(deal.status);
          const owner = deal.owner?.name;
          return (
            <div
              key={deal.id}
              role="button"
              tabIndex={0}
              onClick={() => onDealClick(deal.number?.toString() ?? deal.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDealClick(deal.number?.toString() ?? deal.id);
                }
              }}
              className={cn(
                columnClass,
                LIST_CARD_ROW_CLASS,
                "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                selectedDeals.has(deal.id) && "border-primary bg-primary/10",
              )}
            >
              <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedDeals.has(deal.id)}
                  onChange={() => toggleOne(deal.id)}
                  className="size-4 rounded border-border"
                  aria-label={`Selecionar ${deal.title || "negócio"}`}
                />
              </span>
              <p className="truncate font-semibold text-foreground">
                {deal.title || "Sem título"}
              </p>
              {deal.contact?.name ? (
                <div className="flex min-w-0 items-center gap-2.5">
                  <ChatAvatar
                    user={{
                      id: deal.contact.id,
                      name: deal.contact.name,
                      imageUrl: resolveContactAvatarDisplayUrl(
                        deal.contact.avatarUrl ?? null,
                      ),
                    }}
                    phone={deal.contact.phone ?? undefined}
                    channel={normalizeChannel(deal.channel)}
                    size={28}
                  />
                  <span className="truncate text-sm text-foreground">
                    {deal.contact.name}
                  </span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
              <span className="text-sm font-medium tabular-nums text-foreground">
                {formatCurrency(deal.value)}
              </span>
              <span className={ds.chip.softer}>
                <span
                  className={ds.chip.dot}
                  style={{ backgroundColor: deal.stageColor }}
                />
                {deal.stageName}
              </span>
              {owner ? (
                <div className="flex min-w-0 items-center gap-2">
                  <ChatAvatar
                    user={{
                      id: deal.owner?.id,
                      name: owner,
                      imageUrl: deal.owner?.avatarUrl ?? null,
                    }}
                    size={24}
                    channel={null}
                    hideCartoon
                  />
                  <span className="min-w-0 truncate text-sm text-foreground">{owner}</span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
              <span className="text-sm tabular-nums text-muted-foreground">
                {formatDate(deal.createdAt)}
              </span>
              <span className={sl.cls}>{sl.text}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
