"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, Play, Sparkles } from "lucide-react";

import { useModalPortalContainer } from "@/components/ui/modal-portal-context";
import { cn } from "@/lib/utils";

import { hasTour } from "./tour-registry";
import { startPageTour } from "./start-tour";

const TOUR_GRADIENT_BR = "bg-linear-to-br from-brand to-accent-violet";
const TOUR_GRADIENT_R = "bg-linear-to-r from-brand to-accent-violet";

function tourActionLabel(tourId: string): string {
  if (
    tourId === "automations-create" ||
    tourId === "campaigns-create" ||
    tourId === "contacts-create" ||
    tourId === "custom-fields-create" ||
    tourId === "team-user-create" ||
    tourId === "team-schedule-create" ||
    tourId === "team-department-create" ||
    tourId === "message-models-create" ||
    tourId === "message-models-internal-create" ||
    tourId === "message-models-whatsapp-create" ||
    tourId === "tabulations-create" ||
    tourId === "tasks-create"
  ) {
    return "Fazer tour da criação";
  }
  if (tourId === "distribution-edit") return "Fazer tour da edição";
  if (tourId === "automations-builder") return "Fazer tour do builder";
  if (tourId === "campaigns-detail") return "Fazer tour desta campanha";
  if (tourId === "contacts-columns") return "Fazer tour das colunas";
  if (tourId === "contacts-duplicates") return "Fazer tour das duplicadas";
  return "Fazer tour desta página";
}

/**
 * Gatilho compacto de ajuda no header. Não inicia o tour sozinho:
 * o Driver.js só roda depois do item de iniciar o tour.
 */
export function PageTourButton({
  tourId,
  size = "md",
  onStartTour,
}: {
  tourId: string;
  size?: "sm" | "md";
  onStartTour?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const portalTarget = useModalPortalContainer();

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const box = trigger.getBoundingClientRect();
      setCoords({
        top: box.bottom + 8,
        right: Math.max(8, window.innerWidth - box.right),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!hasTour(tourId)) return null;

  const compact = size === "sm";

  const startTour = () => {
    setOpen(false);
    window.setTimeout(() => {
      if (onStartTour) onStartTour();
      else startPageTour(tourId);
    }, 60);
  };

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Abrir ajuda"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex items-center justify-center rounded-full text-brand-foreground shadow-md shadow-brand/25 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          TOUR_GRADIENT_BR,
          compact ? "size-8" : "size-9",
          open && "ring-2 ring-brand/25",
        )}
      >
        <HelpCircle className="size-4" aria-hidden="true" />
      </button>

      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label="Ajuda"
              style={{ top: coords.top, right: coords.right }}
              className="fixed z-(--z-popover) w-60 origin-top-right overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/5 animate-in fade-in zoom-in-95 duration-150 ease-out"
            >
              <div className={cn("flex items-center gap-2 px-3.5 py-2.5", TOUR_GRADIENT_R)}>
                <Sparkles className="size-3.5 text-white/90" aria-hidden="true" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/90">
                  Ajuda
                </p>
              </div>
              <div className="p-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={startTour}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <Play className="size-3 fill-current" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {tourActionLabel(tourId)}
                  </span>
                </button>
              </div>
            </div>,
            portalTarget ?? document.body,
          )
        : null}
    </div>
  );
}
