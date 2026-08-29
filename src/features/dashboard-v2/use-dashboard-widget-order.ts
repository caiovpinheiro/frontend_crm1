"use client";

import { useCallback, useEffect, useState } from "react";

import {
  readJsonWithFallback,
  scopedKey,
  useDashboardStorageScope,
  writeJson,
} from "@/features/dashboard-v2/dashboard-persist";

export const DEAL_WIDGET_IDS = [
  "kpis",
  "funnel",
  "evolution",
  "agents",
  "sources",
  "exceptions",
] as const;

export const SERVICE_WIDGET_IDS = [
  "agora",
  "volume",
  "heatmap",
  "tempo",
  "summaries",
  "connections",
  "attendants",
  "channels",
  "exceptions",
] as const;

export const TABULATION_WIDGET_IDS = ["kpis", "top", "byUser", "log"] as const;

export const SERVICE_BOARD_WIDGET_IDS = [
  ...SERVICE_WIDGET_IDS,
  ...TABULATION_WIDGET_IDS,
] as const;

export const OPERATOR_WIDGET_IDS = [
  "kpis",
  "conversations",
  "tasks",
  "stalled",
] as const;

export type DealWidgetId = (typeof DEAL_WIDGET_IDS)[number];
export type ServiceWidgetId = (typeof SERVICE_WIDGET_IDS)[number];
export type TabulationWidgetId = (typeof TABULATION_WIDGET_IDS)[number];
export type ServiceBoardWidgetId = (typeof SERVICE_BOARD_WIDGET_IDS)[number];
export type OperatorWidgetId = (typeof OPERATOR_WIDGET_IDS)[number];

const TABULATION_ID_SET = new Set<string>(TABULATION_WIDGET_IDS);

export function isTabulationWidgetId(id: string): id is TabulationWidgetId {
  return TABULATION_ID_SET.has(id);
}

const TAB_STORAGE: Record<string, string> = {
  deals: "dashboard-widget-order-negocios",
  service: "dashboard-widget-order-atendimento",
  tabulations: "dashboard-widget-order-tabulacoes",
  operator: "dashboard-widget-order-fila",
};

type OrderStore = {
  order: string[];
  hidden?: string[];
};

function migrateTabulationIds(ids: string[]): string[] {
  const next: string[] = [];
  for (const id of ids) {
    if (id === "rankings") {
      next.push("top", "byUser");
    } else {
      next.push(id);
    }
  }
  return next;
}

function mergeOrder(
  saved: string[] | null,
  defaults: readonly string[],
  fillMissing: boolean,
): string[] {
  const known = new Set(defaults);
  const next = migrateTabulationIds(saved ?? []).filter((id) => known.has(id));
  if (fillMissing) {
    for (const id of defaults) {
      if (!next.includes(id)) next.push(id);
    }
  }
  return next.length ? next : [...defaults];
}

function parseStore(raw: unknown, defaults: readonly string[], allowHide: boolean): OrderStore {
  if (Array.isArray(raw) && raw.every((id) => typeof id === "string")) {
    return { order: mergeOrder(raw, defaults, true), hidden: [] };
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as OrderStore).order)) {
    const stored = raw as OrderStore;
    const hidden = (stored.hidden ?? []).filter((id) => defaults.includes(id as never));
    const order = mergeOrder(stored.order, defaults, !allowHide).filter(
      (id) => !hidden.includes(id),
    );
    return { order: order.length ? order : [...defaults].filter((id) => !hidden.includes(id)), hidden };
  }
  return { order: [...defaults], hidden: [] };
}

function persistValue(store: OrderStore, allowHide: boolean): unknown {
  return allowHide ? store : store.order;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function idsFromRaw(raw: unknown): { order: string[]; hidden: string[] } {
  if (Array.isArray(raw) && raw.every((id) => typeof id === "string")) {
    return { order: migrateTabulationIds(raw), hidden: [] };
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as OrderStore).order)) {
    const stored = raw as OrderStore;
    return {
      order: migrateTabulationIds(stored.order),
      hidden: migrateTabulationIds(
        (stored.hidden ?? []).filter((id): id is string => typeof id === "string"),
      ),
    };
  }
  return { order: [], hidden: [] };
}

