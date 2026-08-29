"use client";

import { useQuery } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";

export type TabulationAnalyticsResponse = {
  total: number;
  page: number;
  perPage: number;
  distinctTabulations: number;
  distinctUsers: number;
  byTabulation: Array<{
    tabulationId: string;
    name: string;
    number?: number | null;
    path: string;
    departmentId: string | null;
    departmentName: string | null;
    count: number;
  }>;
  byUser: Array<{ userId: string; name: string; count: number }>;
  items: Array<{
    id: string;
    occurredAt: string;
    conversationId: string | null;
    contactName: string | null;
    actorName: string | null;
    tabulationPath: string | null;
    tabulationNumber?: number | null;
    departmentName: string | null;
  }>;
};

export function useTabulationAnalytics({
  fromIso,
  toIso,
  actorUserId,
  departmentId,
  page,
  enabled = true,
}: {
  fromIso: string;
  toIso: string;
  actorUserId: string;
  departmentId: string;
  page: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ["tabulation-analytics", fromIso, toIso, actorUserId, departmentId, page],
    queryFn: async (): Promise<TabulationAnalyticsResponse> => {
      const sp = new URLSearchParams();
      if (fromIso) sp.set("from", fromIso);
      if (toIso) sp.set("to", toIso);
      if (actorUserId) sp.set("actorUserId", actorUserId);
      if (departmentId) sp.set("departmentId", departmentId);
      sp.set("page", String(page));
      sp.set("perPage", "25");
      const res = await fetch(apiUrl(`/api/analytics/tabulations?${sp}`), {
        credentials: "include",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          message?: string;
          detail?: string;
        };
        throw new Error(
          [err.message ?? `Erro ao carregar dashboard (HTTP ${res.status})`, err.detail]
            .filter(Boolean)
            .join(" — "),
        );
      }
      return res.json();
    },
    enabled: enabled && Boolean(fromIso && toIso),
    staleTime: 15_000,
  });
}
