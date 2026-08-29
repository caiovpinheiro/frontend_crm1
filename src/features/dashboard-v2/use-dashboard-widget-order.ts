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

export const TABULATION_WIDGET_IDS = ["kpis", "rankings", "log"] as const;

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

function mergeOrder(saved: string[] | null, defaults: readonly string[]): string[] {
  const known = new Set(defaults);
  const next = (saved ?? []).filter((id) => known.has(id));
  for (const id of defaults) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}


export function useDashboardWidgetOrder(
  tab: keyof typeof TAB_STORAGE,
  defaults: readonly string[],
) {
  const { ready, userId, keyPart } = useDashboardStorageScope();
  const prefix = TAB_STORAGE[tab];
  const storageKey = keyPart ? scopedKey(prefix, keyPart) : "";
  const defaultsKey = defaults.join(",");

  const [order, setOrder] = useState<string[]>(() => [...defaults]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!ready || !keyPart || !userId) return;
    const saved = readJsonWithFallback<string[]>(prefix, keyPart, userId);
    const raw =
      Array.isArray(saved) && saved.every((id) => typeof id === "string")
        ? saved
        : null;
    const next = mergeOrder(raw, defaultsKey.split(","));
    setOrder(next);
    writeJson(scopedKey(prefix, keyPart), next);
    setHydrated(true);
  }, [ready, keyPart, userId, prefix, defaultsKey]);

  const reorder = useCallback(
    (ids: string[]) => {
      if (!hydrated || !storageKey) return;
      const next = mergeOrder(ids, defaults);
      setOrder(next);
      writeJson(storageKey, next);
    },
    [defaults, hydrated, storageKey],
  );

  return { order, reorder, hydrated };
}
