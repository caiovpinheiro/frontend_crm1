"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import GridLayout, { useContainerWidth, verticalCompactor } from "react-grid-layout";
import { FoldVertical, GripVertical, MoreVertical, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useIsDesktop, useMediaQuery } from "@/hooks/use-media-query";
import {
  FLUID_GRID_BREAKPOINT,
  FLUID_GRID_CLASS,
  fluidOrder,
  fluidSpanClass,
} from "@/features/dashboard-v2/fluid-grid";
import { fillRowGaps } from "@/features/dashboard-v2/grid-fill";
import {
  contentRowsForPx,
  displayLayoutForContent,
  fitLayoutToContent,
  measureNaturalHeights,
} from "@/features/dashboard-v2/grid-fit";
import {
  armSuppressClickAfterDrag,
  dashboardGridDragCancel,
} from "@/features/dashboard-v2/click-vs-drag";
import {
  DASHBOARD_GRID_COLS,
  DASHBOARD_GRID_MARGIN,
  DASHBOARD_GRID_ROW_HEIGHT,
  compactNegociosLayout,
  gridCellHeightPx,
  sameLayout,
  type Layout,
} from "@/features/dashboard-v2/use-negocios-grid";
import type { LayoutChangeSource } from "@/features/dashboard-v2/layout-remote-gate";
import { cn } from "@/lib/utils";

import "react-grid-layout/css/styles.css";
import "./sortable-widget-grid.css";

export const DASHBOARD_GRID_GRIP_CLASS = "dashboard-grid-grip";
export const DASHBOARD_GRID_DRAG_SURFACE = "dashboard-grid-drag-surface";

const GRID_CONFIG = {
  cols: DASHBOARD_GRID_COLS,
  rowHeight: DASHBOARD_GRID_ROW_HEIGHT,
  margin: DASHBOARD_GRID_MARGIN,
  containerPadding: [0, 0] as [number, number],
};

/**
 * Compactação vertical ligada: ao mover/redimensionar, os cards sobem para o
 * espaço vazio (sem buracos na coluna). Exportado para o teste da config.
 */
export const DASHBOARD_GRID_COMPACTOR = verticalCompactor;

/**
 * Sem limiar no arraste do modo Organizar. Com limiar (8 px) o
 * react-grid-layout descarta o movimento feito antes de passar dele e o card
 * fica atrás do ponteiro durante todo o arraste. Clique ≠ arraste continua
 * garantido pelo `cancel` (botões, links, gráficos) e, no card, pela supressão
 * do clique que sobra depois do arraste.
 */
export const DASHBOARD_GRID_DRAG_THRESHOLD = 0;

export const AUTO_SIZE_DEBOUNCE_MS = 220;

function sameRows(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, rows] of a) if (b.get(id) !== rows) return false;
  return true;
}

const RAIL_ACTION_CLASS = cn(
  "flex size-7 shrink-0 items-center justify-center rounded-lg",
  "border border-border bg-[var(--dropdown-solid-bg)] text-muted-foreground",
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
    <div className="flex shrink-0 flex-col items-center gap-1">
      {grip}
      {menu}
    </div>
  );
}

/** Botão da barra de edição do card: 32 px com mouse, 40 px no toque. */
const TOOLBAR_ACTION_CLASS = cn(
  "flex size-8 shrink-0 items-center justify-center rounded-md pointer-coarse:size-10",
  "text-muted-foreground hover:bg-secondary hover:text-foreground",
  "focus-visible:bg-secondary focus-visible:text-foreground focus-visible:outline-none",
  "focus-visible:ring-2 focus-visible:ring-primary/40",
);

/**
 * Barra de edição DENTRO do card (canto superior direito), por cima do
 * conteúdo: arrastar (⋮⋮) e menu (⋮). Antes era uma coluna ao lado do card,
 * dentro da célula, que encostava no card vizinho e parecia pertencer a ele.
 */
