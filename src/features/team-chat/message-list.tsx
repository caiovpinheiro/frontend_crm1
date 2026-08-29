"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, Fragment } from "react";
import { Copy, Download, FileText, Pin, PinOff, Reply, SmilePlus, X } from "lucide-react";
import { toast } from "sonner";

import { AppLoading } from "@/components/crm/app-loading";
import { StatusTicks, type DeliveryTickStatus } from "@/components/crm/status-ticks";

import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { cn } from "@/lib/utils";

import { Avatar, GroupGlyph } from "./avatar";
import { dayKey, formatClock, formatDayLabel, getOrbitaNameColor, REACTION_EMOJIS, toPerson } from "./helpers";
import type { TeamChatAttachment, TeamChatMessage, TeamChatReaction, TeamChatRoom } from "./types";

function formatChatText(text: string, mine: boolean): ReactNode {
  if (!text) return text;
  const tokenRe = /(==[^=\n]+==|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("==")) {
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
  onToggleReaction,
  onTogglePin,
  onReply,
}: {
  room: TeamChatRoom;
  messages: TeamChatMessage[];
  meId: string;
  error?: string | null;
  onRetry?: () => void;
  query?: string;
  onToggleReaction: (id: string, emoji: string) => void;
  onTogglePin: (id: string) => void;
  onReply?: (message: TeamChatMessage) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const isDirect = room.kind === "DM";
  const q = query.trim().toLowerCase();
  const pinned = messages.filter((m) => m.pinned);
  const visible = useMemo(() => {
    if (!q) return messages;
    return messages.filter(
      (m) => m.kind === "SYSTEM" || m.content.toLowerCase().includes(q) || (m.author?.name ?? "").toLowerCase().includes(q),
    );
  }, [messages, q]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, room.id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {pinned.length > 0 && (
        <div className="sticky top-0 z-10 shrink-0 bg-[var(--orbita-block-soft)] px-4 py-2">
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
      <div className="chat-scroll flex-1 overflow-y-auto px-4 py-3 md:px-10">
        <div className="flex min-h-full w-full flex-col">
          <div className="mb-4 flex justify-center">
            <div className="flex max-w-sm flex-col items-center rounded-2xl bg-[var(--orbita-block)]/92 px-6 py-5 text-center shadow-sm">
              {isDirect && room.peer ? (
                <Avatar person={toPerson(room.peer)} size="lg" showPresence />
              ) : (
                <GroupGlyph seed={room.id} size={56} />
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
                      <span className="rounded-[var(--orbita-radius-inner)] bg-[var(--orbita-block-soft)] px-3 py-1 text-[12px] text-muted-foreground">
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
                        <span className="rounded-full bg-[var(--orbita-block)] px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-sm">
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
                      peerOnline={
                        isDirect
                          ? Boolean(room.peer?.systemOnline)
                          : room.members.some((m) => m.id !== meId && m.systemOnline)
                      }
                      onToggleReaction={onToggleReaction}
                      onTogglePin={onTogglePin}
                      onReply={onReply}
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
    </div>
  );
}

function bubbleRadius(_first: boolean, _mine: boolean) {
  return "rounded-[16px]";
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
  peerOnline,
  onToggleReaction,
  onTogglePin,
  onReply,
}: {
  message: TeamChatMessage;
  meId: string;
  authorName: string;
  author: ReturnType<typeof toPerson> | null;
  first: boolean;
  last: boolean;
  mine: boolean;
  showName: boolean;
  peerOnline: boolean;
  onToggleReaction: (id: string, emoji: string) => void;
  onTogglePin: (id: string) => void;
  onReply?: (message: TeamChatMessage) => void;
}) {
  const [picker, setPicker] = useState(false);
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
    <div className={cn("flex w-full flex-col", mine ? "items-end" : "items-start", first ? "mt-3" : "mt-[2px]")}>
      <div
        className={cn(
          "group/msg flex max-w-[65%] items-end gap-1.5",
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
          <div className={cn("relative w-fit max-w-full", reactions.length > 0 && "mb-3")}>
            <MessageBody
              message={message}
              mine={mine}
              first={first}
              pinned={message.pinned}
              time={formatClock(message.createdAt)}
              tick={tick}
            />
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
                        : "bg-[var(--orbita-block)] text-[var(--orbita-text)]",
                    )}
                  >
                    <span>{r.emoji}</span>
                    {r.count > 1 && <span className="text-[10px] font-semibold opacity-70">{r.count}</span>}
                  </button>
                ))}
              </div>
            )}
            <div
              className={cn(
                "absolute top-0 z-10 -translate-y-full items-center rounded-full bg-[var(--orbita-block)] pb-1 shadow-sm",
                mine ? "right-0" : "left-0",
                picker ? "flex" : "hidden group-hover/msg:flex",
              )}
            >
              {(message.attachments ?? []).length > 0 && (
                <TooltipGlass label="Copiar" side="top">
                  <button
                    type="button"
                    onClick={() => {
                      const firstAtt = message.attachments![0];
                      void copyAttachment(firstAtt).catch(() => toast.error("Não foi possível copiar."));
                    }}
                    aria-label="Copiar"
                    className="grid h-7 w-7 place-items-center text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </TooltipGlass>
              )}
              {onReply && (
                <TooltipGlass label="Responder" side="top">
                  <button
                    type="button"
                    onClick={() => onReply(message)}
                    aria-label="Responder"
                    className="grid h-7 w-7 place-items-center text-muted-foreground hover:text-foreground"
                  >
                    <Reply className="h-3.5 w-3.5" />
                  </button>
                </TooltipGlass>
              )}
              <TooltipGlass label="Reagir" side="top">
                <button
                  type="button"
                  onClick={() => setPicker((v) => !v)}
                  aria-label="Reagir"
                  className="grid h-7 w-7 place-items-center text-muted-foreground hover:text-foreground"
                >
                  <SmilePlus className="h-3.5 w-3.5" />
                </button>
              </TooltipGlass>
              <TooltipGlass label={message.pinned ? "Remover destaque" : "Destacar"} side="top">
                <button
                  type="button"
                  onClick={() => onTogglePin(message.id)}
                  aria-label={message.pinned ? "Remover destaque" : "Destacar"}
                  className={cn(
                    "grid h-7 w-7 place-items-center hover:text-foreground",
                    message.pinned ? "text-[var(--orbita-selected)]" : "text-muted-foreground",
                  )}
                >
                  {message.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </button>
              </TooltipGlass>
              {picker && (
                <div
                  className={cn(
                    "absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full bg-[var(--orbita-block)] p-1 shadow-lg",
                    mine ? "right-0" : "left-0",
                  )}
                >
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onToggleReaction(message.id, emoji);
                        setPicker(false);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-full text-base hover:bg-[var(--orbita-block-soft)]"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
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
  const hasText = message.content.trim().length > 0;
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
      {media.map((att, i) => (
        <div key={`${att.url}-${i}`} className={cn(bubbleCls, "overflow-hidden p-1")}>
          <MediaChip att={att} />
          {!hasText && i === media.length - 1 && (
            <span className="absolute bottom-1.5 right-2 drop-shadow">{meta}</span>
          )}
        </div>
      ))}
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
          <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[20px]">
            {formatChatText(message.content, mine)}
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
      <div className="min-w-[220px] px-2 py-1">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio src={att.url} controls className="h-9 w-full" />
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
