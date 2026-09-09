"use client";

import { CheckSquare, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { useMyWorkItems } from "./hooks";
import type { WorkItem } from "./types";

export function MyPendenciesButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const { data } = useMyWorkItems(true);
  const openCount =
    data?.items.reduce((n, item) => n + item.entries.filter((e) => e.status === "open").length, 0) ?? 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      className={cn(
        "flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] font-medium",
        open ? "text-primary" : "text-[var(--orbita-text-secondary)] hover:text-[var(--orbita-text)]",
      )}
    >
      <CheckSquare className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">Minhas pendências</span>
      {openCount > 0 && (
        <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
          {openCount}
        </span>
      )}
    </button>
  );
}

export function MyPendenciesPanel({
  onOpenRoom,
  onClose,
}: {
  onOpenRoom: (roomId: string) => void;
  onClose: () => void;
}) {
  const { data, isLoading } = useMyWorkItems(true);
  const items = (data?.items ?? []).filter((item) => item.entries.some((e) => e.status === "open"));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-[var(--orbita-divider)]">
      <div className="flex items-center justify-between px-4 py-2">
        <p className="text-[12px] font-semibold text-[var(--orbita-text-secondary)]">Pendências</p>
        <button type="button" aria-label="Fechar pendências" onClick={onClose} className="text-muted-foreground">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {isLoading && <p className="px-1 py-3 text-[13px] text-muted-foreground">Carregando…</p>}
        {!isLoading && items.length === 0 && (
          <p className="px-1 py-3 text-[13px] text-muted-foreground">Nada pendente.</p>
        )}
        {items.map((item) => (
          <PendencyRow key={item.id} item={item} onOpenRoom={onOpenRoom} />
        ))}
      </div>
    </div>
  );
}

function PendencyRow({ item, onOpenRoom }: { item: WorkItem; onOpenRoom: (roomId: string) => void }) {
  const open = item.entries.filter((e) => e.status === "open");
  return (
    <button
      type="button"
      disabled={!item.roomId}
      onClick={() => item.roomId && onOpenRoom(item.roomId)}
      className="mb-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-left disabled:opacity-70"
    >
      <p className="truncate text-[13px] font-semibold text-foreground">{item.title}</p>
      <p className="text-[12px] text-muted-foreground">
        {open.length} aberto{open.length === 1 ? "" : "s"}
        {item.originLabel ? ` · ${item.originLabel}` : ""}
      </p>
    </button>
  );
}
