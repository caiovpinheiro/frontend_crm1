"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { verticalCompactor } from "react-grid-layout";
import { isPageMockMode } from "@/lib/page-mock-mode";
import { MOCK_FUNNEL_STAGE_IDS } from "@/features/dashboard-v2/mock-painel";
import {
  DEFAULT_USAGE_CHART_TYPE,
  isDashboardChartType,
  type DashboardChartType,
} from "@/features/dashboard-v2/chart-types";
import {
  fetchRemoteDashboardMeta,
  putRemoteDashboardLayout,
  readJsonWithFallback,
  scopedKey,
  useDashboardStorageScope,
  writeJson,
} from "@/features/dashboard-v2/dashboard-persist";
import { snapshotNegociosTabulationsIfNeeded } from "@/features/dashboard-v2/use-dashboard-widget-order";

export type LayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
  isResizable?: boolean;
};

export type Layout = LayoutItem[];

export const NEGOCIOS_GRID_KEY_PREFIX = "dashboard-negocios-grid";
export const STAGE_WIDGET_PREFIX = "stage:";

export const DASHBOARD_GRID_COLS = 12;
export const DASHBOARD_GRID_ROW_HEIGHT = 20;
export const DASHBOARD_GRID_MARGIN = [6, 6] as const;

export const TABULATION_BOARD_WIDGET_IDS = [
  "tabKpis",
  "tabTop",
  "tabByUser",
  "tabLog",
] as const;

export const DEAL_CORE_WIDGET_IDS = [
  "kpis",
  "funnel",
  "usage",
  "evolution",
  "agents",
  "sources",
  "exceptions",
] as const;

export type DealCoreWidgetId = (typeof DEAL_CORE_WIDGET_IDS)[number];
export type TabulationBoardWidgetId = (typeof TABULATION_BOARD_WIDGET_IDS)[number];

const OPTIONAL_CORE_WIDGET_IDS: readonly string[] = [];

export type NegociosCustomCard = {
  id: string;
  type: "event" | "customField";
  eventType?: string;
  fieldId?: string;
  fieldName?: string;
  agg?: "count" | "sum";
  title: string;
  chartType?: DashboardChartType;
};

export type NegociosGridStore = {
  version: 2;
  layout: Layout;
  cards: NegociosCustomCard[];
  usageChartType?: DashboardChartType;
  /** Core/stage widgets the user removed — do not re-append on load or stage sync. */
  hiddenWidgetIds?: string[];
  /** One-time fold of auto-synced stage cards into the funnel strip. */
  foldedAutoStages?: boolean;
};

const DEFAULT_SIZES: Record<DealCoreWidgetId, { w: number; h: number; minW: number; minH: number }> = {
  kpis: { w: 12, h: 4, minW: 6, minH: 3 },
  funnel: { w: 12, h: 8, minW: 6, minH: 5 },
  usage: { w: 6, h: 10, minW: 3, minH: 6 },
  evolution: { w: 6, h: 14, minW: 3, minH: 8 },
  agents: { w: 6, h: 10, minW: 3, minH: 5 },
  sources: { w: 6, h: 8, minW: 3, minH: 4 },
  exceptions: { w: 12, h: 5, minW: 4, minH: 3 },
};

const STAGE_DEFAULT = { w: 4, h: 8, minW: 3, minH: 4 };
const CUSTOM_DEFAULT = { w: 4, h: 12, minW: 3, minH: 6 };
const STAGE_PER_ROW = 3;

export function isStageWidgetId(id: string): boolean {
  return id.startsWith(STAGE_WIDGET_PREFIX);
}

export function stageWidgetId(stageId: string): string {
  return `${STAGE_WIDGET_PREFIX}${stageId}`;
}

export function parseStageWidgetId(id: string): string | null {
  return isStageWidgetId(id) ? id.slice(STAGE_WIDGET_PREFIX.length) : null;
}

export function gridRowsForPx(px: number, minH = 2): number {
  const unit = DASHBOARD_GRID_ROW_HEIGHT + DASHBOARD_GRID_MARGIN[1];
  return Math.max(minH, Math.ceil((px + DASHBOARD_GRID_MARGIN[1]) / unit));
}

export function compactNegociosLayout(layout: Layout): Layout {
  return verticalCompactor.compact(
    layout.map((item) => ({ ...item })),
    DASHBOARD_GRID_COLS,
  ) as Layout;
}

export function sameLayout(a: Layout, b: Layout): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((item) => [item.i, item]));
  return a.every((item) => {
    const other = byId.get(item.i);
    return (
      !!other &&
      other.x === item.x &&
      other.y === item.y &&
      other.w === item.w &&
      other.h === item.h
    );
  });
}

