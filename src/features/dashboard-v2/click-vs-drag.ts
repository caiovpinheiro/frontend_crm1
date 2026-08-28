"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

/** Pixels of movement before a press is treated as a drag (not a click). */
export const DASHBOARD_DRAG_THRESHOLD_PX = 8;

/**
 * Inner controls that must not start a grid drag (links, charts, funnel scroller).
 * The hover grip is excluded so it can still pick up the widget.
 */
export function dashboardGridDragCancel(gripClass: string): string {
  return [
    "a",
    `button:not(.${gripClass})`,
    "input",
    "textarea",
    "select",
    "[role='combobox']",
    ".pipeline-progress-scroller",
    ".recharts-wrapper",
    "[data-dashboard-no-drag]",
  ].join(",");
}

/** Swallow the leftover click that browsers fire after pointerup on a drag. */
export function armSuppressClickAfterDrag(ms = 120): void {
  const onClick = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  document.addEventListener("click", onClick, true);
  window.setTimeout(() => {
    document.removeEventListener("click", onClick, true);
  }, ms);
}

export function useClickVsDrag(threshold = DASHBOARD_DRAG_THRESHOLD_PX) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  return {
    onPointerDown: (event: PointerEvent) => {
      start.current = { x: event.clientX, y: event.clientY };
      dragged.current = false;
    },
    onPointerMove: (event: PointerEvent) => {
      if (!start.current || dragged.current) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (Math.hypot(dx, dy) >= threshold) dragged.current = true;
    },
    onPointerUp: () => {
      start.current = null;
    },
    consumeIfDragged: (event?: MouseEvent) => {
      if (!dragged.current) return false;
      event?.preventDefault();
      event?.stopPropagation();
      dragged.current = false;
      return true;
    },
  };
}
