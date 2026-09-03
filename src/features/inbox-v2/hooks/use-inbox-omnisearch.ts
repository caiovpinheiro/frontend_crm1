"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { SEARCH_DEBOUNCE_MS, normalizeSearchQuery } from "@/lib/search-query";
import {
  fetchContacts,
  type ContactListItemDto,
} from "@/features/directory-v2/api";
import { fetchDealsList, type DealListItemDto } from "@/features/pipeline-v2/api/list";

import { listConversations, type ConversationListRow } from "../api";

const RESULT_LIMIT = 8;
/** Só no fallback: tickets extras pra colapsar 1 contato. */
const FETCH_LIMIT = 80;

function isOpenTicket(row: ConversationListRow) {
  return row.status !== "RESOLVED" && !row.closedAt;
}

function ticketRecency(row: ConversationListRow) {
  return Date.parse(row.lastMessageAt ?? row.updatedAt ?? "") || 0;
}

function phoneDigits(phone: string | null | undefined) {
  return (phone ?? "").replace(/\D+/g, "");
}

function preferSearchTicket(
  a: ConversationListRow,
  b: ConversationListRow,
): ConversationListRow {
  const aOpen = isOpenTicket(a);
  const bOpen = isOpenTicket(b);
  if (aOpen !== bOpen) return aOpen ? a : b;
  return ticketRecency(b) > ticketRecency(a) ? b : a;
}

function contactGroupKey(row: ConversationListRow) {
  if (row.contact?.id) return `id:${row.contact.id}`;
  const digits = phoneDigits(row.contact?.phone);
  if (digits.length >= 8) return `tel:${digits.slice(-11)}`;
  return `ticket:${row.id}`;
}

/** Um hit por contato: ticket OPEN, senão o mais recente. */
export function collapseConversationsByContact(
  rows: ConversationListRow[],
  limit = RESULT_LIMIT,
): ConversationListRow[] {
  const byContact = new Map<string, ConversationListRow>();
  for (const row of rows) {
    const key = contactGroupKey(row);
    const prev = byContact.get(key);
    byContact.set(key, prev ? preferSearchTicket(prev, row) : row);
  }
  return [...byContact.values()]
    .sort((a, b) => {
      const openDelta = Number(isOpenTicket(b)) - Number(isOpenTicket(a));
      if (openDelta !== 0) return openDelta;
      return ticketRecency(b) - ticketRecency(a);
    })
    .slice(0, limit);
}

function contactFromTicket(row: ConversationListRow): ContactListItemDto {
  const c = row.contact;
  return {
    id: c?.id || row.id,
    name: c?.name || "Contato",
    email: c?.email ?? null,
    phone: c?.phone ?? null,
    avatarUrl: c?.avatarUrl ?? null,
    leadScore: null,
    lifecycleStage: null,
    source: null,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
    assignedTo: null,
    company: null,
    tags: [],
    customFields: {},
  };
}

export function useInboxOmnisearch(search: string, enabled = true) {
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const query = normalizeSearchQuery(debounced);
  const ready = enabled && query.length > 0;

  const contacts = useQuery({
    queryKey: ["inbox-omnisearch", "contacts", query],
    queryFn: () => fetchContacts({ search: query, page: 1, perPage: RESULT_LIMIT }),
    enabled: ready,
    staleTime: 15_000,
    retry: false,
  });

  const contactsFailed = contacts.isError;
  const contactsEmpty =
    contacts.isSuccess && (contacts.data?.items?.length ?? 0) === 0;

  const conversationFallback = useQuery({
    queryKey: ["inbox-omnisearch", "conversations-fallback", query],
    queryFn: () =>
      listConversations({
        tab: "todos",
        search: query,
        page: 1,
        perPage: FETCH_LIMIT,
      }),
    enabled: ready && (contactsFailed || contactsEmpty),
    staleTime: 15_000,
  });

  const deals = useQuery({
    queryKey: ["inbox-omnisearch", "deals", query],
    queryFn: () => fetchDealsList({ search: query, page: 1, perPage: RESULT_LIMIT }),
    enabled: ready,
    staleTime: 15_000,
  });

  const contactItems: ContactListItemDto[] =
    (contacts.data?.items?.length ?? 0) > 0
      ? (contacts.data?.items ?? [])
      : collapseConversationsByContact(
          (conversationFallback.data?.items ?? []).filter(Boolean),
        ).map(contactFromTicket);

  const dealItems: DealListItemDto[] = deals.data?.items ?? [];

  return {
    query,
    waitingDebounce: search.trim().length >= 3 && debounced !== search.trim(),
    isLoading:
      ready &&
      (contacts.isFetching ||
        conversationFallback.isFetching ||
        deals.isFetching) &&
      contactItems.length === 0 &&
      dealItems.length === 0,
    isError: (contacts.isError && conversationFallback.isError) || deals.isError,
    contacts: contactItems,
    deals: dealItems,
  };
}
