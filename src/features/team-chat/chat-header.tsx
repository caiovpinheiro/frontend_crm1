"use client";

import { useState } from "react";
import { ArrowLeft, PanelRight, Phone, Search, Star, UserPlus, Video, X } from "lucide-react";
import { toast } from "sonner";

import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { cn } from "@/lib/utils";

import { Avatar, AvatarStack, GroupGlyph } from "./avatar";
import { PRESENCE_TEXT, presenceLabel, toPerson } from "./helpers";
import type { TeamChatRoom } from "./types";

function IconButton({
  label,
  active,
  badge,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative grid h-8 w-8 place-items-center rounded-[var(--orbita-radius-inner)] transition-colors",
        active
          ? "bg-[var(--orbita-field)] text-[var(--orbita-text)]"
          : "text-[var(--orbita-text-secondary)] hover:bg-[var(--orbita-field)] hover:text-[var(--orbita-text)]",
      )}
    >
      {children}
      {typeof badge === "number" && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--orbita-unread-bg)] px-1 text-[10px] font-bold text-[var(--orbita-unread-fg)]">
          {badge}
        </span>
      )}
    </button>
  );
}

function HeaderAction({
  label,
  active,
  badge,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <TooltipGlass label={label} side="bottom">
      <span className="inline-flex">
        <IconButton label={label} active={active} badge={badge} onClick={onClick}>
          {children}
        </IconButton>
      </span>
    </TooltipGlass>
  );
}

export function ChatHeader({
  room,
  notesOpen,
  noteCount,
  searchQuery,
  favorited,
  onSearchChange,
  onBack,
  onToggleNotes,
  onToggleFavorite,
  onAddMembers,
}: {
  room: TeamChatRoom;
  notesOpen: boolean;
  noteCount: number;
  searchQuery: string;
  favorited: boolean;
  onSearchChange: (value: string) => void;
  onBack: () => void;
  onToggleNotes: () => void;
  onToggleFavorite: () => void;
  onAddMembers: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const isDirect = room.kind === "DM";
  const lead = room.peer ? toPerson(room.peer) : null;
  const people = room.members.map(toPerson);

  return (
    <header className="shrink-0 border-b border-black/[0.06] bg-[var(--orbita-chrome)] dark:border-white/[0.06]">
      <div className="flex h-[60px] items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar para a lista"
            className="grid h-9 w-9 place-items-center rounded-[var(--orbita-radius-inner)] text-[var(--orbita-text-secondary)] hover:bg-[var(--orbita-field)] hover:text-[var(--orbita-text)] lg:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {isDirect && lead ? (
            <div className="shrink-0">
              <Avatar person={lead} size="sm" showPresence />
            </div>
          ) : (
            <GroupGlyph seed={room.id} size={36} />
          )}
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-[var(--orbita-text)]">
              {isDirect ? room.name : `#${room.name}`}
            </h2>
            {isDirect && lead ? (
              <span className="text-[12px] font-medium" style={{ color: PRESENCE_TEXT[lead.presence] }}>
                {presenceLabel[lead.presence]}
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <AvatarStack people={people} />
                <span className="truncate text-[12px] text-[var(--orbita-text-secondary)]">
                  {room.topic ? `${room.topic} · ` : ""}
                  {room.memberCount} membros
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {room.kind === "GROUP" && (
            <HeaderAction label="Adicionar membros" onClick={onAddMembers}>
              <UserPlus className="h-[18px] w-[18px]" />
            </HeaderAction>
          )}
          <HeaderAction
            label="Ligar"
            onClick={() => toast.message("Chamadas internas em breve.")}
          >
            <Phone className="h-[18px] w-[18px]" />
          </HeaderAction>
          <HeaderAction
            label="Chamada de vídeo"
            onClick={() => toast.message("Chamadas internas em breve.")}
          >
            <Video className="h-[18px] w-[18px]" />
          </HeaderAction>
          <HeaderAction
            label="Pesquisar na conversa"
            active={searchOpen}
            onClick={() => {
              if (searchOpen) {
                setSearchOpen(false);
                onSearchChange("");
              } else {
                setSearchOpen(true);
              }
            }}
          >
            <Search className="h-[18px] w-[18px]" />
          </HeaderAction>
          <HeaderAction
            label={favorited ? "Remover dos favoritos" : "Favoritar"}
            active={favorited}
            onClick={onToggleFavorite}
          >
            <Star className={cn("h-[18px] w-[18px]", favorited && "fill-current")} />
          </HeaderAction>
          <HeaderAction
            label="Detalhes"
            active={notesOpen}
            badge={notesOpen ? undefined : noteCount}
            onClick={onToggleNotes}
          >
            <PanelRight className="h-[18px] w-[18px]" />
          </HeaderAction>
        </div>
      </div>
      {searchOpen && (
        <div className="mt-0 border-t border-black/[0.04] px-4 pb-3 pt-2 dark:border-white/[0.06]">
          <div className="flex items-center gap-2 rounded-[var(--orbita-radius-inner)] bg-[var(--orbita-field)] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoFocus
            placeholder="Pesquisar nesta conversa"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--orbita-text)] outline-none placeholder:text-[var(--orbita-text-tertiary)]"
          />
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              onSearchChange("");
            }}
            aria-label="Fechar pesquisa"
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-white/50"
          >
            <X className="h-4 w-4" />
          </button>
          </div>
        </div>
      )}
    </header>
  );
}
