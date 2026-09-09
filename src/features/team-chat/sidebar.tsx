"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreVertical, Search, SquarePen, Star } from "lucide-react";

import { BwipoWordmark } from "@/components/bwipo/bwipo-logo";
import { AppLoading } from "@/components/crm/app-loading";
import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { PageTourButton } from "@/features/product-tour";
import { cn } from "@/lib/utils";

import { QueueSection } from "@/features/inbox-v2/extras/queue-section";

import { Avatar, GroupGlyph } from "./avatar";
import {
  DEFAULT_TEAM_CHAT_FILTERS,
  TEAM_CHAT_FILTERS,
  teamChatFilterVisual,
  toggleTeamChatFilter,
  type TeamChatFilterId,
} from "./filter-catalog";
import { TeamChatFilterSelector } from "./filter-selector";
import {
  favoriteKey,
  formatListTime,
  toPerson,
} from "./helpers";
import type { DirectRow, TeamChatRoom } from "./types";

type ChatListItem =
  | {
      key: string;
      kind: "dm";
      row: DirectRow;
      favId: string;
      at: number;
      unread: number;
      name: string;
      preview: string;
      time: string;
      typing: boolean;
    }
  | {
      key: string;
      kind: "group";
      room: TeamChatRoom;
      favId: string;
      at: number;
      unread: number;
      name: string;
      preview: string;
      time: string;
      typing: boolean;
    };

function HeaderIcon({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-[var(--orbita-radius-inner)] text-[var(--orbita-text-secondary)] transition-colors hover:bg-[var(--orbita-field)] hover:text-[var(--orbita-text)]"
    >
      {children}
    </button>
  );
}

function UnreadPill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[var(--orbita-unread-bg)] px-1.5 text-[11px] font-semibold text-[var(--orbita-unread-fg)]">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ChatRow({
  item,
  active,
  favorited,
  onClick,
  onToggleFavorite,
}: {
  item: ChatListItem;
  active: boolean;
  favorited: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;
}) {
  const unread = item.unread;
  return (
    <div
      className={cn(
        "group flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left transition-colors",
        active ? "bg-[var(--orbita-list-selected-bg)]" : "hover:bg-[var(--orbita-field)]",
      )}
    >
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {item.kind === "dm" ? (
          <div className="shrink-0">
            <Avatar person={toPerson(item.row.person)} size="md" showPresence />
          </div>
        ) : (
          <GroupGlyph seed={item.room.id} size={40} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "truncate text-[14px] leading-tight",
                active ? "text-[var(--orbita-list-selected-name)]" : "text-[var(--orbita-text)]",
                unread > 0 || active ? "font-semibold" : "font-medium",
              )}
            >
              {item.kind === "group" ? `#${item.name}` : item.name}
            </span>
            {favorited && (
              <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
            )}
            {item.time && (
              <span
                className={cn(
                  "ml-auto shrink-0 text-[11px]",
                  active
                    ? "text-[var(--orbita-list-selected-time)]"
                    : "text-[var(--orbita-text-tertiary)]",
                )}
              >
                {item.time}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[12px] leading-snug",
                item.typing
                  ? "font-medium text-[var(--orbita-selected)]"
                  : active
                    ? "text-[var(--orbita-list-selected-preview)]"
                    : unread > 0
                      ? "font-medium text-[var(--orbita-text)]"
                      : "text-[var(--orbita-text-secondary)]",
              )}
            >
              {item.typing ? "Digitando..." : item.preview}
            </span>
            {!active && <UnreadPill count={unread} />}
          </div>
        </div>
      </button>
      <TooltipGlass label={favorited ? "Remover dos favoritos" : "Favoritar"} side="left">
        <button
        type="button"
        onClick={onToggleFavorite}
        aria-label={favorited ? "Remover dos favoritos" : "Favoritar"}
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-full",
          favorited
            ? "text-[var(--orbita-text)]"
            : "text-[var(--orbita-text-tertiary)] opacity-50 hover:bg-[var(--orbita-field)] group-hover:opacity-100",
        )}
      >
        <Star className={cn("h-3 w-3", favorited && "fill-current")} />
      </button>
      </TooltipGlass>
    </div>
  );
}