/** Visible tabulation widgets from the retired Tabulações board. */
export function readLegacyTabulationOrder(
  keyPart: string,
  userId: string,
): OrderStore | null {
  const prefix = TAB_STORAGE.tabulations;
  const saved = readJsonWithFallback<unknown>(prefix, keyPart, userId);
  if (saved == null) return null;
  return parseStore(saved, [...TABULATION_WIDGET_IDS], true);
}

function adoptTabulationsOntoService(service: OrderStore, legacy: OrderStore | null): OrderStore {
  const serviceCore = service.order.filter((id) => !TABULATION_ID_SET.has(id));
  if (!legacy) {
    return {
      order: [...serviceCore, ...TABULATION_WIDGET_IDS],
      hidden: (service.hidden ?? []).filter((id) => !TABULATION_ID_SET.has(id)),
    };
  }
  return {
    order: [...serviceCore, ...legacy.order],
    hidden: uniqueIds([
      ...(service.hidden ?? []).filter((id) => !TABULATION_ID_SET.has(id)),
      ...(legacy.hidden ?? []),
      ...TABULATION_WIDGET_IDS.filter(
        (id) => !legacy.order.includes(id) && !(legacy.hidden ?? []).includes(id),
      ),
    ]),
  };
}

const NEGOCIOS_TAB_TO_SERVICE: Record<string, TabulationWidgetId> = {
  tabKpis: "kpis",
  tabTop: "top",
  tabByUser: "byUser",
  tabLog: "log",
};

const NEGOCIOS_TAB_SNAPSHOT_PREFIX = "dashboard-tabulations-from-negocios";

function tabOrderFromNegociosRaw(raw: unknown): OrderStore | null {
  if (!raw || typeof raw !== "object") return null;
  const stored = raw as { layout?: unknown; hiddenWidgetIds?: unknown };
  const hidden = new Set(
    Array.isArray(stored.hiddenWidgetIds)
      ? stored.hiddenWidgetIds.filter((id): id is string => typeof id === "string")
      : [],
  );
  if (hidden.has("tabulations")) {
    hidden.add("tabKpis");
    hidden.add("tabTop");
    hidden.add("tabByUser");
    hidden.add("tabLog");
  }
  const order: TabulationWidgetId[] = [];
  if (Array.isArray(stored.layout)) {
    for (const item of stored.layout) {
      if (!item || typeof item !== "object") continue;
      const id = (item as { i?: unknown }).i;
      if (typeof id !== "string" || hidden.has(id)) continue;
      if (id === "tabulations") {
        for (const mapped of TABULATION_WIDGET_IDS) {
          if (!order.includes(mapped)) order.push(mapped);
        }
        continue;
      }
      const mapped = NEGOCIOS_TAB_TO_SERVICE[id];
      if (mapped && !order.includes(mapped)) order.push(mapped);
    }
  }
  if (!order.length) return null;
  return {
    order,
    hidden: TABULATION_WIDGET_IDS.filter((id) => !order.includes(id)),
  };
}

/** Call before Negócios persist strips tab widgets so Atendimentos can adopt them. */
export function snapshotNegociosTabulationsIfNeeded(keyPart: string, userId: string): void {
  const snapKey = scopedKey(NEGOCIOS_TAB_SNAPSHOT_PREFIX, keyPart);
  if (readJsonWithFallback<unknown>(NEGOCIOS_TAB_SNAPSHOT_PREFIX, keyPart, userId) != null) {
    return;
  }
  const raw = readJsonWithFallback<unknown>("dashboard-negocios-grid", keyPart, userId);
  const from = tabOrderFromNegociosRaw(raw);
  writeJson(snapKey, from ?? { order: [], hidden: [...TABULATION_WIDGET_IDS] });
}

function readNegociosTabulationOrder(keyPart: string, userId: string): OrderStore | null {
  const snap = readJsonWithFallback<OrderStore>(NEGOCIOS_TAB_SNAPSHOT_PREFIX, keyPart, userId);
  if (snap && Array.isArray(snap.order) && snap.order.some((id) => TABULATION_ID_SET.has(id))) {
    return {
      order: snap.order.filter((id) => TABULATION_ID_SET.has(id)),
      hidden: (snap.hidden ?? []).filter((id) => TABULATION_ID_SET.has(id)),
    };
  }
  return tabOrderFromNegociosRaw(
    readJsonWithFallback<unknown>("dashboard-negocios-grid", keyPart, userId),
  );
}

