"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  fetchActivityFeed,
  type ActivityFeedFilters,
} from "./api";

/** Uma página do feed — cursor opaco `${occurredAtMs}_${id}`. */
export function useActivityFeed(
  filters: ActivityFeedFilters,
  cursor: string | null,
) {
  return useQuery({
    queryKey: ["activity-feed", filters, cursor],
    queryFn: () => fetchActivityFeed(filters, cursor),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