export function WidgetEditToolbar({
  grip,
  menu,
}: {
  grip?: ReactNode;
  menu?: ReactNode;
}) {
  if (!grip && !menu) return null;
  return (
    <div
      data-grid-toolbar=""
      className="absolute right-1.5 top-1.5 z-20 flex items-center gap-0.5 rounded-lg border border-border bg-[var(--dropdown-solid-bg)] p-0.5 shadow-sm"
    >
      {grip}
      {menu}
    </div>
  );
}

export function WidgetOverflowMenu({
  label,
  onRemove,
  triggerClassName = RAIL_ACTION_CLASS,
}: {
  label: string;
  onRemove: () => void;
  triggerClassName?: string;
}) {
  return (
    <DropdownMenu className="relative z-10">
      <DropdownMenuTrigger
        className={triggerClassName}
        aria-label={`Mais opções de ${label}`}
        data-dashboard-no-drag
      >
        <MoreVertical className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-40 rounded-2xl border border-border bg-[var(--dropdown-solid-bg)] text-foreground shadow-lg backdrop-blur-none"
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
  /**
   * `source` distingue drag/resize da pessoa (`user`, persiste no servidor)
   * do ajuste automático de altura (`auto`, só local).
   */
  onLayoutChange: (layout: Layout, source: LayoutChangeSource) => void;
  labels: Record<string, string>;
  render: (id: string) => ReactNode;
  disabled?: boolean;
  persistEnabled?: boolean;
  organizing?: boolean;
  onRemove?: (id: string) => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  // Abaixo do desktop não há grid em pixels: grade CSS fluida (ver fluid-grid.ts).
  const isDesktop = useIsDesktop();
  // Com mouse o card inteiro arrasta; no toque só a alça (senão tocar no card
  // não rola a página).
  const finePointer = useMediaQuery("(pointer: fine)", true);
  const { width, containerRef, mounted } = useContainerWidth();
  const visibleLayout = useMemo(
    () => compactNegociosLayout(layout.filter((item) => item.i !== "stages")),
    [layout],
  );
  const ids = useMemo(() => visibleLayout.map((item) => item.i), [visibleLayout]);
  /** Linhas que o conteúdo de cada card pede (medido no modo leitura). */
  const [contentRows, setContentRows] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  // Só na exibição (o salvo não muda; ao organizar, voltam as larguras e
  // alturas reais): cards crescem para as colunas vazias da linha e a altura
  // segue o conteúdo, sem passar do `h` salvo (ver displayLayoutForContent).
  const shownLayout = useMemo(
    () =>
      organizing
        ? visibleLayout
        : displayLayoutForContent(
            fillRowGaps(visibleLayout, DASHBOARD_GRID_COLS),
            contentRows,
            DASHBOARD_GRID_COLS,
          ),
    [organizing, visibleLayout, contentRows],
  );
  const layoutRef = useRef(layout);
  const gridRootRef = useRef<HTMLDivElement | null>(null);
  const interactingRef = useRef(false);
  const applyingRef = useRef(false);
  const persistEnabledRef = useRef(persistEnabled);
  const onLayoutChangeRef = useRef(onLayoutChange);
  const heightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  layoutRef.current = layout;
  persistEnabledRef.current = persistEnabled;
  onLayoutChangeRef.current = onLayoutChange;

  const commit = useCallback((next: Layout, source: LayoutChangeSource) => {
    if (!persistEnabledRef.current) return;
    const compacted = compactNegociosLayout(next);
    if (sameLayout(compacted, layoutRef.current)) return;
    applyingRef.current = true;
    onLayoutChangeRef.current(compacted, source);
    queueMicrotask(() => {
      applyingRef.current = false;
    });
  }, []);

  /**
   * Modo leitura: mede a altura natural de cada card (solta da célula por um
   * instante — grid-fit.ts) e guarda as linhas que o conteúdo pede. Só a
   * exibição usa isso; nada é gravado ao encolher. Conteúdo MAIOR que a célula
   * salva continua crescendo o `h` como antes (`auto`: só localStorage, nunca
   * PUT/PATCH), senão o card cortaria o conteúdo.
   */
  const measureContent = useCallback(() => {
    heightTimer.current = null;
    if (interactingRef.current || applyingRef.current) return;
    const natural = measureNaturalHeights(gridRootRef.current);
    const rows = new Map<string, number>();
    let grown = layoutRef.current;
    let grew = false;
    natural.forEach((px, id) => {
      if (!(px > 0)) return;
      const item = layoutRef.current.find((entry) => entry.i === id);
      if (!item) return;
      const needed = contentRowsForPx(px);
      rows.set(id, needed);
      if (px > gridCellHeightPx(item.h) + 8) {
        const next = Math.max(item.h, contentRowsForPx(px, item.minH ?? 2));
        if (next !== item.h) {
          grown = grown.map((entry) => (entry.i === id ? { ...entry, h: next } : entry));
          grew = true;
        }
      }
    });
    setContentRows((prev) => (sameRows(prev, rows) ? prev : rows));
    if (grew) commit(grown, "auto");
  }, [commit]);

  const hasWidth = width > 0;
  useEffect(() => {
    if (disabled || organizing || !isDesktop || !mounted || !hasWidth) return undefined;
    const root = gridRootRef.current;
    if (!root) return undefined;
    const schedule = () => {
      if (heightTimer.current) clearTimeout(heightTimer.current);
      heightTimer.current = setTimeout(measureContent, AUTO_SIZE_DEBOUNCE_MS);
    };
    // Tamanho da célula (largura muda a quebra de linha) e conteúdo (dados que
    // chegam dentro de um card esticado não mudam o tamanho dele).
    const resize = new ResizeObserver(schedule);
    root.querySelectorAll<HTMLElement>("[data-grid-measure]").forEach((el) => resize.observe(el));
    const mutation = new MutationObserver(schedule);
    mutation.observe(root, { childList: true, subtree: true, characterData: true });
    schedule();
    return () => {
      resize.disconnect();
      mutation.disconnect();
      if (heightTimer.current) clearTimeout(heightTimer.current);
      heightTimer.current = null;
    };
  }, [disabled, organizing, isDesktop, mounted, hasWidth, ids, measureContent]);

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

  /**
   * "Ajustar alturas ao conteúdo": mede a altura natural de cada card e grava
   * o layout com o `h` correspondente — uma única mudança `user` (1 PATCH).
   */
  function fitHeightsToContent() {
    const heights = measureNaturalHeights(gridRootRef.current);
    if (heights.size === 0) return;
    commit(fitLayoutToContent(layoutRef.current, heights), "user");
  }

  function menuFor(id: string, triggerClassName?: string) {
    if (!onRemove) return undefined;
    return (
      <WidgetOverflowMenu
        label={labels[id] ?? id}
        onRemove={() => void requestRemove(id)}
        triggerClassName={triggerClassName}
      />
    );
  }

  /**
   * Célula da grade em pixels = o card. O card estica até a célula (largura e
   * altura) também no modo Organizar; a barra de edição fica por cima, dentro
   * do card. No modo leitura a célula exibida já tem a altura do conteúdo
   * (ou a da linha, para alinhar com o vizinho); no Organizar, a salva.
   */
  function gridCell(id: string) {
    const label = labels[id] ?? id;
    return (
      <div
        data-grid-cell={id}
        className={cn(
          "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl",
          organizing && finePointer && DASHBOARD_GRID_DRAG_SURFACE,
          organizing && finePointer && "cursor-grab active:cursor-grabbing",
        )}
      >
        <div
          data-grid-measure={id}
          data-grid-fill=""
          className="flex min-h-0 min-w-0 flex-1 flex-col [&>*]:flex-1"
        >
          {render(id)}
        </div>
        {organizing ? (
          <>
            <span
              aria-hidden="true"
              data-grid-edit-outline=""
              className="pointer-events-none absolute inset-0 z-10 rounded-xl ring-1 ring-inset ring-primary/40"
            />
            <WidgetEditToolbar
              grip={
                <button
                  type="button"
                  className={cn(
                    DASHBOARD_GRID_GRIP_CLASS,
                    DASHBOARD_GRID_DRAG_SURFACE,
                    TOOLBAR_ACTION_CLASS,
                    "cursor-grab active:cursor-grabbing",
                  )}
                  aria-label={`Mover ${label}`}
                >
                  <GripVertical className="size-4" aria-hidden="true" />
                </button>
              }
              menu={menuFor(id, TOOLBAR_ACTION_CLASS)}
            />
          </>
        ) : null}
      </div>
    );
  }

  if (disabled || !isDesktop) {
    return (
      <>
        <div
          className={cn("negocios-grid-fluid min-w-0", FLUID_GRID_CLASS)}
          data-fluid-grid={`<${FLUID_GRID_BREAKPOINT}`}
        >
          {fluidOrder(visibleLayout).map((id) => {
            const item = visibleLayout.find((entry) => entry.i === id);
            return (
              <div
                key={id}
                data-widget-id={id}
                className={cn("relative min-w-0", fluidSpanClass(item?.w ?? 12))}
              >
                {render(id)}
                {organizing ? (
                  <WidgetEditToolbar menu={menuFor(id, TOOLBAR_ACTION_CLASS)} />
                ) : null}
              </div>
            );
          })}
        </div>
        {confirmDialog}
      </>
    );
  }

  const colWidth =
    width > 0
      ? (width - DASHBOARD_GRID_MARGIN[0] * (DASHBOARD_GRID_COLS - 1)) / DASHBOARD_GRID_COLS
      : 0;
  // Guias das 12 colunas (só ao organizar): faixas discretas no fundo.
  const guideStyle: CSSProperties | undefined =
    organizing && colWidth > 0
      ? {
          backgroundImage: `repeating-linear-gradient(to right, var(--negocios-grid-guide) 0 ${colWidth}px, transparent ${colWidth}px ${colWidth + DASHBOARD_GRID_MARGIN[0]}px)`,
        }
      : undefined;

  return (
    <div
      ref={containerRef}
      className={cn("negocios-grid relative min-w-0", organizing && "is-organizing")}
    >
      {organizing ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            Arraste o card (ou a alça ⋮⋮) para mover; puxe o canto inferior direito para
            redimensionar.
          </p>
          <button
            type="button"
            onClick={fitHeightsToContent}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 font-medium text-foreground hover:bg-secondary pointer-coarse:min-h-10"
          >
            <FoldVertical className="size-3.5" aria-hidden="true" />
            Ajustar alturas ao conteúdo
          </button>
        </div>
      ) : null}
      {mounted && width > 0 ? (
        <div ref={gridRootRef} className="relative">
          {guideStyle ? (
            <div
              aria-hidden="true"
              data-grid-guides=""
              className="pointer-events-none absolute inset-0"
              style={guideStyle}
            />
          ) : null}
          <GridLayout
            width={width}
            layout={shownLayout}
            autoSize
            gridConfig={GRID_CONFIG}
            dragConfig={{
              enabled: organizing,
              handle: `.${DASHBOARD_GRID_DRAG_SURFACE}`,
              threshold: DASHBOARD_GRID_DRAG_THRESHOLD,
              cancel: dashboardGridDragCancel(DASHBOARD_GRID_GRIP_CLASS),
            }}
            resizeConfig={{ enabled: organizing, handles: ["se"] }}
            compactor={DASHBOARD_GRID_COMPACTOR}
            onLayoutChange={() => {
              /* Persist only from drag/resize stop and auto-size — not mount. */
            }}
            onDragStart={() => {
              interactingRef.current = true;
              armSuppressClickAfterDrag();
            }}
            onDragStop={(next) => {
              interactingRef.current = false;
              if (Array.isArray(next)) commit(next as Layout, "user");
            }}
            onResizeStart={() => {
              interactingRef.current = true;
            }}
            onResizeStop={(next) => {
              interactingRef.current = false;
              if (Array.isArray(next)) commit(next as Layout, "user");
            }}
          >
            {ids.map((id) => (
              <div key={id} className="min-h-0 min-w-0">
                {gridCell(id)}
              </div>
            ))}
          </GridLayout>
        </div>
      ) : (
        <div className="min-h-48" />
      )}
      {confirmDialog}
    </div>
  );
}
