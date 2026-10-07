"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { DataView, DataRow } from "@/components/automations/data-view";
import type { CardsTableView } from "@/components/automations/view-toggle";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "@/components/inbox/chat-avatar";
import { AVATAR_SIZE } from "@/lib/avatar";

import { BadgeGlass } from "./badge-glass";
import { CheckboxGlass } from "./checkbox-glass";
import { ColumnResizer, useColumnWidths } from "./column-resizer";
import { ListHScroll } from "./list-hscroll";
import { LIST_PAGE_STACK_CLASS } from "./pagination-glass";
import { SortableHeader, type SortDir } from "./sortable-header";
import { StageDot } from "./stage-dot";

export type DealListStatus = "OPEN" | "WON" | "LOST";
export type DealListTab = "abertos" | "ganhos" | "perdidos" | "todos";

export type DealListColumnKey =
  | "dealTitle"
  | "contactName"
  | "value"
  | "stageName"
  | "ownerName"
  | "lastInteractionAt"
  | "createdAt"
  | "status";

export interface DealListRow {
  id: string;
  /** Número sequencial do negócio — vira `?deal=` no link da linha. */
  number?: number | null;
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
  /** ISO da última interação (mensagem ou alteração do negócio). */
  lastInteractionAt?: string | null;
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
  { key: "lastInteractionAt", label: "Última interação", fr: "1.15fr", minPx: 168 },
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
  lastInteractionAt: 176,
  createdAt: 130,
  status: 120,
};

type SortKey = DealListColumnKey;

interface DealListTableProps {
  deals: DealListRow[];
  statusTab?: DealListTab;
  visibleColumns?: DealListColumnKey[];
  className?: string;
  /** Seleção controlada (ações em massa na Lista). */
  selectedIds?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
  view?: CardsTableView;
}

/** "Hoje 12:48", "Ontem 12:48" ou "30/08/2026 12:48". */
function formatLastInteraction(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (dayDiff === 0) return `Hoje ${time}`;
  if (dayDiff === 1) return `Ontem ${time}`;
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  return `${date} ${time}`;
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

/** Mesma URL do clique simples: o kanban abre o negócio em `?deal=`. */
function dealListOpenHref(number: number | null | undefined): string {
  if (typeof number === "number" && Number.isFinite(number)) {
    return `/pipeline?deal=${encodeURIComponent(String(number))}`;
  }
  return "/pipeline";
}

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
  className,
  selectedIds,
  onSelectionChange,
  view = "cards",
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
            <span
              title={d.dealTitle}
              className="block truncate font-display text-[14px] font-bold text-[var(--text-primary)]"
            >
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
            <span
              title={d.contactName}
              className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]"
            >
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
          <span
            title={d.ownerName ?? undefined}
            className="truncate font-display text-[13px] text-[var(--text-muted)]"
          >
            {d.ownerName ?? "—"}
          </span>
        );
      case "lastInteractionAt":
        return (
          <span className="truncate font-display text-[13px] text-[var(--text-muted)]">
            {formatLastInteraction(d.lastInteractionAt)}
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

  const header = (
    <>
      <span>
        <CheckboxGlass
          checked={allChecked}
          indeterminate={!allChecked && someChecked}
          onChange={toggleAll}
          aria-label="Selecionar todos"
          touchTarget
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
    </>
  );

  return (
    <ListHScroll className={className} scrollerClassName="pb-1">
      <DataView
        view={view}
        columnClass="grid items-center gap-3"
        header={header}
        className={cn("w-max min-w-full", LIST_PAGE_STACK_CLASS)}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {filtered.length === 0 ? (
          <p className="py-10 text-center font-body text-[13px] text-[var(--text-muted)]">
            Nenhum negócio neste status nesta página.
          </p>
        ) : (
          filtered.map((d) => {
            const isChecked = selected.has(d.id);
            return (
              <DataRow
                key={d.id}
                className={cn(
                  "group cursor-pointer",
                  isChecked && "border-primary bg-primary/10",
                )}
              >
                {/* Link real: clique simples segue no app; Ctrl/Cmd, Shift e o
                    botão do meio abrem a mesma URL em outra aba. O checkbox
                    fica fora do <a> para a seleção em massa não navegar. */}
                <Link
                  href={dealListOpenHref(d.number)}
                  prefetch={false}
                  aria-label={`Abrir negócio ${d.dealTitle}`}
                  className="z-0 row-start-1 grid min-w-0 items-center gap-3 rounded-[inherit] text-inherit no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  style={{ gridColumn: "1 / -1", gridRow: 1, gridTemplateColumns: gridTemplate }}
                >
                  <span aria-hidden="true" />
                  {columns.map((col) => (
                    <div key={col.key} className="min-w-0">
                      {renderCell(d, col.key)}
                    </div>
                  ))}
                </Link>
                <span
                  className="relative z-10 flex items-center"
                  style={{ gridColumn: 1, gridRow: 1 }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <CheckboxGlass
                    checked={isChecked}
                    onChange={() => toggleOne(d.id)}
                    aria-label={`Selecionar ${d.dealTitle}`}
                    touchTarget
                  />
                </span>
              </DataRow>
            );
          })
        )}
      </DataView>
    </ListHScroll>
  );
}
