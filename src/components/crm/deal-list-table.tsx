"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { ChatAvatar } from "@/components/inbox/chat-avatar";
import { AVATAR_SIZE } from "@/lib/avatar";

import { BadgeGlass } from "./badge-glass";
import { CheckboxGlass } from "./checkbox-glass";
import { ColumnResizer, useColumnWidths } from "./column-resizer";
import { ListHScroll } from "./list-hscroll";
import { LIST_PAGE_STACK_CLASS } from "./pagination-glass";
import { SortableHeader, type SortDir, LIST_CARD_ROW_CLASS, LIST_CARD_STACK_CLASS, listTableHeadRowClass } from "./sortable-header";
import { StageDot } from "./stage-dot";

export type DealListStatus = "OPEN" | "WON" | "LOST";
export type DealListTab = "abertos" | "ganhos" | "perdidos" | "todos";

export type DealListColumnKey =
  | "dealTitle"
  | "contactName"
  | "value"
  | "stageName"
  | "ownerName"
  | "createdAt"
  | "status";

export interface DealListRow {
  id: string;
  dealTitle: string;
  contactName: string;
  contactInitials: string;
  avatarColor: string;
  channel?: "whatsapp" | null;
  value: string;
  stageName: string;
  stageColor: string;
  ownerName?: string | null;
  createdAt: string;
  status: DealListStatus;
}

export const DEAL_LIST_COLUMNS: {
  key: DealListColumnKey;
  label: string;
  fr: string;
  /** Largura mínima — garante overflow horizontal quando cabem muitas colunas. */
  minPx: number;
  locked?: boolean;
}[] = [
  { key: "dealTitle", label: "Negócio", fr: "1.6fr", minPx: 200, locked: true },
  { key: "contactName", label: "Contato", fr: "1.6fr", minPx: 180 },
  { key: "value", label: "Valor", fr: "0.9fr", minPx: 110 },
  { key: "stageName", label: "Etapa", fr: "1.2fr", minPx: 150 },
  { key: "ownerName", label: "Responsável", fr: "1.1fr", minPx: 150 },
  { key: "createdAt", label: "Criado em", fr: "1fr", minPx: 120 },
  { key: "status", label: "Status", fr: "0.9fr", minPx: 110 },
];

export const DEFAULT_DEAL_LIST_COLUMN_KEYS: DealListColumnKey[] =
  DEAL_LIST_COLUMNS.map((c) => c.key);

const WIDTHS_STORAGE_KEY = "v2:deals:col-widths:v1";
const COLUMN_WIDTH_DEFAULTS: Record<string, number> = {
  dealTitle: 240,
  contactName: 200,
  value: 120,
  stageName: 170,
  ownerName: 160,
  createdAt: 130,
  status: 120,
};

type SortKey = DealListColumnKey;

interface DealListTableProps {
  deals: DealListRow[];
  statusTab?: DealListTab;
  visibleColumns?: DealListColumnKey[];
  onRowClick?: (id: string) => void;
  className?: string;
  /** Seleção controlada (ações em massa na Lista). */
  selectedIds?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
}

const statusToTab: Record<DealListStatus, Exclude<DealListTab, "todos">> = {
  OPEN: "abertos",
  WON: "ganhos",
  LOST: "perdidos",
};

const statusBadge: Record<
  DealListStatus,
  { variant: "enterprise" | "success" | "lead"; label: string }
> = {
  OPEN: { variant: "enterprise", label: "Aberto" },
  WON: { variant: "success", label: "Ganho" },
  LOST: { variant: "lead", label: "Perdido" },
};

function resolveColumns(keys?: DealListColumnKey[]) {
  const ordered = keys?.length
    ? DEAL_LIST_COLUMNS.filter((c) => keys.includes(c.key) || c.locked)
    : DEAL_LIST_COLUMNS;
  // garante Negócio sempre presente e na ordem canônica
  const seen = new Set(ordered.map((c) => c.key));
  if (!seen.has("dealTitle")) {
    return [DEAL_LIST_COLUMNS[0], ...ordered];
  }
  return ordered;
}