function stageIdsFromLayout(layout: Layout): string[] {
  return layout.flatMap((item) => {
    const id = parseStageWidgetId(item.i);
    return id ? [id] : [];
  });
}

/** Last incomplete row fills (2 → 6+6) so there is no vacant third cell. */
export function stageCell(count: number, index: number): { x: number; w: number } {
  const rowStart = Math.floor(index / STAGE_PER_ROW) * STAGE_PER_ROW;
  const inRow = Math.min(STAGE_PER_ROW, count - rowStart);
  const pos = index - rowStart;
  if (inRow === 2) return { x: pos * 6, w: 6 };
  if (inRow === 1) return { x: 0, w: 4 };
  return { x: pos * 4, w: 4 };
}

export function defaultNegociosLayout(cardIds: string[] = []): Layout {
  const kpis = DEFAULT_SIZES.kpis;
  const funnel = DEFAULT_SIZES.funnel;
  const afterFunnel = kpis.h + funnel.h;
  const items: LayoutItem[] = [
    { i: "kpis", x: 0, y: 0, w: kpis.w, h: kpis.h, minW: kpis.minW, minH: kpis.minH },
    { i: "funnel", x: 0, y: kpis.h, w: funnel.w, h: funnel.h, minW: funnel.minW, minH: funnel.minH },
    { i: "usage", x: 0, y: afterFunnel, ...DEFAULT_SIZES.usage },
    { i: "evolution", x: 6, y: afterFunnel, ...DEFAULT_SIZES.evolution },
    { i: "agents", x: 0, y: afterFunnel + DEFAULT_SIZES.usage.h, ...DEFAULT_SIZES.agents },
    { i: "sources", x: 6, y: afterFunnel + DEFAULT_SIZES.evolution.h, ...DEFAULT_SIZES.sources },
    { i: "exceptions", x: 0, y: afterFunnel + DEFAULT_SIZES.usage.h + DEFAULT_SIZES.agents.h, ...DEFAULT_SIZES.exceptions },
  ];
  cardIds.forEach((id, idx) => {
    items.push({
      i: id,
      x: (idx % STAGE_PER_ROW) * 4,
      y: afterFunnel + DEFAULT_SIZES.usage.h + DEFAULT_SIZES.agents.h + DEFAULT_SIZES.exceptions.h + Math.floor(idx / STAGE_PER_ROW) * CUSTOM_DEFAULT.h,
      w: CUSTOM_DEFAULT.w,
      h: CUSTOM_DEFAULT.h,
      minW: CUSTOM_DEFAULT.minW,
      minH: CUSTOM_DEFAULT.minH,
    });
  });
  return compactNegociosLayout(items);
}

const NEGOCIOS_TAB_IDS = new Set<string>(["tabulations", ...TABULATION_BOARD_WIDGET_IDS]);

function stripTabulationWidgets(layout: Layout): Layout {
  return layout.filter((item) => !NEGOCIOS_TAB_IDS.has(item.i));
}

function hideAutoSyncedStages(layout: Layout, hidden: string[]): { layout: Layout; hidden: string[] } {
  const stageItems = layout.filter((item) => isStageWidgetId(item.i));
  if (stageItems.length < 3) return { layout, hidden };
  const ids = stageItems.map((item) => item.i);
  return {
    layout: layout.filter((item) => !isStageWidgetId(item.i)),
    hidden: uniqueIds([...hidden, ...ids]),
  };
}

function isLayoutItem(v: unknown): v is LayoutItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.i === "string" &&
    typeof o.x === "number" &&
    typeof o.y === "number" &&
    typeof o.w === "number" &&
    typeof o.h === "number"
  );
}

function isCustomCard(v: unknown): v is NegociosCustomCard {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && (o.type === "event" || o.type === "customField") && typeof o.title === "string";
}

function parseUsageChartType(value: unknown): DashboardChartType {
  if (value === "dot") return "bar";
  return isDashboardChartType(value) ? value : DEFAULT_USAGE_CHART_TYPE;
}

function resetBloated(layout: Layout): Layout {
  return layout.map((item) => {
    const core = DEFAULT_SIZES[item.i as DealCoreWidgetId];
    if (core && item.h > core.h + 2) return { ...item, h: core.h, minW: core.minW, minH: core.minH };
    if (isStageWidgetId(item.i) && item.h > 16) {
      return { ...item, h: STAGE_DEFAULT.h, minW: STAGE_DEFAULT.minW, minH: STAGE_DEFAULT.minH };
    }
    return item;
  });
}