export function Sidebar({
  directs,
  groups,
  activeId,
  loading,
  error,
  favorites,
  onToggleFavorite,
  onSelectRoom,
  onSelectPerson,
  onNew,
  typing = {},
}: {
  directs: DirectRow[];
  groups: TeamChatRoom[];
  activeId: string | null;
  loading: boolean;
  error?: string | null;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onSelectRoom: (id: string) => void;
  onSelectPerson: (personId: string) => void;
  onNew: () => void;
  typing?: Record<string, { userId: string; name: string }>;
}) {
  const [query, setQuery] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<TeamChatFilterId[]>(
    () => [...DEFAULT_TEAM_CHAT_FILTERS],
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const unreadTotal = useMemo(
    () =>
      directs.reduce((n, d) => n + (d.room?.unread ?? 0), 0) +
      groups.reduce((n, g) => n + g.unread, 0),
    [directs, groups],
  );

  const items = useMemo<ChatListItem[]>(() => {
    const out: ChatListItem[] = [];
    for (const row of directs) {
      const favId = favoriteKey({ roomId: row.room?.id, personId: row.person.id });
      out.push({
        key: row.room?.id ?? `person-${row.person.id}`,
        kind: "dm",
        row,
        favId,
        at: row.room?.lastMessageAt ? new Date(row.room.lastMessageAt).getTime() : 0,
        unread: row.room?.unread ?? 0,
        name: row.person.name,
        preview: row.room?.lastPreview || "Enviar mensagem",
        time: row.room?.lastMessageAt ? formatListTime(row.room.lastMessageAt) : "",
        typing: Boolean(row.room?.id && typing[row.room.id]),
      });
    }
    for (const room of groups) {
      out.push({
        key: room.id,
        kind: "group",
        room,
        favId: room.id,
        at: room.lastMessageAt ? new Date(room.lastMessageAt).getTime() : 0,
        unread: room.unread,
        name: room.name,
        preview: room.lastPreview || "Comece a conversa",
        time: formatListTime(room.lastMessageAt),
        typing: Boolean(typing[room.id]),
      });
    }
    return out.sort((a, b) => b.at - a.at || a.name.localeCompare(b.name, "pt-BR"));
  }, [directs, groups, typing]);

  const matchesFilter = useCallback(
    (item: ChatListItem, id: TeamChatFilterId) => {
      if (id === "diretas") return item.kind === "dm";
      if (id === "grupos") return item.kind === "group";
      if (id === "unread") return item.unread > 0;
      return favorites.includes(item.favId);
    },
    [favorites],
  );

  const searched = useMemo(() => {
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q),
    );
  }, [items, q]);

  const visible = useMemo(() => {
    if (selectedFilters.length === 0) return [];
    return searched.filter((item) => selectedFilters.some((id) => matchesFilter(item, id)));
  }, [searched, selectedFilters, matchesFilter]);

  const sections = useMemo(() => {
    if (selectedFilters.length < 2) return null;
    return selectedFilters.map((id) => {
      const meta = TEAM_CHAT_FILTERS.find((item) => item.id === id)!;
      return {
        id,
        label: meta.label,
        items: searched.filter((item) => matchesFilter(item, id)),
      };
    });
  }, [selectedFilters, searched, matchesFilter]);

  const counts = {
    diretas: directs.length,
    grupos: groups.length,
    unread: unreadTotal,
    favorites: favorites.length,
  };

  const allCollapsed =
    !!sections &&
    sections.length > 0 &&
    sections.every((s) => collapsed.has(s.id));

  return (
    <aside className="orbita-block flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-center gap-1">
          <h1 className="min-w-0 flex-1 px-1">
            <BwipoWordmark />
          </h1>
          <PageTourButton tourId="bwipo-chat" size="sm" />
          <div data-tour="bwipo-chat-new" className="shrink-0">
            <HeaderIcon label="Nova conversa" onClick={onNew}>
              <SquarePen className="h-[18px] w-[18px]" />
            </HeaderIcon>
          </div>
          <div className="relative" ref={menuRef}>
            <HeaderIcon label="Mais opções" onClick={() => setMenuOpen((v) => !v)}>
              <MoreVertical className="h-5 w-5" />
            </HeaderIcon>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-[var(--orbita-radius-inner)] bg-[var(--orbita-block)] py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onNew();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] text-foreground hover:bg-[var(--orbita-block-soft)]"
                >
                  <SquarePen className="h-4 w-4 text-muted-foreground" />
                  Nova conversa
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="relative mt-2" data-tour="bwipo-chat-search">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar conversas"
            className="h-11 w-full rounded-[10px] bg-[var(--orbita-field)] py-2.5 pl-10 pr-3 text-[15px] text-[var(--orbita-text)] outline-none placeholder:text-[var(--orbita-text-tertiary)]"
          />
        </div>

        <div className="mt-3" data-tour="bwipo-chat-filters">
          <TeamChatFilterSelector
            selectedIds={selectedFilters}
            counts={counts}
            onToggle={(id) => setSelectedFilters((cur) => toggleTeamChatFilter(cur, id))}
          />
        </div>
      </div>

      <nav className="chat-scroll flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-black/[0.04] py-1 dark:border-white/[0.06]" aria-label="Conversas" data-tour="bwipo-chat-list">
        {loading ? (
          <AppLoading variant="inline" className="min-h-0 flex-1 lg:hidden" />
        ) : error ? (
          <div className={cn(CARD_SURFACE_CLASS, "mx-4 mt-6 px-4 py-8 text-center")}>
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : selectedFilters.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
            <p className="font-display text-[14px] font-semibold text-[var(--inbox-text)]">
              Nenhuma fila selecionada
            </p>
            <p className="mt-1 max-w-[16rem] text-[12px] leading-relaxed text-[var(--inbox-text-muted)]">
              Selecione ao menos uma fila no seletor acima para ver as conversas.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className={cn(CARD_SURFACE_CLASS, "mx-4 mt-6 px-4 py-8 text-center")}>
            <p className="text-sm text-muted-foreground">
              {q ? "Nenhuma conversa encontrada." : "Nenhuma conversa nesta fila."}
            </p>
          </div>
        ) : (
          <>
            {sections && sections.length >= 2 ? (
              <div className="flex justify-end px-4 pb-1">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed(
                      allCollapsed ? new Set() : new Set(sections.map((s) => s.id)),
                    )
                  }
                  className="rounded-md px-1.5 py-0.5 font-display text-[11px] font-semibold text-[var(--inbox-brand)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]"
                >
                  {allCollapsed ? "Expandir todas" : "Recolher todas"}
                </button>
              </div>
            ) : null}
            {sections
              ? sections.map((section) => {
                  const visual = teamChatFilterVisual(section.id);
                  return (
                    <div key={section.id} className="px-2">
                      <QueueSection
                        id={section.id}
                        label={section.label}
                        count={section.items.length}
                        collapsed={collapsed.has(section.id)}
                        onToggle={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            if (next.has(section.id)) next.delete(section.id);
                            else next.add(section.id);
                            return next;
                          })
                        }
                        Icon={visual.Icon}
                        iconBg={visual.bg}
                        iconFg={visual.fg}
                      >
                        {section.items.map((item) => (
                          <ChatRow
                            key={`${section.id}-${item.key}`}
                            item={item}
                            active={
                              item.kind === "dm"
                                ? item.row.room?.id === activeId
                                : item.room.id === activeId
                            }
                            favorited={favorites.includes(item.favId)}
                            onClick={() => {
                              if (item.kind === "group") onSelectRoom(item.room.id);
                              else if (item.row.room) onSelectRoom(item.row.room.id);
                              else onSelectPerson(item.row.person.id);
                            }}
                            onToggleFavorite={() => onToggleFavorite(item.favId)}
                          />
                        ))}
                      </QueueSection>
                    </div>
                  );
                })
              : visible.map((item) => (
                  <ChatRow
                    key={item.key}
                    item={item}
                    active={
                      item.kind === "dm"
                        ? item.row.room?.id === activeId
                        : item.room.id === activeId
                    }
                    favorited={favorites.includes(item.favId)}
                    onClick={() => {
                      if (item.kind === "group") onSelectRoom(item.room.id);
                      else if (item.row.room) onSelectRoom(item.row.room.id);
                      else onSelectPerson(item.row.person.id);
                    }}
                    onToggleFavorite={() => onToggleFavorite(item.favId)}
                  />
                ))}
          </>
        )}
      </nav>
    </aside>
  );
}
