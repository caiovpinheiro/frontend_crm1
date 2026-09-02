"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { registerBuilderTourBridge } from "@/features/product-tour";

import type { ActionStepType } from "@/lib/automation-workflow";
import { NodePalette } from "./node-palette";

const PIN_KEY = "automations.blocksDrawer.pinned";

function readPinned(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PIN_KEY) === "1";
  } catch {
    return false;
  }
}

function writePinned(next: boolean) {
  try {
    window.localStorage.setItem(PIN_KEY, next ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
}

/**
 * Gaveta esquerda de Blocos: pinada (dock, ocupa largura) ou solta
 * (overlay; fecha no clique fora / Escape / após arrastar). Default
 * unpinned+fechada — o canvas fica largo; a aba "Blocos" reabre.
 */
export function NodePaletteDrawer({
  onAdd,
}: {
  onAdd?: (type: ActionStepType) => void;
}) {
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isPinned = readPinned();
    setPinned(isPinned);
    if (isPinned) setOpen(true);
  }, []);

  const togglePinned = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      writePinned(next);
      if (next) setOpen(true);
      return next;
    });
  }, []);

  const visible = pinned || open;

  useEffect(() => {
    return registerBuilderTourBridge({
      openPalette: () => setOpen(true),
    });
  }, []);

  useEffect(() => {
    if (pinned || !open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest(".driver-overlay, .driver-popover")
      ) {
        return;
      }
      if (drawerRef.current?.contains(target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pinned, open]);

  useEffect(() => {
    if (pinned || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.querySelector(".driver-overlay")) return;
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pinned, open]);

  return (
    <>
      {!visible ? (
        <button
          type="button"
          aria-label="Blocos"
          aria-expanded={false}
          aria-controls="automations-blocks-drawer"
          onClick={() => setOpen(true)}
          className={cn(
            "absolute top-1/2 left-0 z-20 hidden -translate-y-1/2 md:flex",
            "h-28 w-8 items-center justify-center rounded-r-xl",
            "border border-l-0 border-[var(--glass-border)]",
            "bg-[var(--glass-bg-base)] text-[var(--text-primary)]",
            "shadow-[var(--glass-shadow-sm)] backdrop-blur-xl",
            "transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--brand-primary)]"
          )}
        >
          <span className="text-[11px] font-bold tracking-wide [writing-mode:vertical-lr] rotate-180">
            Blocos
          </span>
        </button>
      ) : null}

      <div
        id="automations-blocks-drawer"
        ref={drawerRef}
        aria-hidden={!visible}
        {...(visible ? { "data-tour": "builder-palette" } : {})}
        onDragEnd={() => {
          if (!pinned) setOpen(false);
        }}
        className={cn(
          "hidden min-h-0 md:flex",
          pinned
            ? "relative w-[240px] shrink-0"
            : cn(
                "absolute inset-y-0 left-0 z-30 w-[240px] shadow-[var(--glass-shadow-sm)]",
                "transition-transform motion-reduce:transition-none",
                open
                  ? "translate-x-0 duration-[var(--drawer-duration)] ease-[var(--ease-drawer-open)]"
                  : "-translate-x-full pointer-events-none duration-[var(--drawer-duration-close)] ease-[var(--ease-drawer-close)]"
              )
        )}
      >
        <NodePalette
          className="h-full w-full"
          pinned={pinned}
          onTogglePin={togglePinned}
          onAdd={
            onAdd
              ? (type) => {
                  onAdd(type);
                  if (!pinned) setOpen(false);
                }
              : undefined
          }
        />
      </div>
    </>
  );
}
