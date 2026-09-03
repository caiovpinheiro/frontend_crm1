"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { SEARCH_DEBOUNCE_MS, normalizeSearchQuery } from "@/lib/search-query";
import { fetchDealsList, type DealListItemDto } from "@/features/pipeline-v2/api/list";

import { listConversations, type ConversationListRow } from "../api";

const RESULT_LIMIT = 8;

export function useInboxOmnisearch(search: string, enabled = true) {
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const query = normalizeSearchQuery(debounced);
  const ready = enabled && query.length > 0;

  const conversations = useQuery({
    queryKey: ["inbox-omnisearch", "conversations", query],
    queryFn: () =>
      listConversations({
        tab: "todos",
        search: query,
        page: 1,
        perPage: RESULT_LIMIT,
      }),
    enabled: ready,
    staleTime: 15_000,
  });

  const deals = useQuery({
    queryKey: ["inbox-omnisearch", "deals", query],
    queryFn: () => fetchDealsList({ search: query, page: 1, perPage: RESULT_LIMIT }),
    enabled: ready,
    staleTime: 15_000,
  });

  const conversationItems: ConversationListRow[] = (conversations.data?.items ?? []).filter(Boolean);
  const dealItems: DealListItemDto[] = deals.data?.items ?? [];

  return {
    query,
    waitingDebounce: search.trim().length >= 3 && debounced !== search.trim(),
    isLoading: ready && (conversations.isFetching || deals.isFetching) && conversationItems.length === 0 && dealItems.length === 0,
    isError: conversations.isError || deals.isError,
    conversations: conversationItems,
    deals: dealItems,
  };
}
