"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode, Fragment } from "react";
import { CheckSquare, ChevronDown, Copy, Download, FileText, Forward, Pin, PinOff, Reply, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AppLoading } from "@/components/crm/app-loading";
import { ImageLightbox } from "@/components/crm/image-lightbox";
import { StatusTicks, type DeliveryTickStatus } from "@/components/crm/status-ticks";

import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { cn } from "@/lib/utils";

import { Avatar, GroupGlyph } from "./avatar";
import { dayKey, formatClock, formatDayLabel, getOrbitaNameColor, parseQuotedContent, REACTION_EMOJIS, toPerson } from "./helpers";
import { LinkedRecordCard } from "./record-card";
import type { OpenCrmCard, TeamChatAttachment, TeamChatMessage, TeamChatReaction, TeamChatRoom, WorkItem } from "./types";
import { WorkItemCard } from "./work-item-card";

function formatChatText(text: string, mine: boolean): ReactNode {
  if (!text) return text;
  const tokenRe = /(@all\b|@[^\s@]{1,40}|==[^=\n]+==|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/gi;
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("@")) {
      parts.push(
        <span
          key={key++}
          className={cn(
            "rounded-sm px-0.5 font-semibold",
            mine ? "bg-white/20 text-inherit" : "bg-primary/10 text-primary",
          )}
        >
          {tok}
        </span>,
      );
    } else if (tok.startsWith("==")) {
      parts.push(
        <mark
          key={key++}
          className={cn("rounded-sm px-0.5", mine ? "bg-white/20 text-inherit" : "bg-amber-200/80 text-[var(--orbita-text)]")}
        >
          {tok.slice(2, -2)}
        </mark>,
      );
    } else {
      const inner = tok.slice(1, -1);
      switch (tok[0]) {
        case "*":
          parts.push(
            <strong key={key++} className="font-semibold">
              {inner}
            </strong>,
          );
          break;
        case "_":
          parts.push(<em key={key++}>{inner}</em>);
          break;
        case "~":
          parts.push(<s key={key++}>{inner}</s>);
          break;
        default:
          parts.push(
            <code key={key++} className="rounded px-1 font-mono text-[0.92em] bg-black/10">
              {inner}
            </code>,
          );
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

async function copyAttachment(att: TeamChatAttachment) {
  if (att.kind === "sticker" && att.emoji) {
    await navigator.clipboard.writeText(att.emoji);
    toast.success("Figurinha copiada");
    return;
  }
  if (!att.url) throw new Error("Sem arquivo");
  const res = await fetch(att.url);
  if (!res.ok) throw new Error("Falha ao ler o arquivo");
  const blob = await res.blob();
  const type = blob.type || att.mimeType || "application/octet-stream";
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
    toast.success(att.kind === "image" ? "Imagem copiada" : "Arquivo copiado");
    return;
  }
  await navigator.clipboard.writeText(att.url);
  toast.success("Link copiado");
}

function reactionMine(r: TeamChatReaction, meId: string) {
  return r.userIds ? r.userIds.includes(meId) : r.mine;
}

export function MessageList({
  room,
  messages,
  meId,
  error = null,
  onRetry,
  query = "",
  workItems = [],
  onToggleReaction,
  onTogglePin,
  onReply,
  onWorkItemChange,
  onWorkItemDeleted,
  onLinkRecord,
  onToChecklist,
  onForward,
  onDelete,
  onOpenRecord,
}: {
  room: TeamChatRoom;
  messages: TeamChatMessage[];
  meId: string;
  error?: string | null;
  onRetry?: () => void;
  query?: string;
  workItems?: WorkItem[];
  onToggleReaction: (id: string, emoji: string) => void;
  onTogglePin: (id: string) => void;
  onReply?: (message: TeamChatMessage) => void;
  onWorkItemChange?: (item: WorkItem) => void;
  onWorkItemDeleted?: (id: string) => void;
  onLinkRecord?: (item: WorkItem) => void;
  onToChecklist?: (message: TeamChatMessage) => void;
  onForward?: (message: TeamChatMessage) => void;
  onDelete?: (message: TeamChatMessage) => void;
  onOpenRecord?: (card: OpenCrmCard) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevRoomId = useRef(room.id);
  const prevCount = useRef(messages.length);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const isDirect = room.kind === "DM";
  const q = query.trim().toLowerCase();
  const pinned = messages.filter((m) => m.pinned);
  const visible = useMemo(() => {
    if (!q) return messages;
    return messages.filter(
      (m) => m.kind === "SYSTEM" || m.content.toLowerCase().includes(q) || (m.author?.name ?? "").toLowerCase().includes(q),
    );
  }, [messages, q]);

  const nearBottom = (el: HTMLElement) =>
    el.scrollHeight - el.scrollTop - el.clientHeight < 140;

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    stickToBottom.current = true;
    setShowScrollDown(false);
    setUnseen(0);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const near = nearBottom(el);
      stickToBottom.current = near;
      if (near) {
        setShowScrollDown(false);
        setUnseen(0);
      } else {
        setShowScrollDown(true);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [room.id]);

  useEffect(() => {
    prevRoomId.current = room.id;
    stickToBottom.current = true;
    prevCount.current = messages.length;
    setShowScrollDown(false);
    setUnseen(0);
    requestAnimationFrame(() => scrollToBottom("auto"));
    // só ao trocar de sala
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    const grew = messages.length > prevCount.current;
    prevCount.current = messages.length;
    if (!grew) return;
    if (stickToBottom.current || lastMessage?.authorId === meId) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
      return;
    }
    setShowScrollDown(true);
    setUnseen((n) => n + 1);
  }, [lastMessage?.authorId, lastMessage?.id, meId, messages.length]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {pinned.length > 0 && (
        <div className="sticky top-0 z-10 shrink-0 bg-[var(--orbita-block-soft)] px-3 py-2 md:px-6">
          <div className="flex w-full items-start gap-2">
            <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--orbita-text-secondary)]" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--orbita-text-secondary)]">
                Destacadas
              </p>
              {pinned.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[14px] text-foreground">
                    <span className="font-semibold">{m.author?.name ?? "Colega"}</span>
                    <span className="text-muted-foreground"> · {m.content || "Anexo"}</span>
                  </p>
                  <TooltipGlass label="Remover destaque" side="left">
                    <button
                      type="button"
                      onClick={() => onTogglePin(m.id)}
                      aria-label="Remover destaque"
                      className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-white/50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </TooltipGlass>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {error ? (
        <AppLoading
          variant="inline"
          className="min-h-0 flex-1"
          error={error}
          onRetry={onRetry}
        />
      ) : (
      <div ref={scrollRef} className="chat-scroll flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex min-h-full w-full flex-col justify-end px-3 py-4 md:px-6 lg:px-8">
          <div className="mb-4 flex justify-center">
            <div className="flex max-w-md flex-col items-center rounded-2xl border border-border bg-[var(--orbita-block)] px-6 py-5 text-center">
              {isDirect && room.peer ? (
                <Avatar person={toPerson(room.peer)} size="lg" showPresence />
              ) : (
                <GroupGlyph seed={room.id} size={56} imageUrl={room.avatarUrl} name={room.name} />
              )}
              <p className="mt-3 text-[16px] font-semibold text-[var(--orbita-text)]">
                {isDirect ? room.name : `#${room.name}`}
              </p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--orbita-text-secondary)]">
                {isDirect
                  ? "Este é o início da sua conversa."
                  : room.topic || `Este é o início do canal #${room.name}.`}
              </p>
            </div>
          </div>
          {q && visible.every((m) => m.kind === "SYSTEM") && !visible.some((m) => m.content.toLowerCase().includes(q)) ? (
            <p className="py-10 text-center text-[15px] text-muted-foreground">Nenhuma mensagem nesta conversa.</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {visible.map((msg, i) => {
                if (msg.kind === "SYSTEM") {
                  return (
                    <div key={msg.id} className="my-2 flex justify-center">
                      <span className="rounded-[var(--orbita-radius-inner)] border border-border bg-[var(--orbita-block-soft)] px-3.5 py-1.5 text-[13px] text-muted-foreground">
                        {msg.content}
                      </span>
                    </div>
                  );
                }
                const mine = msg.authorId === meId;
                const author = msg.author ? toPerson(msg.author) : null;
                const prev = visible[i - 1];
                const next = visible[i + 1];
                const showDay = i === 0 || dayKey(msg.createdAt) !== dayKey(prev.createdAt);
                const first = showDay || !prev || prev.kind === "SYSTEM" || prev.authorId !== msg.authorId;
                const last =
                  !next ||
                  next.kind === "SYSTEM" ||
                  next.authorId !== msg.authorId ||
                  dayKey(next.createdAt) !== dayKey(msg.createdAt);
                return (
                  <Fragment key={msg.id}>
                    {showDay && (
                      <div className="sticky top-2 z-[2] my-3.5 flex justify-center">
                        <span className="rounded-full border border-border bg-[var(--orbita-block)] px-3.5 py-1 text-[13px] font-medium text-muted-foreground">
                          {formatDayLabel(msg.createdAt)}
                        </span>
                      </div>
                    )}
                    <MessageRow
                      message={msg}
                      meId={meId}
                      authorName={mine ? "Você" : (author?.name ?? "Colega")}
                      author={author}
                      first={first}
                      last={last}
                      mine={mine}
                      showName={!isDirect}
                      workItem={msg.workItemId ? workItems.find((w) => w.id === msg.workItemId) : undefined}
                      peerOnline={
                        isDirect
                          ? Boolean(room.peer?.systemOnline)
                          : room.members.some((m) => m.id !== meId && m.systemOnline)
                      }
                      onToggleReaction={onToggleReaction}
                      onTogglePin={onTogglePin}
                      onReply={onReply}
                      onWorkItemChange={onWorkItemChange}
                      onWorkItemDeleted={onWorkItemDeleted}
                      onLinkRecord={onLinkRecord}
                      onToChecklist={onToChecklist}
                      onForward={onForward}
                      onDelete={onDelete}
                      onOpenRecord={onOpenRecord}
                    />
                  </Fragment>
                );
              })}
            </div>
          )}
          <div ref={endRef} className="h-2" />
        </div>
      </div>
      )}
      {showScrollDown ? (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          aria-label={
            unseen > 0
              ? `${unseen} mensagens novas — ir para o fim`
              : "Ir para a última mensagem"
          }
          className="absolute bottom-3 right-4 z-20 grid size-10 place-items-center rounded-full border border-border bg-[var(--orbita-block)] text-[var(--orbita-text-secondary)] shadow-md"
        >
          <ChevronDown className="h-5 w-5" />
          {unseen > 0 ? (
            <span className="absolute -right-1 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[var(--orbita-unread-bg)] px-1 py-0.5 text-[10px] font-bold leading-none text-[var(--orbita-unread-fg)] tabular-nums">
              {unseen > 99 ? "99+" : unseen}
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}

function bubbleRadius(_first: boolean, mine: boolean) {
  return mine ? "rounded-2xl rounded-br-sm" : "rounded-2xl rounded-bl-sm";
}

function tickStatus(mine: boolean, peerOnline: boolean, createdAt: string): DeliveryTickStatus | undefined {
  if (!mine) return undefined;
  const age = Date.now() - new Date(createdAt).getTime();
  if (Number.isFinite(age) && age < 1800) return "sent";
  return peerOnline ? "read" : "delivered";
}

function MessageRow({
  message,
  meId,
  authorName,
  author,
  first,
  last,
  mine,
  showName,
  workItem,
  peerOnline,
  onToggleReaction,
  onTogglePin,
  onReply,
  onWorkItemChange,
  onWorkItemDeleted,
  onLinkRecord,
  onToChecklist,
  onForward,
  onDelete,
  onOpenRecord,
}: {
  message: TeamChatMessage;
  meId: string;
  authorName: string;
  author: ReturnType<typeof toPerson> | null;
  first: boolean;
  last: boolean;
  mine: boolean;
  showName: boolean;
  workItem?: WorkItem;
  peerOnline: boolean;
  onToggleReaction: (id: string, emoji: string) => void;
  onTogglePin: (id: string) => void;
  onReply?: (message: TeamChatMessage) => void;
  onWorkItemChange?: (item: WorkItem) => void;
  onWorkItemDeleted?: (id: string) => void;
  onLinkRecord?: (item: WorkItem) => void;
  onToChecklist?: (message: TeamChatMessage) => void;
  onForward?: (message: TeamChatMessage) => void;
  onDelete?: (message: TeamChatMessage) => void;
  onOpenRecord?: (card: OpenCrmCard) => void;
}) {
  const [, bumpTick] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreMenuCloseUntil = useRef(0);
  const reactions = message.reactions ?? [];
  const tick = tickStatus(mine, peerOnline, message.createdAt);

  function clearLongPress() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  function openMessageMenu() {
    ignoreMenuCloseUntil.current = Date.now() + 450;
    setMenuOpen(true);
  }

  useEffect(() => {
    if (!mine) return;
    const age = Date.now() - new Date(message.createdAt).getTime();
    if (!Number.isFinite(age) || age >= 1800) return;
    const t = window.setTimeout(() => bumpTick((n) => n + 1), 1800 - age);
    return () => window.clearTimeout(t);
  }, [mine, message.createdAt]);

  useEffect(() => () => clearLongPress(), []);

  return (
    <div className={cn("isolate flex w-full flex-col", mine ? "items-end" : "items-start", first ? "mt-2.5" : "mt-[3px]")}>
      <div
        className={cn(
          "flex items-end gap-2",
          workItem ? "max-w-[min(85%,40rem)]" : "w-fit max-w-[min(78%,52rem)]",
          mine ? "flex-row-reverse" : "flex-row",
        )}
      >
        {!mine && (
          <div className="flex w-8 shrink-0 justify-center self-end">
            {last && author ? <Avatar person={author} size="xs" /> : null}
          </div>
        )}
        <div className={cn("flex min-w-0 flex-col", mine ? "items-end" : "items-start")}>
          {first && showName && !mine && (
            <span
              className="mb-0.5 px-1.5 text-[13.5px] font-semibold"
              style={{ color: author ? getOrbitaNameColor(author.id) : "var(--orbita-text)" }}
            >
              {authorName}
            </span>
          )}
          <div
            className={cn(
              "group/bubble relative w-fit max-w-full select-none",
              reactions.length > 0 && "mb-3",
            )}
            onContextMenu={(e) => {
              if (workItem) return;
              e.preventDefault();
              openMessageMenu();
            }}
            onTouchStart={() => {
              if (workItem) return;
              clearLongPress();
              longPressRef.current = setTimeout(() => {
                longPressRef.current = null;
                openMessageMenu();
              }, 480);
            }}
            onTouchEnd={(e) => {
              if (menuOpen) e.preventDefault();
              clearLongPress();
            }}
            onTouchMove={clearLongPress}
            onTouchCancel={clearLongPress}
            style={{ WebkitTouchCallout: "none" }}
          >
            {workItem ? (
              <WorkItemCard
                item={workItem}
                meId={meId}
                onChange={onWorkItemChange}
                onDeleted={onWorkItemDeleted}
                onLinkRecord={onLinkRecord}
                onOpenRecord={onOpenRecord}
              />
            ) : (
            <MessageBody
              message={message}
              mine={mine}
              first={first}
              pinned={message.pinned}
              time={formatClock(message.createdAt)}
              tick={tick}
              onOpenRecord={onOpenRecord}
            />
            )}
            {reactions.length > 0 && (
              <div
                className={cn(
                  "absolute -bottom-2.5 z-[1] flex gap-0.5",
                  mine ? "right-1" : "left-1",
                )}
              >
                {reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={() => onToggleReaction(message.id, r.emoji)}
                    className={cn(
                      "flex items-center gap-0.5 rounded-full px-1.5 py-px text-[12px]",
                      reactionMine(r, meId)
                        ? "bg-[var(--orbita-selected)] text-[var(--orbita-unread-fg)]"
                        : "bg-card text-card-foreground",
                    )}
                  >
                    <span>{r.emoji}</span>
                    {r.count > 1 && <span className="text-[10px] font-semibold opacity-70">{r.count}</span>}
                  </button>
                ))}
              </div>
            )}
            {!workItem && (
              <BubbleHoverActions
                message={message}
                mine={mine}
                open={menuOpen}
                onOpenChange={setMenuOpen}
                ignoreCloseUntil={ignoreMenuCloseUntil}
                onToggleReaction={onToggleReaction}
                onTogglePin={onTogglePin}
                onReply={onReply}
                onToChecklist={onToChecklist}
                onForward={onForward}
                onDelete={onDelete}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BubbleHoverActions({
  message,
  mine,
  open,
  onOpenChange,
  ignoreCloseUntil,
  onToggleReaction,
  onTogglePin,
  onReply,
  onToChecklist,
  onForward,
  onDelete,
}: {
  message: TeamChatMessage;
  mine: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ignoreCloseUntil: MutableRefObject<number>;
  onToggleReaction: (id: string, emoji: string) => void;
  onTogglePin: (id: string) => void;
  onReply?: (message: TeamChatMessage) => void;
  onToChecklist?: (message: TeamChatMessage) => void;
  onForward?: (message: TeamChatMessage) => void;
  onDelete?: (message: TeamChatMessage) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (Date.now() < ignoreCloseUntil.current) return;
      if (!boxRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange, ignoreCloseUntil]);

  function MenuItem({
    label,
    icon,
    onClick,
    danger,
  }: {
    label: string;
    icon: ReactNode;
    onClick: () => void;
    danger?: boolean;
  }) {
    return (
      <button
        type="button"
        onClick={() => {
          onClick();
          onOpenChange(false);
        }}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14.5px] transition-colors",
          danger
            ? "text-destructive hover:bg-destructive/10"
            : "text-foreground hover:bg-muted",
        )}
      >
        <span className={cn("grid size-5 shrink-0 place-items-center", danger ? "text-destructive" : "text-muted-foreground")}>
          {icon}
        </span>
        {label}
      </button>
    );
  }

  return (
    <div
      ref={boxRef}
      className={cn(
        "absolute top-1 z-30",
        mine ? "left-1" : "right-1",
      )}
    >
      <button
        type="button"
        aria-label="Ações da mensagem"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
        className={cn(
          "grid size-7 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm",
          "transition-opacity hover:bg-muted hover:text-foreground",
          // Touch: sempre visível. Desktop: no hover / menu aberto.
          open
            ? "opacity-100"
            : "opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover/bubble:opacity-100 focus-visible:opacity-100",
        )}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <div
          className={cn(
            "absolute z-40 mt-1 w-[15.5rem] overflow-hidden rounded-2xl border border-border bg-card py-1 shadow-[0_10px_32px_rgba(15,23,42,0.18)]",
            mine ? "left-0" : "right-0",
          )}
          role="menu"
        >
          <div className="mx-1.5 mb-1 flex items-center justify-between gap-0.5 rounded-full bg-muted/70 px-1 py-1">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onToggleReaction(message.id, emoji);
                  onOpenChange(false);
                }}
                aria-label={`Reagir com ${emoji}`}
                className="grid size-8 place-items-center rounded-full text-[18px] leading-none transition-transform hover:scale-110 hover:bg-card"
              >
                {emoji}
              </button>
            ))}
          </div>
          {onReply ? (
            <MenuItem
              label="Responder"
              icon={<Reply className="h-4 w-4" />}
              onClick={() => onReply(message)}
            />
          ) : null}
          <MenuItem
            label="Copiar"
            icon={<Copy className="h-4 w-4" />}
            onClick={() => {
              const parsed = parseQuotedContent(message.content);
              const text = parsed.body.trim() || parsed.quote?.excerpt || message.content;
              const firstAtt = message.attachments?.[0];
              if (!text.trim() && firstAtt) {
                void copyAttachment(firstAtt).catch(() => toast.error("Não foi possível copiar."));
                return;
              }
              void navigator.clipboard.writeText(text).then(
                () => toast.success("Copiado."),
                () => toast.error("Não foi possível copiar."),
              );
            }}
          />
          {(message.attachments ?? []).some((a) => a.url) ? (
            <MenuItem
              label="Baixar"
              icon={<Download className="h-4 w-4" />}
              onClick={() => {
                const att = message.attachments!.find((a) => a.url);
                if (!att?.url) return;
                const a = document.createElement("a");
                a.href = att.url;
                a.download = att.name || "arquivo";
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                a.click();
              }}
            />
          ) : null}
          {onForward ? (
            <MenuItem
              label="Encaminhar"
              icon={<Forward className="h-4 w-4" />}
              onClick={() => onForward(message)}
            />
          ) : null}
          <MenuItem
            label={message.pinned ? "Remover destaque" : "Destacar"}
            icon={message.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            onClick={() => onTogglePin(message.id)}
          />
          {onToChecklist ? (
            <MenuItem
              label="Transformar em checklist"
              icon={<CheckSquare className="h-4 w-4" />}
              onClick={() => onToChecklist(message)}
            />
          ) : null}
          {mine && onDelete ? (
            <>
              <div className="my-1 border-t border-border" />
              <MenuItem
                label="Apagar"
                icon={<Trash2 className="h-4 w-4" />}
                danger
                onClick={() => onDelete(message)}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MessageBody({
  message,
  mine,
  first,
  pinned,
  time,
  tick,
  onOpenRecord,
}: {
  message: TeamChatMessage;
  mine: boolean;
  first: boolean;
  pinned: boolean;
  time: string;
  tick?: DeliveryTickStatus;
  onOpenRecord?: (card: OpenCrmCard) => void;
}) {
  const attachments = message.attachments ?? [];
  const stickers = attachments.filter((a) => a.kind === "sticker");
  const media = attachments.filter((a) => a.kind !== "sticker");
  const parsed = parseQuotedContent(message.content);
  const bodyText = parsed.body.trim();
  const hasText = Boolean(bodyText || parsed.quote);
  const showCard = Boolean(
    message.card || (message.anchorRef && message.anchorRef.type !== "work_item"),
  );
  const radius = bubbleRadius(first, mine);
  const bubbleCls = cn(
    "relative w-fit max-w-full",
    radius,
    mine ? "orbita-bubble-sent" : "orbita-bubble-received",
    first && "orbita-bubble--tail",
    pinned && "ring-1 ring-[var(--orbita-selected)]/35",
  );
  const timeCls = cn(
    "select-none text-[12px] leading-none tabular-nums",
    mine ? "text-[var(--orbita-bubble-sent-meta)]" : "text-[var(--orbita-text-tertiary)]",
  );
  const meta = (
    <span className="inline-flex items-center gap-0.5">
      <span className={timeCls}>{time}</span>
      {tick && <StatusTicks status={tick} />}
    </span>
  );

  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      {stickers.map((att, i) => (
        <button
          key={`${att.url}-${att.emoji ?? att.name}-${i}`}
          type="button"
          title="Ctrl+C para copiar"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
              e.preventDefault();
              void copyAttachment(att).catch(() => toast.error("Não foi possível copiar."));
            }
          }}
          onClick={() => void copyAttachment(att).catch(() => toast.error("Não foi possível copiar."))}
          className="relative w-fit text-[56px] leading-none"
        >
          {pinned && !hasText && i === 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--orbita-selected)] text-white">
              <Pin className="h-2.5 w-2.5" />
            </span>
          )}
          {att.emoji ? (
            att.emoji
          ) : att.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={att.url} alt={att.name} className="h-28 w-28 object-contain" />
          ) : (
            "✨"
          )}
          {!hasText && i === stickers.length - 1 && media.length === 0 && (
            <span className="absolute -bottom-4 right-0">{meta}</span>
          )}
        </button>
      ))}
      {media.map((att, i) => {
        const audio = att.kind === "audio";
        const showMeta = !hasText && i === media.length - 1;
        return (
          <div
            key={`${att.url}-${i}`}
            className={cn(
              bubbleCls,
              audio
                ? "flex min-w-[16rem] flex-col gap-1 overflow-visible px-2.5 pb-1.5 pt-2"
                : "overflow-hidden p-1",
            )}
          >
            <MediaChip att={att} />
            {showMeta && audio ? (
              <span className="flex justify-end pr-0.5">{meta}</span>
            ) : showMeta ? (
              <span className="absolute bottom-1.5 right-2 drop-shadow">{meta}</span>
            ) : null}
          </div>
        );
      })}
      {hasText && (
        <div className={cn(bubbleCls, "px-3.5 pb-2.5 pt-2.5")}>
          {pinned && (
            <span
              className={cn(
                "absolute -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[var(--orbita-selected)] text-white",
                mine ? "-left-1.5" : "-right-1.5",
              )}
            >
              <Pin className="h-2.5 w-2.5" />
            </span>
          )}
          {message.forward ? (
            <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide opacity-70">Encaminhada</p>
          ) : null}
          {parsed.quote ? (
            <div
              className={cn(
                "mb-1.5 border-l-2 px-2.5 py-1.5",
                mine ? "border-primary-foreground/50" : "border-primary/50",
              )}
            >
              <p className="truncate text-[13px] font-semibold">{parsed.quote.author}</p>
              <p className="truncate text-[13px] opacity-80">{parsed.quote.excerpt}</p>
            </div>
          ) : null}
          <p className="whitespace-pre-wrap break-words text-[16px] leading-[22px]">
            {bodyText ? formatChatText(bodyText, mine) : null}
            <span className={cn("inline-block", mine ? "w-[78px]" : "w-[52px]")} aria-hidden />
          </p>
          <span className="absolute bottom-[6px] right-[10px]">{meta}</span>
        </div>
      )}
      {showCard ? (
        <div className={cn("w-full", !hasText && "relative")}>
          <LinkedRecordCard
            card={message.card}
            anchorRef={message.anchorRef}
            onOpen={onOpenRecord}
          />
          {!hasText ? <span className="mt-1 flex justify-end">{meta}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function MediaChip({ att }: { att: TeamChatAttachment }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const copy = () =>
    void copyAttachment(att).catch(() =>
      toast.error("Não foi possível copiar. Tente de novo ou baixe o arquivo."),
    );

  if (att.kind === "image") {
    return (
      <>
        <div
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
              e.preventDefault();
              copy();
            }
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setLightboxOpen(true);
            }
          }}
          className="group/media relative w-fit overflow-hidden rounded-[var(--orbita-radius-inner)] outline-none"
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={`Ampliar ${att.name || "imagem"}`}
            className="block cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={att.url}
              alt={att.name}
              className="max-h-80 max-w-[min(22rem,70vw)] object-cover transition-opacity hover:opacity-95"
            />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              copy();
            }}
            aria-label="Copiar imagem"
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white opacity-0 group-hover/media:opacity-100"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
        <ImageLightbox
          src={att.url}
          alt={att.name}
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
        />
      </>
    );
  }

  if (att.kind === "video") {
    return <video src={att.url} controls className="max-h-80 max-w-[min(22rem,70vw)] rounded-[var(--orbita-radius-inner)] bg-black" />;
  }

  if (att.kind === "audio") {
    return (
      <div className="min-w-[240px] px-0.5 py-0.5">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio src={att.url} controls className="w-full max-w-full" />
      </div>
    );
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
          e.preventDefault();
          copy();
        }
      }}
      className="flex w-fit items-center gap-2 px-2.5 py-2 outline-none"
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="max-w-[200px] truncate text-[14px]">{att.name}</span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copiar arquivo"
        className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/20"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <a
        href={att.url}
        download={att.name}
        aria-label="Baixar"
        className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/20"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
