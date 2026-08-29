"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import GridLayout, { useContainerWidth, verticalCompactor } from "react-grid-layout";
import { GripVertical } from "lucide-react";

import {
  armSuppressClickAfterDrag,
  DASHBOARD_DRAG_THRESHOLD_PX,
  dashboardGridDragCancel,
} from "@/features/dashboard-v2/click-vs-drag";
import {
  DASHBOARD_GRID_COLS,
  DASHBOARD_GRID_MARGIN,
  DASHBOARD_GRID_ROW_HEIGHT,
  compactNegociosLayout,
  gridRowsForPx,
  sameLayout,
  type Layout,
} from "@/features/dashboard-v2/use-negocios-grid";
import { cn } from "@/lib/utils";

import "react-grid-layout/css/styles.css";

export const DASHBOARD_GRID_GRIP_CLASS = "dashboard-grid-grip";
export const DASHBOARD_GRID_DRAG_SURFACE = "dashboard-grid-drag-surface";

const GRID_CONFIG = {
  cols: DASHBOARD_GRID_COLS,
  rowHeight: DASHBOARD_GRID_ROW_HEIGHT,
  margin: DASHBOARD_GRID_MARGIN,
  containerPadding: [0, 0] as [number, number],
};

function shouldAutoSize(id: string) {
  return id !== "evolution";
}

export function SortableWidgetGrid({
  layout,
  onLayoutChange,
  labels,
  render,
  disabled = false,
  persistEnabled = true,
}: {
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  labels: Record<string, string>;
  render: (id: string) => ReactNode;
  disabled?: boolean;
  persistEnabled?: boolean;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const ids = useMemo(() => layout.map((item) => item.i), [layout]);
  const layoutRef = useRef(layout);
  const interactingRef = useRef(false);
  const applyingRef = useRef(false);
  const pendingHeights = useRef(new Map<string, number>());
  const heightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  layoutRef.current = layout;

  const commit = useCallback(
    (next: Layout) => {
      if (!persistEnabled) return;
      const compacted = compactNegociosLayout(next);
      if (sameLayout(compacted, layoutRef.current)) return;
      applyingRef.current = true;
      onLayoutChange(compacted);
      queueMicrotask(() => {
        applyingRef.current = false;
      });
    },
    [onLayoutChange, persistEnabled],
  );

  const flushHeights = useCallback(() => {
    if (interactingRef.current) return;
    const current = layoutRef.current;
    let next = current;
    let changed = false;
    pendingHeights.current.forEach((rows, id) => {
      const item = next.find((entry) => entry.i === id);
      if (!item || item.h === rows) return;
      next = next.map((entry) => (entry.i === id ? { ...entry, h: rows } : entry));
      changed = true;
    });
    pendingHeights.current.clear();
    if (changed) commit(next);
  }, [commit]);

  useEffect(() => {
    if (disabled) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.gridMeasure;
        if (!id || !shouldAutoSize(id)) continue;
        const item = layoutRef.current.find((row) => row.i === id);
        const rows = gridRowsForPx(
          (entry.target as HTMLElement).offsetHeight,
          item?.minH ?? 2,
        );
        if (!item || item.h === rows) continue;
        pendingHeights.current.set(id, rows);
      }
      if (pendingHeights.current.size === 0) return;
      if (heightTimer.current) clearTimeout(heightTimer.current);
      heightTimer.current = setTimeout(flushHeights, 80);
    });
    const root = containerRef.current;
    if (!root) return undefined;
    root.querySelectorAll<HTMLElement>("[data-grid-measure]").forEach((el) => {
      if (shouldAutoSize(el.dataset.gridMeasure ?? "")) observer.observe(el);
    });
    return () => {
      observer.disconnect();
      if (heightTimer.current) clearTimeout(heightTimer.current);
    };
  }, [containerRef, disabled, flushHeights, ids, mounted, width]);

  if (disabled) {
    return (
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-12">
        {ids.map((id) => {
          const item = layout.find((entry) => entry.i === id);
          const span = item?.w ?? 12;
          return (
            <div
              key={id}
              className="min-w-0"
              style={{ gridColumn: `span ${span} / span ${span}` }}
            >
              {render(id)}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="negocios-grid min-w-0">
      {mounted && width > 0 ? (
        <GridLayout
          width={width}
          layout={layout}
          autoSize
          gridConfig={GRID_CONFIG}
          dragConfig={{
            enabled: true,
            handle: `.${DASHBOARD_GRID_DRAG_SURFACE}`,
            threshold: DASHBOARD_DRAG_THRESHOLD_PX,
            cancel: dashboardGridDragCancel(DASHBOARD_GRID_GRIP_CLASS),
          }}
          resizeConfig={{ enabled: true, handles: ["se"] }}
          compactor={verticalCompactor}
          onLayoutChange={() => {
            /* Persist only from drag/resize stop and auto-size — not mount. */
          }}
          onDragStart={() => {
            interactingRef.current = true;
            armSuppressClickAfterDrag();
          }}
          onDragStop={(next) => {
            interactingRef.current = false;
            if (Array.isArray(next)) commit(next as Layout);
          }}
          onResizeStart={() => {
            interactingRef.current = true;
          }}
          onResizeStop={(next) => {
            interactingRef.current = false;
            if (Array.isArray(next)) commit(next as Layout);
          }}
        >
          {ids.map((id) => (
            <div key={id} className={cn("group/widget relative min-w-0", DASHBOARD_GRID_DRAG_SURFACE)}>
              <button
                type="button"
                className={cn(
                  DASHBOARD_GRID_GRIP_CLASS,
                  "absolute left-2 top-2 z-10 flex size-8 cursor-grab items-center justify-center rounded-lg",
                  "bg-card/90 text-muted-foreground",
                  "opacity-0 transition-opacity",
                  "pointer-events-none",
                  "hover:bg-secondary hover:text-foreground active:cursor-grabbing",
                  "group-hover/widget:pointer-events-auto group-hover/widget:opacity-100",
                  "group-has-[:focus-visible]/widget:pointer-events-auto group-has-[:focus-visible]/widget:opacity-100",
                  "focus-visible:pointer-events-auto focus-visible:opacity-100",
                )}
                aria-label={`Mover ${labels[id] ?? id}`}
              >
                <GripVertical className="size-4" aria-hidden="true" />
              </button>
              <div data-grid-measure={id} className="min-w-0">
                {render(id)}
              </div>
            </div>
          ))}
        </GridLayout>
      ) : (
        <div className="min-h-48" />
      )}
    </div>
  );
}
