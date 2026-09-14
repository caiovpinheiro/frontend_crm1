"use client";

import { cn } from "@/lib/utils";

import { TEAM_CHAT_LIST_TABS, type TeamChatListTab } from "./filter-catalog";

type FilterSelectorProps = {
  selectedId: TeamChatListTab;
  counts: Partial<Record<TeamChatListTab, number>>;
  onChange: (id: TeamChatListTab) => void;
};

export function FilterSelector({ selectedId, counts, onChange }: FilterSelectorProps) {
  return (
    <div
      role="tablist"
      aria-label="Filtrar conversas"
      data-tour="bwipo-chat-filters"
      className="flex gap-1 overflow-x-auto rounded-[10px] bg-[var(--orbita-field)] p-1"
    >
      {TEAM_CHAT_LIST_TABS.map((tab) => {
        const active = selectedId === tab.id;
        const count = counts[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex min-w-[4.5rem] shrink-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[12px] font-semibold outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-primary/40",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="truncate">{tab.label}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums",
                active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {count.toLocaleString("pt-BR")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
