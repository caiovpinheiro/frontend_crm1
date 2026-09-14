"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, MoreVertical, Search, SquarePen, Star, Users } from "lucide-react";

import { BwipoWordmark } from "@/components/bwipo/bwipo-logo";
import { AppLoading } from "@/components/crm/app-loading";
import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { NavAlertSoundToggle, useNavMessageAlerts } from "@/components/layout/nav-message-alerts";
import { PageTourButton } from "@/features/product-tour";
import { cn } from "@/lib/utils";

import { Avatar, GroupGlyph } from "./avatar";
import {
  DEFAULT_TEAM_CHAT_LIST_TAB,
  emptyListLabel,
  isTeamChatListTab,
  type TeamChatListTab,
} from "./filter-catalog";
import { FilterSelector } from "./filter-selector";
import { favoriteKey, formatListTime, toPerson } from "./helpers";
import { MyPendenciesButton, MyPendenciesPanel } from "./my-pendencies";
import type { DirectRow, TeamChatRoom } from "./types";

const TAB_STORAGE_KEY = "bwipo-chat-list-tab";

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
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group flex min-h-[76px] w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active ? "orbita-item-selected" : "hover:bg-[var(--orbita-field)]",
      )}
    >
      {item.kind === "dm" ? (
        <div className="shrink-0">
          <Avatar person={toPerson(item.row.person)} size="md" showPresence />
        </div>
      ) : (
        <GroupGlyph seed={item.room.id} size={40} imageUrl={item.room.avatarUrl} name={item.room.name} />
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
            <Star className="h-3 w-3 shrink-0 fill-warning text-warning" aria-hidden />
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
      <TooltipGlass label={favorited ? "Remover dos favoritos" : "Favoritar"} side="left">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-label={favorited ? "Remover dos favoritos" : "Favoritar"}
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-full",
            favorited
              ? "text-warning"
              : "text-[var(--orbita-text-tertiary)] opacity-50 hover:bg-[var(--orbita-field)] group-hover:opacity-100",
          )}
        >
          <Star className={cn("h-3 w-3", favorited && "fill-current")} />
        </button>
      </TooltipGlass>
    </div>
  );
}

function readStoredTab(): TeamChatListTab {
  if (typeof window === "undefined") return DEFAULT_TEAM_CHAT_LIST_TAB;
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY);
    if (isTeamChatListTab(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_TEAM_CHAT_LIST_TAB;
}

function itemMatchesTab(item: ChatListItem, tab: TeamChatListTab, favorites: string[]): boolean {
  if (tab === "unread") return item.unread > 0;
  if (tab === "favorites") return favorites.includes(item.favId);
  return true;
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
  onNewGroup,
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
  onNewGroup: () => void;
  typing?: Record<string, { userId: string; name: string }>;
}) {
  const { soundMuted, setSoundMuted } = useNavMessageAlerts();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TeamChatListTab>(DEFAULT_TEAM_CHAT_LIST_TAB);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendenciesOpen, setPendenciesOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    setTab(readStoredTab());
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

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

  const matchesSearch = (item: ChatListItem) => {
    if (!q) return true;
    return item.name.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q);
  };

  const counts = useMemo(
    () => ({
      all: items.length,
      unread: items.filter((item) => item.unread > 0).length,
      favorites: items.filter((item) => favorites.includes(item.favId)).length,
    }),
    [items, favorites],
  );

  const visibleItems = useMemo(
    () => items.filter((item) => itemMatchesTab(item, tab, favorites) && matchesSearch(item)),
    [items, tab, favorites, q],
  );

  function persistTab(next: TeamChatListTab) {
    setTab(next);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  function renderRow(item: ChatListItem) {
    return (
      <ChatRow
        key={item.key}
        item={item}
        active={item.kind === "dm" ? item.row.room?.id === activeId : item.room.id === activeId}
        favorited={favorites.includes(item.favId)}
        onClick={() => {
          if (item.kind === "group") onSelectRoom(item.room.id);
          else if (item.row.room) onSelectRoom(item.row.room.id);
          else onSelectPerson(item.row.person.id);
        }}
        onToggleFavorite={() => onToggleFavorite(item.favId)}
      />
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center gap-1">
          <h1 className="min-w-0 flex-1 px-1">
            <BwipoWordmark />
          </h1>
          <PageTourButton tourId="bwipo-chat" size="sm" />
          <NavAlertSoundToggle className="grid h-8 w-8 place-items-center rounded-[var(--orbita-radius-inner)] text-[var(--orbita-text-secondary)] hover:bg-[var(--orbita-field)] hover:text-[var(--orbita-text)]" />
          <div data-tour="bwipo-chat-new" className="flex shrink-0 items-center">
            <HeaderIcon label="Nova conversa" onClick={onNew}>
              <SquarePen className="h-[18px] w-[18px]" />
            </HeaderIcon>
            <HeaderIcon label="Novo grupo" onClick={onNewGroup}>
              <Users className="h-[18px] w-[18px]" />
            </HeaderIcon>
          </div>
          <div className="relative" ref={menuRef}>
            <HeaderIcon label="Mais opções" onClick={() => setMenuOpen((v) => !v)}>
              <MoreVertical className="h-5 w-5" />
            </HeaderIcon>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-[var(--orbita-radius-inner)] border border-border bg-[var(--orbita-block)] py-1 shadow-lg">
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
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onNewGroup();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] text-foreground hover:bg-[var(--orbita-block-soft)]"
                >
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Novo grupo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setSoundMuted(!soundMuted);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] text-foreground hover:bg-[var(--orbita-block-soft)]"
                >
                  {soundMuted ? (
                    <BellOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Bell className="h-4 w-4 text-muted-foreground" />
                  )}
                  {soundMuted ? "Ativar som de mensagens" : "Desligar som de mensagens"}
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
            className="h-11 w-full rounded-[10px] border border-border bg-[var(--orbita-field)] py-2.5 pl-10 pr-3 text-[15px] text-[var(--orbita-text)] outline-none placeholder:text-[var(--orbita-text-tertiary)]"
          />
        </div>

        <div className="mt-3">
          <FilterSelector selectedId={tab} counts={counts} onChange={persistTab} />
        </div>
      </div>

      {pendenciesOpen ? (
        <MyPendenciesPanel
          onOpenRoom={(id) => {
            setPendenciesOpen(false);
            onSelectRoom(id);
          }}
          onClose={() => setPendenciesOpen(false)}
        />
      ) : (
      <nav
        className="chat-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-1.5"
        aria-label="Conversas"
        data-tour="bwipo-chat-list"
      >
        {loading ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : error ? (
          <div className={cn(CARD_SURFACE_CLASS, "mx-4 mt-6 px-4 py-8 text-center")}>
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className={cn(CARD_SURFACE_CLASS, "mx-2 mt-6 border border-border px-4 py-8 text-center")}>
            <p className="text-sm text-muted-foreground">{emptyListLabel(tab, Boolean(q))}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">{visibleItems.map(renderRow)}</div>
        )}
      </nav>
      )}
      <div className="shrink-0 border-t border-[var(--orbita-divider)]">
        <MyPendenciesButton open={pendenciesOpen} onToggle={() => setPendenciesOpen((v) => !v)} />
      </div>
    </aside>
  );
}
