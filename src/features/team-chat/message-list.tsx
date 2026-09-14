"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, Fragment } from "react";
import { CheckSquare, ChevronDown, Copy, Download, FileText, Forward, Pin, PinOff, Reply, Smile, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AppLoading } from "@/components/crm/app-loading";
import { StatusTicks, type DeliveryTickStatus } from "@/components/crm/status-ticks";

import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { cn } from "@/lib/utils";

import { Avatar, GroupGlyph } from "./avatar";
import { dayKey, formatClock, formatDayLabel, getOrbitaNameColor, parseQuotedContent, REACTION_EMOJIS, toPerson } from "./helpers";
import type { TeamChatAttachment, TeamChatMessage, TeamChatReaction, TeamChatRoom, WorkItem } from "./types";
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
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--orbita-text-secondary)]">
                Destacadas
              </p>
              {pinned.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[13px] text-foreground">
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
        <div className="flex min-h-full w-full flex-col justify-end px-3 py-3 md:px-10">
          <div className="mb-3 flex justify-center">
            <div className="flex max-w-sm flex-col items-center rounded-2xl border border-border bg-[var(--orbita-block)] px-6 py-5 text-center">
              {isDirect && room.peer ? (
                <Avatar person={toPerson(room.peer)} size="lg" showPresence />
              ) : (
                <GroupGlyph seed={room.id} size={56} imageUrl={room.avatarUrl} name={room.name} />
              )}
              <p className="mt-3 text-[15px] font-semibold text-[var(--orbita-text)]">
                {isDirect ? room.name : `#${room.name}`}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--orbita-text-secondary)]">
                {isDirect
                  ? "Este é o início da sua conversa."
                  : room.topic || `Este é o início do canal #${room.name}.`}
              </p>
            </div>
          </div>
          {q && visible.every((m) => m.kind === "SYSTEM") && !visible.some((m) => m.content.toLowerCase().includes(q)) ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</p>
          ) : (
            <div className="flex flex-col">
              {visible.map((msg, i) => {
                if (msg.kind === "SYSTEM") {
                  return (
                    <div key={msg.id} className="my-2 flex justify-center">
                      <span className="rounded-[var(--orbita-radius-inner)] border border-border bg-[var(--orbita-block-soft)] px-3 py-1 text-[12px] text-muted-foreground">
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
                      <div className="sticky top-2 z-[2] my-3 flex justify-center">
                        <span className="rounded-full border border-border bg-[var(--orbita-block)] px-3 py-1 text-[12px] font-medium text-muted-foreground">
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
}) {
  const [, bumpTick] = useState(0);
  const reactions = message.reactions ?? [];
  const tick = tickStatus(mine, peerOnline, message.createdAt);

  useEffect(() => {
    if (!mine) return;
    const age = Date.now() - new Date(message.createdAt).getTime();
    if (!Number.isFinite(age) || age >= 1800) return;
    const t = window.setTimeout(() => bumpTick((n) => n + 1), 1800 - age);
    return () => window.clearTimeout(t);
  }, [mine, message.createdAt]);
  return (
    <div className={cn("isolate flex w-full flex-col", mine ? "items-end" : "items-start", first ? "mt-3" : "mt-[2px]")}>
      <div
        className={cn(
          "flex items-end gap-1.5",
          workItem ? "max-w-[min(65%,28rem)]" : "w-fit max-w-[min(65%,42rem)]",
          mine ? "flex-row-reverse" : "flex-row",
        )}
      >
        {!mine && (
          <div className="flex w-7 shrink-0 justify-center self-end">
            {last && author ? <Avatar person={author} size="xs" /> : null}
          </div>
        )}
        <div className={cn("flex min-w-0 flex-col", mine ? "items-end" : "items-start")}>
          {first && showName && !mine && (
            <span
              className="mb-0.5 px-1 text-[12.5px] font-medium"
              style={{ color: author ? getOrbitaNameColor(author.id) : "var(--orbita-text)" }}
            >
              {authorName}
            </span>
          )}
          <div className={cn("group/bubble relative w-fit max-w-full", reactions.length > 0 && "mb-3")}>
            {workItem ? (
              <WorkItemCard
                item={workItem}
                meId={meId}
                onChange={onWorkItemChange}
                onDeleted={onWorkItemDeleted}
                onLinkRecord={onLinkRecord}
              />
            ) : (
            <MessageBody
              message={message}
              mine={mine}
              first={first}
              pinned={message.pinned}
              time={formatClock(message.createdAt)}
              tick={tick}
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
  onToggleReaction,
  onTogglePin,
  onReply,
  onToChecklist,
  onForward,
  onDelete,
}: {
  message: TeamChatMessage;
  mine: boolean;
  onToggleReaction: (id: string, emoji: string) => void;
  onTogglePin: (id: string) => void;
  onReply?: (message: TeamChatMessage) => void;
  onToChecklist?: (message: TeamChatMessage) => void;
  onForward?: (message: TeamChatMessage) => void;
  onDelete?: (message: TeamChatMessage) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  return (
    <div
      ref={boxRef}
      className={cn(
        "absolute top-1/2 z-20 -translate-y-1/2",
        mine ? "right-full mr-1" : "left-full ml-1",
        open ? "flex" : "hidden group-hover/bubble:flex",
      )}
    >
      <TooltipGlass label="Reagir" side="top">
        <button
          type="button"
          aria-label="Reagir"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-[0_4px_16px_rgba(15,23,42,0.12)] hover:bg-muted hover:text-foreground"
        >
          <Smile className="h-4 w-4" />
        </button>
      </TooltipGlass>
      {open ? (
        <div
          className={cn(
            "absolute top-full z-30 mt-1 min-w-[12.5rem] rounded-2xl border border-border bg-card p-1 shadow-[0_8px_24px_rgba(15,23,42,0.16)]",
            mine ? "right-0" : "left-0",
          )}
        >
          <div className="flex items-center justify-center gap-0.5 px-0.5 py-0.5">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onToggleReaction(message.id, emoji);
                  setOpen(false);
                }}
                aria-label={`Reagir com ${emoji}`}
                className="grid h-8 w-8 place-items-center rounded-full text-[18px] leading-none hover:bg-muted hover:scale-110"
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="mt-0.5 flex items-center gap-0.5 border-t border-border px-0.5 pt-1">
            {(message.attachments ?? []).length > 0 && (
              <TooltipGlass label="Copiar" side="bottom">
                <button
                  type="button"
                  onClick={() => {
                    const firstAtt = message.attachments![0];
                    void copyAttachment(firstAtt).catch(() => toast.error("Não foi possível copiar."));
                    setOpen(false);
                  }}
                  aria-label="Copiar"
                  className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </TooltipGlass>
            )}
            <TooltipGlass label="Copiar" side="bottom">
              <button
                type="button"
                onClick={() => {
                  const parsed = parseQuotedContent(message.content);
                  const text = parsed.body.trim() || parsed.quote?.excerpt || message.content;
                  void navigator.clipboard.writeText(text).then(
                    () => toast.success("Copiado."),
                    () => toast.error("Não foi possível copiar."),
                  );
                  setOpen(false);
                }}
                aria-label="Copiar texto"
                className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </TooltipGlass>
            {onForward && (
              <TooltipGlass label="Encaminhar" side="bottom">
                <button
                  type="button"
                  onClick={() => {
                    onForward(message);
                    setOpen(false);
                  }}
                  aria-label="Encaminhar"
                  className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Forward className="h-3.5 w-3.5" />
                </button>
              </TooltipGlass>
            )}
            {onReply && (
              <TooltipGlass label="Responder" side="bottom">
                <button
                  type="button"
                  onClick={() => {
                    onReply(message);
                    setOpen(false);
                  }}
                  aria-label="Responder"
                  className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Reply className="h-3.5 w-3.5" />
                </button>
              </TooltipGlass>
            )}
            {onToChecklist && (
              <TooltipGlass label="Transformar em checklist" side="bottom">
                <button
                  type="button"
                  onClick={() => {
                    onToChecklist(message);
                    setOpen(false);
                  }}
                  aria-label="Transformar em checklist"
                  className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                </button>
              </TooltipGlass>
            )}
            <TooltipGlass label={message.pinned ? "Remover destaque" : "Destacar"} side="bottom">
              <button
                type="button"
                onClick={() => {
                  onTogglePin(message.id);
                  setOpen(false);
                }}
                aria-label={message.pinned ? "Remover destaque" : "Destacar"}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full hover:bg-muted hover:text-foreground",
                  message.pinned ? "text-primary" : "text-muted-foreground",
                )}
              >
                {message.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </button>
            </TooltipGlass>
            {mine && onDelete && (
              <TooltipGlass label="Apagar" side="bottom">
                <button
                  type="button"
                  onClick={() => {
                    onDelete(message);
                    setOpen(false);
                  }}
                  aria-label="Apagar mensagem"
                  className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TooltipGlass>
            )}
          </div>
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
}: {
  message: TeamChatMessage;
  mine: boolean;
  first: boolean;
  pinned: boolean;
  time: string;
  tick?: DeliveryTickStatus;
}) {
  const attachments = message.attachments ?? [];
  const stickers = attachments.filter((a) => a.kind === "sticker");
  const media = attachments.filter((a) => a.kind !== "sticker");
  const parsed = parseQuotedContent(message.content);
  const bodyText = parsed.body.trim();
  const hasText = Boolean(bodyText || parsed.quote);
  const radius = bubbleRadius(first, mine);
  const bubbleCls = cn(
    "relative w-fit max-w-full",
    radius,
    mine ? "orbita-bubble-sent" : "orbita-bubble-received",
    first && "orbita-bubble--tail",
    pinned && "ring-1 ring-[var(--orbita-selected)]/35",
  );
  const timeCls = cn(
    "select-none text-[11px] leading-none tabular-nums",
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
        <div className={cn(bubbleCls, "px-3 pb-2 pt-2")}>
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
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">Encaminhada</p>
          ) : null}
          {parsed.quote ? (
            <div
              className={cn(
                "mb-1.5 border-l-2 px-2 py-1",
                mine ? "border-primary-foreground/50" : "border-primary/50",
              )}
            >
              <p className="truncate text-[12px] font-semibold">{parsed.quote.author}</p>
              <p className="truncate text-[12px] opacity-80">{parsed.quote.excerpt}</p>
            </div>
          ) : null}
          <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[20px]">
            {bodyText ? formatChatText(bodyText, mine) : null}
            <span className={cn("inline-block", mine ? "w-[72px]" : "w-[46px]")} aria-hidden />
          </p>
          <span className="absolute bottom-[5px] right-[8px]">{meta}</span>
        </div>
      )}
    </div>
  );
}

function MediaChip({ att }: { att: TeamChatAttachment }) {
  const copy = () =>
    void copyAttachment(att).catch(() =>
      toast.error("Não foi possível copiar. Tente de novo ou baixe o arquivo."),
    );

  if (att.kind === "image") {
    return (
      <div
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
            e.preventDefault();
            copy();
          }
        }}
        className="group/media relative w-fit overflow-hidden rounded-[var(--orbita-radius-inner)] outline-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={att.url} alt={att.name} className="max-h-72 max-w-[18rem] object-cover" />
        <button
          type="button"
          onClick={copy}
          aria-label="Copiar imagem"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white opacity-0 group-hover/media:opacity-100"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (att.kind === "video") {
    return <video src={att.url} controls className="max-h-72 max-w-[18rem] rounded-[var(--orbita-radius-inner)] bg-black" />;
  }

  if (att.kind === "audio") {
    return (
      <div className="min-w-[220px] px-0.5 py-0.5">
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
      className="flex w-fit items-center gap-2 px-2 py-1.5 outline-none"
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="max-w-[180px] truncate text-[13px]">{att.name}</span>
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