function defaultItemForId(id: string): LayoutItem {
  const core = DEFAULT_SIZES[id as DealCoreWidgetId];
  if (core) return { i: id, x: 0, y: 0, ...core };
  if (isStageWidgetId(id)) {
    return { i: id, x: 0, y: 0, ...STAGE_DEFAULT, isResizable: false };
  }
  return { i: id, x: 0, y: 0, ...CUSTOM_DEFAULT };
}

/**
 * Keep saved x/y/w/h. Only append widgets the store does not know yet.
 * Drops the legacy aggregate "stages" cell and unknown/hidden ids so they
 * cannot reserve an empty band. Compacting is the caller's job when the
 * set of widgets changed (remove / restore / hydrate holes).
 */
export function adoptSavedLayout(
  saved: Layout | null,
  cards: NegociosCustomCard[],
  stageIds: string[],
  hiddenWidgetIds: readonly string[] = [],
): Layout {
  const hidden = new Set(hiddenWidgetIds);
  const expected = [
    ...DEAL_CORE_WIDGET_IDS,
    ...stageIds.map(stageWidgetId),
    ...cards.map((c) => `card:${c.id}`),
  ].filter((id) => id !== "stages" && !hidden.has(id));
  const expectedSet = new Set<string>(expected);
  const byId = new Map((saved ?? []).filter(isLayoutItem).map((item) => [item.i, item]));
  const kept: Layout = [];
  for (const item of saved ?? []) {
    if (!isLayoutItem(item) || item.i === "stages" || !expectedSet.has(item.i)) continue;
    const base = defaultItemForId(item.i);
    kept.push({
      ...base,
      x: item.x,
      y: item.y,
      w: item.w ?? base.w,
      h: item.h ?? base.h,
    });
  }
  let maxY = kept.reduce((m, item) => Math.max(m, item.y + item.h), 0);
  for (const id of expected) {
    if (byId.has(id)) continue;
    const item = defaultItemForId(id);
    kept.push({ ...item, y: maxY });
    maxY += item.h;
  }
  return kept;
}

function mergeLayout(
  saved: Layout | null,
  cards: NegociosCustomCard[],
  stageIds: string[],
  hiddenWidgetIds: readonly string[] = [],
): Layout {
  return compactNegociosLayout(adoptSavedLayout(saved, cards, stageIds, hiddenWidgetIds));
}

function parseHiddenWidgetIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

function expandHiddenIds(hidden: string[]): string[] {
  return hidden.filter((id) => !NEGOCIOS_TAB_IDS.has(id));
}

function hideOptionalCore(layout: Layout, hidden: string[]): string[] {
  const present = new Set(layout.map((item) => item.i));
  const next = expandHiddenIds(hidden);
  for (const id of OPTIONAL_CORE_WIDGET_IDS) {
    if (!present.has(id) && !next.includes(id)) next.push(id);
  }
  return next;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function sameStageSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function toRemotePayload(store: NegociosGridStore) {
  const layout: Record<string, LayoutItem> = {};
  for (const item of store.layout.slice(0, 50)) {
    const id = item.i.slice(0, 64);
    layout[id] = {
      i: id,
      x: Math.max(0, Math.min(50, Math.round(item.x))),
      y: Math.max(0, Math.min(500, Math.round(item.y))),
      w: Math.max(1, Math.min(12, Math.round(item.w))),
      h: Math.max(1, Math.min(50, Math.round(item.h))),
      minW: item.minW,
      minH: item.minH,
    };
  }
  return {
    preset: "custom" as const,
    visibleWidgets: store.layout.map((item) => item.i).slice(0, 50),
    layout,
    meta: { v: 2 as const, negocios: store },
  };
}

function parseStore(raw: unknown): NegociosGridStore | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<NegociosGridStore> & { version?: number };
  const cards = Array.isArray(parsed.cards) ? parsed.cards.filter(isCustomCard) : [];
  const saved = Array.isArray(parsed.layout) ? parsed.layout.filter(isLayoutItem) : [];
  if (!saved.length && !cards.length && parsed.version !== 2) return null;
  const mockStages = isPageMockMode() ? MOCK_FUNNEL_STAGE_IDS : [];
  const expanded = stripTabulationWidgets(saved);
  const alreadyFolded = parsed.foldedAutoStages === true;
  const pruned = alreadyFolded
    ? { layout: expanded, hidden: expandHiddenIds(parseHiddenWidgetIds(parsed.hiddenWidgetIds)) }
    : hideAutoSyncedStages(
        expanded,
        expandHiddenIds(parseHiddenWidgetIds(parsed.hiddenWidgetIds)),
      );
  const stageIds = stageIdsFromLayout(pruned.layout).length
    ? stageIdsFromLayout(pruned.layout)
    : mockStages;
  const usageChartType = parseUsageChartType(parsed.usageChartType);
  const hiddenWidgetIds = hideOptionalCore(pruned.layout, pruned.hidden);
  const legacy = parsed.version !== 2 || saved.some((item) => item.i === "stages");
  if (legacy) {
    const source = resetBloated(pruned.layout.filter((item) => item.i !== "stages"));
    return {
      version: 2,
      layout: mergeLayout(source, cards, stageIds, hiddenWidgetIds),
      cards,
      usageChartType,
      hiddenWidgetIds,
      foldedAutoStages: true,
    };
  }
  return {
    version: 2,
    layout: compactNegociosLayout(adoptSavedLayout(pruned.layout, cards, stageIds, hiddenWidgetIds)),
    cards,
    usageChartType,
    hiddenWidgetIds,
    foldedAutoStages: true,
  };
}

