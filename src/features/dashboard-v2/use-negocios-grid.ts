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
export const DASHBOARD_GRID_MARGIN = [10, 10] as const;

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
};

const DEFAULT_SIZES: Record<DealCoreWidgetId, { w: number; h: number; minW: number; minH: number }> = {
  kpis: { w: 12, h: 4, minW: 6, minH: 3 },
  funnel: { w: 12, h: 12, minW: 6, minH: 6 },
  usage: { w: 6, h: 16, minW: 3, minH: 8 },
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

function packStages(stageIds: string[], startY: number): LayoutItem[] {
  return stageIds.map((id, index) => {
    const { x, w } = stageCell(stageIds.length, index);
    return {
      i: stageWidgetId(id),
      x,
      y: startY + Math.floor(index / STAGE_PER_ROW) * STAGE_DEFAULT.h,
      w,
      h: STAGE_DEFAULT.h,
      minW: STAGE_DEFAULT.minW,
      minH: STAGE_DEFAULT.minH,
      isResizable: false,
    };
  });
}

export function defaultNegociosLayout(cardIds: string[] = [], stageIds: string[] = []): Layout {
  const kpis = DEFAULT_SIZES.kpis;
  const funnel = DEFAULT_SIZES.funnel;
  const items: LayoutItem[] = [
    { i: "kpis", x: 0, y: 0, w: kpis.w, h: kpis.h, minW: kpis.minW, minH: kpis.minH },
    { i: "funnel", x: 0, y: kpis.h, w: funnel.w, h: funnel.h, minW: funnel.minW, minH: funnel.minH },
  ];
  items.push(...packStages(stageIds, kpis.h + funnel.h));
  const afterStages = kpis.h + funnel.h + Math.ceil(stageIds.length / STAGE_PER_ROW) * STAGE_DEFAULT.h;
  items.push(
    { i: "usage", x: 0, y: afterStages, ...DEFAULT_SIZES.usage },
    { i: "evolution", x: 6, y: afterStages, ...DEFAULT_SIZES.evolution },
    { i: "agents", x: 0, y: afterStages + DEFAULT_SIZES.usage.h, ...DEFAULT_SIZES.agents },
    { i: "sources", x: 6, y: afterStages + DEFAULT_SIZES.evolution.h, ...DEFAULT_SIZES.sources },
    { i: "exceptions", x: 0, y: afterStages + DEFAULT_SIZES.usage.h + DEFAULT_SIZES.agents.h, ...DEFAULT_SIZES.exceptions },
  );
  cardIds.forEach((id, idx) => {
    items.push({
      i: id,
      x: (idx % STAGE_PER_ROW) * 4,
      y: afterStages + DEFAULT_SIZES.usage.h + DEFAULT_SIZES.agents.h + DEFAULT_SIZES.exceptions.h + Math.floor(idx / STAGE_PER_ROW) * CUSTOM_DEFAULT.h,
      w: CUSTOM_DEFAULT.w,
      h: CUSTOM_DEFAULT.h,
      minW: CUSTOM_DEFAULT.minW,
      minH: CUSTOM_DEFAULT.minH,
    });
  });
  return compactNegociosLayout(items);
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
 * Does not compact — packing on load was rewriting a valid arrangement.
 */
export function adoptSavedLayout(
  saved: Layout | null,
  cards: NegociosCustomCard[],
  stageIds: string[],
): Layout {
  const expected = [
    ...DEAL_CORE_WIDGET_IDS,
    ...stageIds.map(stageWidgetId),
    ...cards.map((c) => `card:${c.id}`),
  ];
  const expectedSet = new Set<string>(expected);
  const byId = new Map((saved ?? []).filter(isLayoutItem).map((item) => [item.i, item]));
  const kept: Layout = [];
  for (const item of saved ?? []) {
    if (!isLayoutItem(item) || !expectedSet.has(item.i)) continue;
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

function mergeLayout(saved: Layout | null, cards: NegociosCustomCard[], stageIds: string[]): Layout {
  return compactNegociosLayout(adoptSavedLayout(saved, cards, stageIds));
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
  const fromSaved = stageIdsFromLayout(saved);
  const stageIds = fromSaved.length ? fromSaved : mockStages;
  const usageChartType = parseUsageChartType(parsed.usageChartType);
  const legacy = parsed.version !== 2 || saved.some((item) => item.i === "stages");
  if (legacy) {
    const source = resetBloated(saved.filter((item) => item.i !== "stages"));
    return { version: 2, layout: mergeLayout(source, cards, stageIds), cards, usageChartType };
  }
  return { version: 2, layout: adoptSavedLayout(saved, cards, stageIds), cards, usageChartType };
}

function emptyStore(): NegociosGridStore {
  const mockStages = isPageMockMode() ? MOCK_FUNNEL_STAGE_IDS : [];
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
    return {
      version: 2,
      layout: defaultNegociosLayout(
        cards.map((c) => `card:${c.id}`),
        MOCK_FUNNEL_STAGE_IDS,
      ),
      cards,
      usageChartType: DEFAULT_USAGE_CHART_TYPE,
    };
  }
  return {
    version: 2,
    layout: defaultNegociosLayout([], mockStages),
    cards: [],
    usageChartType: DEFAULT_USAGE_CHART_TYPE,
  };
}

function readLocalStore(prefix: string, keyPart: string, userId: string): NegociosGridStore | null {
  const raw = readJsonWithFallback<unknown>(prefix, keyPart, userId);
  return parseStore(raw);
}

export function useNegociosGrid() {
  const { ready, userId, keyPart } = useDashboardStorageScope();
  const storageKey = keyPart ? scopedKey(NEGOCIOS_GRID_KEY_PREFIX, keyPart) : "";

  const [store, setStore] = useState<NegociosGridStore>(() => ({
    version: 2,
    layout: defaultNegociosLayout(),
    cards: [],
    usageChartType: DEFAULT_USAGE_CHART_TYPE,
  }));
  const [hydrated, setHydrated] = useState(false);
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready || !keyPart || !userId) return;
    let cancelled = false;
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
      }, 400);
    },
    [hydrated, storageKey],
  );

  useEffect(() => {
    return () => {
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
    };
  }, []);

  const setLayout = useCallback(
    (layout: Layout) => {
      if (!hydrated) return;
      const incomingStages = stageIdsFromLayout(layout);
      const stageIds = incomingStages.length ? incomingStages : stageIdsFromLayout(store.layout);
      const next = adoptSavedLayout(layout, store.cards, stageIds);
      if (sameLayout(next, store.layout)) return;
      persist({
        version: 2,
        layout: next,
        cards: store.cards,
        usageChartType: store.usageChartType,
      });
    },
    [hydrated, persist, store],
  );

  const syncStages = useCallback(
    (stageIds: string[]) => {
      if (!hydrated) return;
      const current = stageIdsFromLayout(store.layout);
      if (sameStageSet(current, stageIds)) return;
      const next = adoptSavedLayout(store.layout, store.cards, stageIds);
      if (sameLayout(next, store.layout)) return;
      persist({
        version: 2,
        layout: next,
        cards: store.cards,
        usageChartType: store.usageChartType,
      });
    },
    [hydrated, persist, store],
  );

  const addCard = useCallback(
    (card: NegociosCustomCard) => {
      if (!hydrated) return;
      const cards = [...store.cards, card];
      const layout = adoptSavedLayout(store.layout, cards, stageIdsFromLayout(store.layout));
      persist({ version: 2, layout, cards, usageChartType: store.usageChartType });
    },
    [hydrated, persist, store],
  );

  const removeCard = useCallback(
    (id: string) => {
      if (!hydrated) return;
      const cards = store.cards.filter((c) => c.id !== id);
      persist({
        version: 2,
        layout: adoptSavedLayout(store.layout, cards, stageIdsFromLayout(store.layout)),
        cards,
        usageChartType: store.usageChartType,
      });
    },
    [hydrated, persist, store],
  );

  const setUsageChartType = useCallback(
    (usageChartType: DashboardChartType) => {
      if (!hydrated) return;
      if (store.usageChartType === usageChartType) return;
      persist({
        version: 2,
        layout: store.layout,
        cards: store.cards,
        usageChartType,
      });
    },
    [hydrated, persist, store],
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
    widgetIds,
    setLayout,
    syncStages,
    addCard,
    removeCard,
    setUsageChartType,
    defaultSizes: DEFAULT_SIZES,
  };
}