function parseServiceBoard(
  raw: unknown,
  legacy: OrderStore | null,
  fromNegocios: OrderStore | null,
): OrderStore {
  const core = parseStore(raw, [...SERVICE_WIDGET_IDS], false);
  const saved = idsFromRaw(raw);
  const tabOrder = saved.order.filter((id) => TABULATION_ID_SET.has(id));
  const tabHidden = saved.hidden.filter((id) => TABULATION_ID_SET.has(id));
  if (tabOrder.length || tabHidden.length) {
    return {
      order: [...core.order.filter((id) => !TABULATION_ID_SET.has(id)), ...tabOrder],
      hidden: uniqueIds(tabHidden),
    };
  }
  return adoptTabulationsOntoService(core, legacy ?? fromNegocios);
}

export function useDashboardWidgetOrder(
  tab: keyof typeof TAB_STORAGE,
  defaults: readonly string[],
  options?: { allowHide?: boolean; enabled?: boolean; pinnedIds?: readonly string[] },
) {
  const allowHide = options?.allowHide ?? false;
  const enabled = options?.enabled ?? true;
  const pinnedIds = options?.pinnedIds;
  const { ready, userId, keyPart } = useDashboardStorageScope();
  const prefix = TAB_STORAGE[tab];
  const storageKey = keyPart ? scopedKey(prefix, keyPart) : "";
  const defaultsKey = defaults.join(",");
  const pinnedKey = pinnedIds?.join(",") ?? "";

  const [order, setOrder] = useState<string[]>(() => [...defaults]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!enabled || !ready || !keyPart || !userId) return;
    const saved = readJsonWithFallback<unknown>(prefix, keyPart, userId);
    let parsed =
      tab === "service"
        ? parseServiceBoard(
            saved,
            readLegacyTabulationOrder(keyPart, userId),
            readNegociosTabulationOrder(keyPart, userId),
          )
        : parseStore(saved, defaultsKey.split(","), allowHide);
    if (pinnedIds?.length) {
      const pinned = new Set(pinnedIds);
      const rest = parsed.order.filter((id) => !pinned.has(id));
      parsed = {
        order: uniqueIds([...mergeOrder(parsed.order, pinnedIds, true), ...rest]),
        hidden: (parsed.hidden ?? []).filter((id) => !pinned.has(id)),
      };
    }
    setOrder(parsed.order);
    setHidden(parsed.hidden ?? []);
    writeJson(scopedKey(prefix, keyPart), persistValue(parsed, allowHide));
    setHydrated(true);
  }, [allowHide, defaultsKey, enabled, keyPart, pinnedIds, pinnedKey, prefix, ready, tab, userId]);

  const write = useCallback(
    (nextOrder: string[], nextHidden: string[]) => {
      if (!enabled || !hydrated || !storageKey) return;
      const known = new Set(defaults);
      const pinned = new Set(pinnedIds ?? []);
      const hiddenIds = nextHidden.filter((id) => known.has(id) && !pinned.has(id));
      const orderIds = (allowHide ? nextOrder : mergeOrder(nextOrder, defaults, true)).filter(
        (id) => known.has(id) && !hiddenIds.includes(id),
      );
      if (pinnedIds?.length) {
        for (const id of pinnedIds) {
          if (!orderIds.includes(id)) orderIds.push(id);
        }
      }
      setOrder(orderIds);
      setHidden(hiddenIds);
      writeJson(storageKey, persistValue({ order: orderIds, hidden: hiddenIds }, allowHide));
    },
    [allowHide, defaults, enabled, hydrated, pinnedIds, storageKey],
  );

  const reorder = useCallback(
    (ids: string[]) => {
      write(ids, hidden);
    },
    [hidden, write],
  );

  const hide = useCallback(
    (id: string) => {
      if (!allowHide || pinnedIds?.includes(id)) return;
      write(
        order.filter((item) => item !== id),
        hidden.includes(id) ? hidden : [...hidden, id],
      );
    },
    [allowHide, hidden, order, pinnedIds, write],
  );

  const restore = useCallback(
    (id: string) => {
      if (!allowHide || order.includes(id)) return;
      write([...order, id], hidden.filter((item) => item !== id));
    },
    [allowHide, hidden, order, write],
  );

  return { order, hidden, reorder, hide, restore, hydrated };
}