function emptyStore(): NegociosGridStore {
  if (isPageMockMode()) {
    const cards: NegociosCustomCard[] = [
      {
        id: "demo-msg-in",
        type: "event",
        eventType: "messages_in",
        title: "Mensagens recebidas",
        chartType: "column",
      },
    ];
    const layout = defaultNegociosLayout(cards.map((c) => `card:${c.id}`));
    return {
      version: 2,
      layout,
      cards,
      usageChartType: DEFAULT_USAGE_CHART_TYPE,
      hiddenWidgetIds: hideOptionalCore(layout, []),
      foldedAutoStages: true,
    };
  }
  const layout = defaultNegociosLayout();
  return {
    version: 2,
    layout,
    cards: [],
    usageChartType: DEFAULT_USAGE_CHART_TYPE,
    hiddenWidgetIds: hideOptionalCore(layout, []),
    foldedAutoStages: true,
  };
}

function readLocalStore(prefix: string, keyPart: string, userId: string): NegociosGridStore | null {
  const raw = readJsonWithFallback<unknown>(prefix, keyPart, userId);
  return parseStore(raw);
}

const EMPTY_HIDDEN: string[] = [];

export function useNegociosGrid() {
  const { ready, userId, keyPart } = useDashboardStorageScope();
  const storageKey = keyPart ? scopedKey(NEGOCIOS_GRID_KEY_PREFIX, keyPart) : "";

  const [store, setStore] = useState<NegociosGridStore>(() => {
    const layout = defaultNegociosLayout();
    return {
      version: 2,
      layout,
      cards: [],
      usageChartType: DEFAULT_USAGE_CHART_TYPE,
      hiddenWidgetIds: hideOptionalCore(layout, []),
      foldedAutoStages: true,
    };
  });
  const [hydrated, setHydrated] = useState(false);
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    if (!ready || !keyPart || !userId) return;
    let cancelled = false;
    snapshotNegociosTabulationsIfNeeded(keyPart, userId);
    const local = readLocalStore(NEGOCIOS_GRID_KEY_PREFIX, keyPart, userId);
    if (local) {
      setStore(local);
      writeJson(scopedKey(NEGOCIOS_GRID_KEY_PREFIX, keyPart), local);
      setHydrated(true);
      return undefined;
    }
    void fetchRemoteDashboardMeta<{ v?: number; negocios?: unknown }>().then((meta) => {
      if (cancelled) return;
      const remote = parseStore(meta?.negocios);
      if (remote) {
        setStore(remote);
        writeJson(scopedKey(NEGOCIOS_GRID_KEY_PREFIX, keyPart), remote);
      } else {
        setStore(emptyStore());
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, keyPart, userId]);

  const persist = useCallback(
    (next: NegociosGridStore) => {
      if (!hydrated || !storageKey) return;
      setStore(next);
      writeJson(storageKey, next);
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
      remoteTimer.current = setTimeout(() => {
        void putRemoteDashboardLayout(toRemotePayload(next));
      }, 800);
    },
    [hydrated, storageKey],
  );

  useEffect(() => {
    return () => {
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
    };
  }, []);

  const hiddenWidgetIds = store.hiddenWidgetIds ?? EMPTY_HIDDEN;

  const commit = useCallback(
    (patch: Partial<NegociosGridStore>) => {
      const current = storeRef.current;
      persist({
        version: 2,
        layout: current.layout,
        cards: current.cards,
        usageChartType: current.usageChartType,
        hiddenWidgetIds: current.hiddenWidgetIds ?? EMPTY_HIDDEN,
        foldedAutoStages: current.foldedAutoStages ?? true,
        ...patch,
      });
    },
    [persist],
  );

  const setLayout = useCallback(
    (layout: Layout) => {
      if (!hydrated) return;
      const current = storeRef.current;
      const hidden = current.hiddenWidgetIds ?? EMPTY_HIDDEN;
      const incomingStages = stageIdsFromLayout(layout);
      const stageIds = incomingStages.length ? incomingStages : stageIdsFromLayout(current.layout);
      const next = compactNegociosLayout(
        adoptSavedLayout(layout, current.cards, stageIds, hidden),
      );
      if (sameLayout(next, current.layout)) return;
      commit({ layout: next });
    },
    [commit, hydrated],
  );

  const syncStages = useCallback(
    (stageIds: string[]) => {
      if (!hydrated) return;
      const current = storeRef.current;
      const hidden = current.hiddenWidgetIds ?? EMPTY_HIDDEN;
      const visible = stageIdsFromLayout(current.layout);
      const expectedVisible = visible.filter((id) => stageIds.includes(id));
      if (sameStageSet(visible, expectedVisible)) return;
      const next = compactNegociosLayout(
        adoptSavedLayout(current.layout, current.cards, expectedVisible, hidden),
      );
      if (sameLayout(next, current.layout)) return;
      commit({ layout: next });
    },
    [commit, hydrated],
  );

  const addCard = useCallback(
    (card: NegociosCustomCard) => {
      if (!hydrated) return;
      const current = storeRef.current;
      const hidden = current.hiddenWidgetIds ?? EMPTY_HIDDEN;
      const cards = [...current.cards, card];
      const nextHidden = hidden.filter((id) => id !== `card:${card.id}`);
      commit({
        cards,
        hiddenWidgetIds: nextHidden,
        layout: compactNegociosLayout(
          adoptSavedLayout(current.layout, cards, stageIdsFromLayout(current.layout), nextHidden),
        ),
      });
    },
    [commit, hydrated],
  );

  const removeWidget = useCallback(
    (widgetId: string) => {
      if (!hydrated) return;
      const current = storeRef.current;
      const hidden = current.hiddenWidgetIds ?? EMPTY_HIDDEN;
      const cardId = widgetId.startsWith("card:") ? widgetId.slice(5) : null;
      const cards = cardId ? current.cards.filter((c) => c.id !== cardId) : current.cards;
      const nextHidden = cardId
        ? hidden.filter((id) => id !== widgetId)
        : uniqueIds([...hidden, widgetId]);
      const stageIds = uniqueIds([
        ...stageIdsFromLayout(current.layout),
        ...(parseStageWidgetId(widgetId) ? [parseStageWidgetId(widgetId)!] : []),
      ]);
      commit({
        cards,
        hiddenWidgetIds: nextHidden,
        layout: compactNegociosLayout(
          adoptSavedLayout(
            current.layout.filter((item) => item.i !== widgetId),
            cards,
            stageIds,
            nextHidden,
          ),
        ),
      });
    },
    [commit, hydrated],
  );

  const restoreWidget = useCallback(
    (widgetId: string, chartType?: DashboardChartType) => {
      if (!hydrated) return;
      const current = storeRef.current;
      if (current.layout.some((item) => item.i === widgetId)) return;
      const hidden = current.hiddenWidgetIds ?? EMPTY_HIDDEN;
      const nextHidden = hidden.filter((id) => id !== widgetId);
      const restoredStage = parseStageWidgetId(widgetId);
      const stageIds = uniqueIds([
        ...stageIdsFromLayout(current.layout),
        ...(restoredStage ? [restoredStage] : []),
      ]);
      commit({
        hiddenWidgetIds: nextHidden,
        usageChartType:
          widgetId === "usage" && chartType ? chartType : current.usageChartType,
        layout: compactNegociosLayout(
          adoptSavedLayout(current.layout, current.cards, stageIds, nextHidden),
        ),
      });
    },
    [commit, hydrated],
  );

  const removeCard = useCallback(
    (id: string) => {
      removeWidget(`card:${id}`);
    },
    [removeWidget],
  );

  const widgetIds = useMemo(
    () => store.layout.map((item) => item.i),
    [store.layout],
  );

  return {
    storageKey,
    hydrated,
    layout: store.layout,
    cards: store.cards,
    usageChartType: store.usageChartType ?? DEFAULT_USAGE_CHART_TYPE,
    hiddenWidgetIds,
    widgetIds,
    setLayout,
    syncStages,
    addCard,
    removeCard,
    removeWidget,
    restoreWidget,
    defaultSizes: DEFAULT_SIZES,
  };
}