export function DealListTable({
  deals,
  statusTab = "abertos",
  visibleColumns,
  onRowClick,
  className,
  selectedIds,
  onSelectionChange,
}: DealListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const selected = selectedIds ?? internalSelected;
  const setSelected = (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    const next =
      typeof updater === "function" ? updater(selectedIds ?? internalSelected) : updater;
    if (onSelectionChange) onSelectionChange(next);
    else setInternalSelected(next);
  };
  const { getWidth, setWidth } = useColumnWidths(WIDTHS_STORAGE_KEY, COLUMN_WIDTH_DEFAULTS);

  const columns = useMemo(() => resolveColumns(visibleColumns), [visibleColumns]);
  const gridTemplate = [
    "42px",
    ...columns.map((c) => `${getWidth(c.key, c.minPx)}px`),
  ].join(" ");

  const filtered = useMemo(() => {
    const base =
      statusTab === "todos"
        ? deals
        : deals.filter((d) => statusToTab[d.status] === statusTab);
    const sorted = [...base].sort((a, b) => {
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return sorted;
  }, [deals, statusTab, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortFor = (key: SortKey): SortDir => (sortKey === key ? sortDir : null);

  const allChecked = filtered.length > 0 && filtered.every((d) => selected.has(d.id));
  const someChecked = filtered.some((d) => selected.has(d.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        filtered.forEach((d) => next.delete(d.id));
      } else {
        filtered.forEach((d) => next.add(d.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  function renderCell(d: DealListRow, key: DealListColumnKey) {
    switch (key) {
      case "dealTitle":
        return (
          <div className="min-w-0 leading-tight">
            <span className="block truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
              {d.dealTitle}
            </span>
          </div>
        );
      case "contactName":
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <ChatAvatar
              user={{ id: d.id, name: d.contactName }}
              channel={d.channel ?? null}
              size={AVATAR_SIZE.md}
            />
            <span className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
              {d.contactName}
            </span>
          </div>
        );
      case "value":
        return (
          <span className="truncate font-display text-[13px] font-semibold text-[var(--text-secondary)]">
            {d.value}
          </span>
        );
      case "stageName":
        return (
          <div className="min-w-0">
            <StageDot color={d.stageColor} label={d.stageName} />
          </div>
        );
      case "ownerName":
        return (
          <span className="truncate font-display text-[13px] text-[var(--text-muted)]">
            {d.ownerName ?? "—"}
          </span>
        );
      case "createdAt":
        return (
          <span className="truncate font-display text-[13px] text-[var(--text-muted)]">
            {d.createdAt}
          </span>
        );
      case "status": {
        const badge = statusBadge[d.status];
        return (
          <div>
            <BadgeGlass variant={badge.variant}>{badge.label}</BadgeGlass>
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <ListHScroll className={className} scrollerClassName="pb-1">
      {/* w-max + minmax nas colunas: overflow X real (igual Contatos/Empresas). */}
      <div className={cn("w-max min-w-full", LIST_CARD_STACK_CLASS, LIST_PAGE_STACK_CLASS)}>
        <div
          className={listTableHeadRowClass("hidden gap-3 lg:grid")}
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <span>
            <CheckboxGlass
              checked={allChecked}
              indeterminate={!allChecked && someChecked}
              onChange={toggleAll}
              aria-label="Selecionar todos"
            />
          </span>
          {columns.map((col) => {
            const w = getWidth(col.key, col.minPx);
            return (
              <div key={col.key} className="relative min-w-0 overflow-x-hidden overflow-y-visible pr-1">
                <SortableHeader
                  label={col.label}
                  sort={sortFor(col.key)}
                  onSort={() => handleSort(col.key)}
                />
                <ColumnResizer
                  value={w}
                  onChange={(px) => setWidth(col.key, px)}
                  min={col.minPx}
                  max={480}
                />
              </div>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <p className="py-10 text-center font-body text-[13px] text-[var(--text-muted)]">
            Nenhum negócio neste status nesta página.
          </p>
        ) : (
          filtered.map((d) => {
            const isChecked = selected.has(d.id);
            return (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => onRowClick?.(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick?.(d.id);
                  }
                }}
                style={{ gridTemplateColumns: gridTemplate }}
                className={cn(
                  "group grid cursor-pointer items-center gap-3",
                  LIST_CARD_ROW_CLASS,
                  isChecked && "border-primary bg-primary/10",
                )}
              >
                <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <CheckboxGlass
                    checked={isChecked}
                    onChange={() => toggleOne(d.id)}
                    aria-label={`Selecionar ${d.dealTitle}`}
                  />
                </span>
                {columns.map((col) => (
                  <div key={col.key} className="min-w-0">
                    {renderCell(d, col.key)}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </ListHScroll>
  );
}
