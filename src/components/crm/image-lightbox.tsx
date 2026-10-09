"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { IconDownload, IconExternalLink, IconX } from "@tabler/icons-react";

import { imageDownloadName } from "@/lib/image-download-name";
import { cn } from "@/lib/utils";

/**
 * Lightbox de imagem full-screen.
 *
 * Usado para abrir imagens do chat sem tirar o operador do CRM (antes: `target="_blank"`
 * jogava numa nova aba). Fecha por: clique no backdrop, ESC ou botão X.
 *
 * Renderiza via portal no <body> para escapar de containers com `overflow: hidden`
 * ou `transform` (que quebrariam `position: fixed`).
 */
export function ImageLightbox({
  src,
  alt,
  open,
  onOpenChange,
}: {
  src: string;
  alt?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    // Trava scroll do body enquanto o modal está aberto
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = imageDownloadName({
        suggested: alt,
        contentType: blob.type || res.headers.get("content-type"),
        sourceUrl: src,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: abre em nova aba se o fetch falhar (ex.: CORS).
      window.open(src, "_blank", "noopener,noreferrer");
    }
  };

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center",
        "bg-black/85 backdrop-blur-sm",
        "animate-in fade-in duration-150",
      )}
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Visualizador de imagem"}
    >
      {/* Toolbar */}
      <div
        className="absolute right-4 top-4 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
          aria-label="Baixar imagem"
          title="Baixar"
        >
          <IconDownload size={18} />
        </button>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
          aria-label="Abrir em nova aba"
          title="Abrir em nova aba"
        >
          <IconExternalLink size={18} />
        </a>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
          aria-label="Fechar"
          title="Fechar (Esc)"
        >
          <IconX size={20} />
        </button>
      </div>

      {/* Imagem */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || "Imagem"}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[92vw] cursor-default rounded-[var(--radius-md)] object-contain shadow-2xl"
      />
    </div>,
    document.body,
  );
}
