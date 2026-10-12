"use client";

import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import { isPageMockMode, shouldAutoDemoEmpty } from "@/lib/page-mock-mode";
import { MOCK_ACTIVITY_STATS } from "./mock-stats";

export type ActivityStatsActorKey =
  | "HUMAN"
  | "AI"
  | "AUTOMATION"
  | "INTEGRATION"
  | "SYSTEM";

export type ActivityStatsTimelinePoint = {
  day: string;
  count: number;
};

export type ActivityStatsTimelineByActor = {
  day: string;
  HUMAN: number;
  AI: number;
  AUTOMATION: number;
  INTEGRATION: number;
  SYSTEM: number;
};

export type ActivityStatsHourPoint = {
  hour: number;
  count: number;
};

export type ActivityStats = {
  window: { from: string; to: string };
  totals: {
    total: number;
    byActorType: Record<string, number>;
    byEntityType: Record<string, number>;
    byType: Array<{ type: string; count: number }>;
  };
  timeline: ActivityStatsTimelinePoint[];
  timelineByActor?: ActivityStatsTimelineByActor[];
  hourly?: ActivityStatsHourPoint[];
};

/**
 * `dateFrom`/`dateTo` (aba Estatísticas de Logs) ou `period` (+ `startDate`/
 * `endDate` quando `custom`), o mesmo período de `/api/painel/*` — usado pelos
 * cards do Dashboard. Sem nenhum, o backend usa 30 dias.
 */
export type ActivityStatsRange = {
  dateFrom?: string;
  dateTo?: string;
  period?: string;
  startDate?: string;
  endDate?: string;
};

export function useActivityStats(enabled: boolean = true, range?: ActivityStatsRange) {
  const dateFrom = range?.dateFrom;
  const dateTo = range?.dateTo;
  const period = range?.period;
  const custom = period === "custom";
  const startDate = custom ? range?.startDate : undefined;
  const endDate = custom ? range?.endDate : undefined;

  return useQuery<ActivityStats>({
    queryKey: [
      "activity-feed-stats",
      dateFrom ?? null,
      dateTo ?? null,
      ...(period ? [period, startDate ?? null, endDate ?? null] : []),
    ],
    enabled,
    queryFn: async () => {
      if (isPageMockMode()) {
        return MOCK_ACTIVITY_STATS;
      }
      try {
        const sp = new URLSearchParams();
        if (dateFrom) sp.set("dateFrom", dateFrom);
        if (dateTo) sp.set("dateTo", dateTo);
        if (period) sp.set("period", period);
        if (startDate) sp.set("startDate", startDate);
        if (endDate) sp.set("endDate", endDate);
        const qs = sp.toString();
        const res = await fetch(
          apiUrl(`/api/activity-feed/stats${qs ? `?${qs}` : ""}`),
          { credentials: "include" },
        );
        if (!res.ok) throw new Error("Falha ao carregar estatísticas");
        const data = (await res.json()) as ActivityStats;
        if (
          shouldAutoDemoEmpty({
            realCount: data.totals.total,
            hasFilters: Boolean(dateFrom || dateTo || period),
            isLoading: false,
          })
        ) {
          return MOCK_ACTIVITY_STATS;
        }
        return data;
      } catch {
        return MOCK_ACTIVITY_STATS;
      }
    },
    staleTime: 60_000,
  });
}
