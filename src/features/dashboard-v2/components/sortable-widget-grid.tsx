"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import GridLayout, { useContainerWidth, verticalCompactor } from "react-grid-layout";
import { GripVertical, MoreVertical, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
  gridCellHeightPx,
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

/** Matches backend layout h max (50) with room for chrome; stops grow-loops. */
const MAX_AUTO_ROWS = 40;
const AUTO_SIZE_DEBOUNCE_MS = 220;

const RAIL_ACTION_CLASS = cn(
  "flex size-7 shrink-0 items-center justify-center rounded-lg",
  "bg-card text-muted-foreground",
  "hover:bg-secondary hover:text-foreground",
  "focus-visible:bg-secondary focus-visible:text-foreground",
);

export function WidgetOrganizeRail({
  grip,
  menu,
}: {
  grip?: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <div className="flex w-7 shrink-0 flex-col items-center gap-1 pt-1">
      {grip}
      {menu}
    </div>
  );
}

export function WidgetOverflowMenu({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu className="relative z-10">
      <DropdownMenuTrigger
        className={RAIL_ACTION_CLASS}
        aria-label={`Mais opções de ${label}`}
        data-dashboard-no-drag
      >
        <MoreVertical className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-40 rounded-2xl border border-border bg-card text-foreground shadow-lg backdrop-blur-none"
      >
        <DropdownMenuItem
          onClick={onRemove}
          className="text-destructive focus:text-destructive hover:text-destructive"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Remover
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SortableWidgetGrid({
  layout,
  onLayoutChange,
  labels,
  render,
  disabled = false,
  persistEnabled = true,
  organizing = false,
  onRemove,
}: {
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  labels: Record<string, string>;
  render: (id: string) => ReactNode;
  disabled?: boolean;
  persistEnabled?: boolean;
  organizing?: boolean;
  onRemove?: (id: string) => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { width, containerRef, mounted } = useContainerWidth();
  const visibleLayout = useMemo(
    () => compactNegociosLayout(layout.filter((item) => item.i !== "stages")),
    [layout],
  );
  const ids = useMemo(() => visibleLayout.map((item) => item.i), [visibleLayout]);
  const layoutRef = useRef(layout);
  const interactingRef = useRef(false);
  const applyingRef = useRef(false);
  const persistEnabledRef = useRef(persistEnabled);
  const onLayoutChangeRef = useRef(onLayoutChange);
  const pendingHeights = useRef(new Map<string, number>());
  const heightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  layoutRef.current = layout;
  persistEnabledRef.current = persistEnabled;
  onLayoutChangeRef.current = onLayoutChange;

  const commit = useCallback((next: Layout) => {
    if (!persistEnabledRef.current) return;
    const compacted = compactNegociosLayout(next);
    if (sameLayout(compacted, layoutRef.current)) return;
    applyingRef.current = true;
    onLayoutChangeRef.current(compacted);
    queueMicrotask(() => {
      applyingRef.current = false;
    });
  }, []);

  const flushHeights = useCallback(() => {
    if (interactingRef.current || applyingRef.current) return;
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

  const flushHeightsRef = useRef(flushHeights);
  flushHeightsRef.current = flushHeights;

  useEffect(() => {
    if (disabled || organizing || !persistEnabled) return;
    const observer = new ResizeObserver((entries) => {
      if (interactingRef.current || applyingRef.current) return;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const id = el.dataset.gridMeasure;
        if (!id || !shouldAutoSize(id)) continue;
        const item = layoutRef.current.find((row) => row.i === id);
        if (!item) continue;
        const contentPx = Math.max(el.scrollHeight, el.offsetHeight);
        const cellPx = gridCellHeightPx(item.h);
        const rows = Math.min(
          MAX_AUTO_ROWS,
          gridRowsForPx(contentPx, item.minH ?? 2),
        );
        if (rows === item.h) continue;
        const overflows = contentPx > cellPx + 8;
        const leftover = !overflows && item.h - rows >= 2;
        if (!overflows && !leftover) continue;
        pendingHeights.current.set(id, rows);
      }
      if (pendingHeights.current.size === 0) return;
      if (heightTimer.current) clearTimeout(heightTimer.current);
      heightTimer.current = setTimeout(() => flushHeightsRef.current(), AUTO_SIZE_DEBOUNCE_MS);
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
  }, [containerRef, disabled, ids, mounted, width, organizing, persistEnabled]);

  async function requestRemove(id: string) {
    if (!onRemove) return;
    const label = labels[id] ?? "este gráfico";
    const ok = await confirm({
      title: "Remover gráfico?",
      description: `Remover “${label}” do dashboard. Os demais cards permanecem.`,
      confirmLabel: "Remover",
      destructive: true,
    });
    if (ok) onRemove(id);
  }

  function chrome(id: string, grip?: ReactNode) {
    if (!organizing) return null;
    return (
      <WidgetOrganizeRail
        grip={grip}
        menu={
          onRemove ? (
            <WidgetOverflowMenu
              label={labels[id] ?? id}
              onRemove={() => void requestRemove(id)}
            />
          ) : undefined
        }
      />
    );
  }

  if (disabled) {
    return (
      <>
        <div className="grid grid-cols-1 gap-1.5 xl:grid-cols-12">
          {ids.map((id) => {
            const item = visibleLayout.find((entry) => entry.i === id);
            const span = item?.w ?? 12;
            return (
              <div
                key={id}
                className={cn(
                  "flex min-w-0 items-start",
                  organizing ? "gap-1" : null,
                )}
                style={{ gridColumn: `span ${span} / span ${span}` }}
              >
                {chrome(id)}
                <div className="min-w-0 flex-1">{render(id)}</div>
              </div>
            );
          })}
        </div>
        {confirmDialog}
      </>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("negocios-grid min-w-0", organizing && "is-organizing")}
    >
      {mounted && width > 0 ? (
        <GridLayout
          width={width}
          layout={visibleLayout}
          autoSize
          gridConfig={GRID_CONFIG}
          dragConfig={{
            enabled: organizing,
            handle: `.${DASHBOARD_GRID_DRAG_SURFACE}`,
            threshold: DASHBOARD_DRAG_THRESHOLD_PX,
            cancel: dashboardGridDragCancel(DASHBOARD_GRID_GRIP_CLASS),
          }}
          resizeConfig={{ enabled: organizing, handles: ["se"] }}
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
            <div key={id} className="min-w-0">
              <div
                data-grid-measure={id}
                className={cn(
                  "flex h-fit min-w-0 items-start",
                  organizing ? "gap-1" : null,
                )}
              >
                {chrome(
                  id,
                  <button
                    type="button"
                    className={cn(
                      DASHBOARD_GRID_GRIP_CLASS,
                      DASHBOARD_GRID_DRAG_SURFACE,
                      RAIL_ACTION_CLASS,
                      "cursor-grab active:cursor-grabbing",
                    )}
                    aria-label={`Mover ${labels[id] ?? id}`}
                  >
                    <GripVertical className="size-3.5" aria-hidden="true" />
                  </button>,
                )}
                <div className="min-w-0 flex-1">{render(id)}</div>
              </div>
            </div>
          ))}
        </GridLayout>
      ) : (
        <div className="min-h-48" />
      )}
      {confirmDialog}
    </div>
  );
}
