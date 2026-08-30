"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";

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
  actorUserIds,
  departmentIds,
  page,
  enabled = true,
}: {
  fromIso: string;
  toIso: string;
  actorUserIds: string[];
  departmentIds: string[];
  page: number;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const rangeStamp = `${fromIso}|${toIso}`;

  useEffect(() => {
    void queryClient.cancelQueries({
      predicate: (q) => {
        if (q.queryKey[0] !== "tabulation-analytics") return false;
        return q.queryKey[1] !== fromIso || q.queryKey[2] !== toIso;
      },
    });
  }, [rangeStamp, fromIso, toIso, queryClient]);

  return useQuery({
    queryKey: ["tabulation-analytics", fromIso, toIso, actorUserIds, departmentIds, page],
    queryFn: async ({ signal }): Promise<TabulationAnalyticsResponse> => {
      const sp = new URLSearchParams();
      if (fromIso) sp.set("from", fromIso);
      if (toIso) sp.set("to", toIso);
      if (actorUserIds.length === 1) {
        sp.set("actorUserId", actorUserIds[0]!);
      } else if (actorUserIds.length > 1) {
        sp.set("actorUserIds", actorUserIds.join(","));
      }
      if (departmentIds.length === 1) {
        sp.set("departmentId", departmentIds[0]!);
      } else if (departmentIds.length > 1) {
        sp.set("departmentIds", departmentIds.join(","));
      }
      sp.set("page", String(page));
      sp.set("perPage", "25");
      const res = await apiFetch(
        `/api/analytics/tabulations?${sp}`,
        { credentials: "include", signal },
        15_000,
      );
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
