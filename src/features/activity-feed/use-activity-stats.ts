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

export function useActivityStats(
  enabled: boolean = true,
  range?: { dateFrom?: string; dateTo?: string },
) {
  const dateFrom = range?.dateFrom;
  const dateTo = range?.dateTo;

  return useQuery<ActivityStats>({
    queryKey: ["activity-feed-stats", dateFrom ?? null, dateTo ?? null],
    enabled,
    queryFn: async () => {
      if (isPageMockMode()) {
        return MOCK_ACTIVITY_STATS;
      }
      try {
        const sp = new URLSearchParams();
        if (dateFrom) sp.set("dateFrom", dateFrom);
        if (dateTo) sp.set("dateTo", dateTo);
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
            hasFilters: Boolean(dateFrom || dateTo),
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
