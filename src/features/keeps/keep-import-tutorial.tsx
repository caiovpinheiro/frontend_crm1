"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Player isolado: HTML estático em aba nova (sem React, sem iframe do CRM).
 */
export const GOOGLE_KEEP_TUTORIAL_PLAYER = "/tutorials/como-importar-google-keep.html";

export function KeepImportTutorial({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-(--z-modal) flex flex-col bg-foreground">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-semibold text-background">Como importar Keeps</p>
        <button
          type="button"
          aria-label="Fechar"
          className="flex size-9 items-center justify-center rounded-full text-background/80 hover:bg-background/10 hover:text-background"
          onClick={() => closeRef.current()}
        >
          <X className="size-5" />
        </button>
      </div>
      <iframe
        title="Como importar Keeps"
        src={GOOGLE_KEEP_TUTORIAL_PLAYER}
        className="min-h-0 w-full flex-1 border-0 bg-foreground"
        allow="autoplay"
      />
    </div>,
    document.body,
  );
}
