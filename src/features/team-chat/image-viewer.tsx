"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Forward,
  Pin,
  PinOff,
  RotateCcw,
  RotateCw,
  Smile,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { Avatar } from "./avatar";
import type { ChatPerson } from "./helpers";
import { REACTION_EMOJIS } from "./helpers";

export type TeamChatImageViewerItem = {
  url: string;
  name?: string;
};

/**
 * Visualizador de imagens estilo WhatsApp Web para o Bwipo Chat.
 * Galeria (setas / thumbnails / contador), zoom, rotação e ações da mensagem quando disponíveis.
 */
export function TeamChatImageViewer({
  open,
  onOpenChange,
  images,
  index,
  onIndexChange,
  authorName,
  author,
  whenLabel,
  pinned,
  onTogglePin,
  onToggleReaction,
  onForward,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: TeamChatImageViewerItem[];
  index: number;
  onIndexChange: (index: number) => void;
  authorName: string;
  author?: ChatPerson | null;
  whenLabel: string;
  pinned?: boolean;
  onTogglePin?: () => void;
  onToggleReaction?: (emoji: string) => void;
  onForward?: () => void;
  onDelete?: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [scale, setScale] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);
  const [reactOpen, setReactOpen] = React.useState(false);
  const reactRef = React.useRef<HTMLDivElement>(null);

  const count = images.length;
  const safeIndex = count > 0 ? Math.min(Math.max(index, 0), count - 1) : 0;
  const current = images[safeIndex];
  const multi = count > 1;

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    setScale(1);
    setRotation(0);
    setReactOpen(false);
  }, [open, safeIndex]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
        return;
      }
      if (!multi) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onIndexChange((safeIndex - 1 + count) % count);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onIndexChange((safeIndex + 1) % count);
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onOpenChange, onIndexChange, multi, safeIndex, count]);

  React.useEffect(() => {
    if (!reactOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (!reactRef.current?.contains(e.target as Node)) setReactOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [reactOpen]);

  if (!mounted || !open || !current) return null;

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(current.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = current.name?.replace(/[^\w.-]+/g, "_") || "imagem";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(current.url, "_blank", "noopener,noreferrer");
    }
  };

  const zoomIn = () => setScale((s) => Math.min(3, Math.round((s + 0.25) * 100) / 100));
  const zoomOut = () => setScale((s) => Math.max(0.5, Math.round((s - 0.25) * 100) / 100));
  const fit = () => {
    setScale(1);
    setRotation(0);
  };

  const toolBtn =
    "inline-flex size-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 disabled:pointer-events-none disabled:opacity-35";

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col",
        "bg-[#0b141a]",
        "animate-in fade-in duration-150",
      )}
      role="dialog"
      aria-modal="true"
      aria-label={current.name || "Visualizador de imagem"}
      onClick={() => onOpenChange(false)}
    >
      {/* Header */}
      <header
        className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-3 py-2.5 sm:px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-3">
          {author ? <Avatar person={author} size="xs" /> : (
            <span className="grid size-7 place-items-center rounded-full bg-white/15 text-[12px] font-semibold text-white">
              {authorName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium leading-tight text-white">{authorName}</p>
            <p className="truncate text-[12.5px] leading-tight text-white/55">{whenLabel}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" className={toolBtn} onClick={zoomIn} aria-label="Aumentar zoom" title="Zoom +">
            <ZoomIn className="h-[18px] w-[18px]" />
          </button>
          <button type="button" className={toolBtn} onClick={zoomOut} aria-label="Diminuir zoom" title="Zoom −">
            <ZoomOut className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            className={toolBtn}
            onClick={() => setRotation((r) => r - 90)}
            aria-label="Girar à esquerda"
            title="Girar esquerda"
          >
            <RotateCcw className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            className={toolBtn}
            onClick={() => setRotation((r) => r + 90)}
            aria-label="Girar à direita"
            title="Girar direita"
          >
            <RotateCw className="h-[18px] w-[18px]" />
          </button>
          {(scale !== 1 || rotation !== 0) && (
            <button type="button" className={toolBtn} onClick={fit} aria-label="Ajustar à tela" title="Ajustar">
              <span className="text-[11px] font-semibold tracking-wide">1:1</span>
            </button>
          )}
          {onTogglePin ? (
            <button
              type="button"
              className={toolBtn}
              onClick={onTogglePin}
              aria-label={pinned ? "Remover destaque" : "Destacar"}
              title={pinned ? "Remover destaque" : "Destacar"}
            >
              {pinned ? <PinOff className="h-[18px] w-[18px]" /> : <Pin className="h-[18px] w-[18px]" />}
            </button>
          ) : null}
          {onToggleReaction ? (
            <div className="relative" ref={reactRef}>
              <button
                type="button"
                className={cn(toolBtn, reactOpen && "bg-white/15")}
                onClick={() => setReactOpen((v) => !v)}
                aria-label="Reagir"
                title="Reagir"
              >
                <Smile className="h-[18px] w-[18px]" />
              </button>
              {reactOpen ? (
                <div className="absolute right-0 top-full z-30 mt-1 flex items-center gap-0.5 rounded-full border border-white/10 bg-[#1f2c33] px-1.5 py-1 shadow-xl">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onToggleReaction(emoji);
                        setReactOpen(false);
                      }}
                      aria-label={`Reagir com ${emoji}`}
                      className="grid size-8 place-items-center rounded-full text-[18px] transition-transform hover:scale-110 hover:bg-white/10"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className={toolBtn}
              onClick={() => {
                onDelete();
                onOpenChange(false);
              }}
              aria-label="Apagar"
              title="Apagar"
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </button>
          ) : null}
          {onForward ? (
            <button
              type="button"
              className={toolBtn}
              onClick={() => {
                onForward();
                onOpenChange(false);
              }}
              aria-label="Encaminhar"
              title="Encaminhar"
            >
              <Forward className="h-[18px] w-[18px]" />
            </button>
          ) : null}
          <button type="button" className={toolBtn} onClick={handleDownload} aria-label="Baixar" title="Baixar">
            <Download className="h-[18px] w-[18px]" />
          </button>
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            className={toolBtn}
            aria-label="Abrir em nova aba"
            title="Abrir em nova aba"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-[18px] w-[18px]" />
          </a>
          <button
            type="button"
            className={toolBtn}
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            title="Fechar (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Stage */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-12 pb-2 pt-1">
        {multi ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onIndexChange((safeIndex - 1 + count) % count);
              }}
              className="absolute left-3 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
              aria-label="Imagem anterior"
            >
              <ChevronLeft className="h-7 w-7" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onIndexChange((safeIndex + 1) % count);
              }}
              className="absolute right-3 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
              aria-label="Próxima imagem"
            >
              <ChevronRight className="h-7 w-7" strokeWidth={1.75} />
            </button>
          </>
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.name || "Imagem"}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[min(78vh,calc(100%-4rem))] max-w-[min(92vw,56rem)] cursor-default object-contain select-none transition-transform duration-150"
          style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
          draggable={false}
        />

        {multi ? (
          <p
            className="mt-3 shrink-0 text-[13px] tabular-nums text-white/70"
            onClick={(e) => e.stopPropagation()}
          >
            {safeIndex + 1} de {count}
          </p>
        ) : null}
      </div>

      {/* Thumbnails */}
      {multi ? (
        <div
          className="relative z-20 flex shrink-0 justify-center gap-2 px-4 pb-4 pt-1"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, i) => {
            const active = i === safeIndex;
            return (
              <button
                key={`${img.url}-${i}`}
                type="button"
                onClick={() => onIndexChange(i)}
                aria-label={`Ir para imagem ${i + 1}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "overflow-hidden rounded-[3px] transition-opacity",
                  active
                    ? "ring-2 ring-[var(--orbita-selected,#25d366)] ring-offset-1 ring-offset-[#0b141a] opacity-100"
                    : "opacity-55 hover:opacity-90",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt=""
                  className="h-12 w-[4.25rem] object-cover"
                  draggable={false}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
