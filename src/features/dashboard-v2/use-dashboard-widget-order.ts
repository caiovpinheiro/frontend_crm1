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

export const OPERATOR_WIDGET_IDS = [
  "kpis",
  "conversations",
  "tasks",
  "stalled",
] as const;

export type DealWidgetId = (typeof DEAL_WIDGET_IDS)[number];
export type ServiceWidgetId = (typeof SERVICE_WIDGET_IDS)[number];
export type TabulationWidgetId = (typeof TABULATION_WIDGET_IDS)[number];
export type OperatorWidgetId = (typeof OPERATOR_WIDGET_IDS)[number];

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

export function useDashboardWidgetOrder(
  tab: keyof typeof TAB_STORAGE,
  defaults: readonly string[],
  options?: { allowHide?: boolean; enabled?: boolean },
) {
  const allowHide = options?.allowHide ?? false;
  const enabled = options?.enabled ?? true;
  const { ready, userId, keyPart } = useDashboardStorageScope();
  const prefix = TAB_STORAGE[tab];
  const storageKey = keyPart ? scopedKey(prefix, keyPart) : "";
  const defaultsKey = defaults.join(",");

  const [order, setOrder] = useState<string[]>(() => [...defaults]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!enabled || !ready || !keyPart || !userId) return;
    const saved = readJsonWithFallback<unknown>(prefix, keyPart, userId);
    const parsed = parseStore(saved, defaultsKey.split(","), allowHide);
    setOrder(parsed.order);
    setHidden(parsed.hidden ?? []);
    writeJson(scopedKey(prefix, keyPart), persistValue(parsed, allowHide));
    setHydrated(true);
  }, [allowHide, defaultsKey, enabled, keyPart, prefix, ready, userId]);

  const write = useCallback(
    (nextOrder: string[], nextHidden: string[]) => {
      if (!enabled || !hydrated || !storageKey) return;
      const known = new Set(defaults);
      const hiddenIds = nextHidden.filter((id) => known.has(id));
      const orderIds = (allowHide ? nextOrder : mergeOrder(nextOrder, defaults, true)).filter(
        (id) => known.has(id) && !hiddenIds.includes(id),
      );
      setOrder(orderIds);
      setHidden(hiddenIds);
      writeJson(storageKey, persistValue({ order: orderIds, hidden: hiddenIds }, allowHide));
    },
    [allowHide, defaults, enabled, hydrated, storageKey],
  );

  const reorder = useCallback(
    (ids: string[]) => {
      write(ids, hidden);
    },
    [hidden, write],
  );

  const hide = useCallback(
    (id: string) => {
      if (!allowHide) return;
      write(
        order.filter((item) => item !== id),
        hidden.includes(id) ? hidden : [...hidden, id],
      );
    },
    [allowHide, hidden, order, write],
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
