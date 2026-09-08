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
/** Tickets/negócios extras pra colapsar 1 hit por pessoa. */
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

/** Telefone primeiro: tickets/contatos duplicados do mesmo número viram um hit. */
function identityKey(id?: string | null, phone?: string | null) {
  const digits = phoneDigits(phone);
  if (digits.length >= 8) return `tel:${digits.slice(-11)}`;
  if (id) return `id:${id}`;
  return null;
}

function contactGroupKey(row: ConversationListRow) {
  return identityKey(row.contact?.id, row.contact?.phone) ?? `ticket:${row.id}`;
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

function isOpenDeal(deal: DealListItemDto) {
  return deal.status === "OPEN";
}

function dealRecency(deal: DealListItemDto) {
  return Date.parse(deal.updatedAt ?? deal.createdAt ?? "") || 0;
}

function preferSearchDeal(a: DealListItemDto, b: DealListItemDto): DealListItemDto {
  const aOpen = isOpenDeal(a);
  const bOpen = isOpenDeal(b);
  if (aOpen !== bOpen) return aOpen ? a : b;
  return dealRecency(b) > dealRecency(a) ? b : a;
}

function dealGroupKey(deal: DealListItemDto) {
  return (
    identityKey(deal.contactId ?? deal.contact?.id, deal.contact?.phone) ??
    `deal:${deal.id}`
  );
}

/** Um negócio por pessoa (aberto primeiro). */
export function collapseDealsByContact(
  deals: DealListItemDto[],
  limit = RESULT_LIMIT,
): DealListItemDto[] {
  const byContact = new Map<string, DealListItemDto>();
  for (const deal of deals) {
    const key = dealGroupKey(deal);
    const prev = byContact.get(key);
    byContact.set(key, prev ? preferSearchDeal(prev, deal) : deal);
  }
  return [...byContact.values()]
    .sort((a, b) => {
      const openDelta = Number(isOpenDeal(b)) - Number(isOpenDeal(a));
      if (openDelta !== 0) return openDelta;
      return dealRecency(b) - dealRecency(a);
    })
    .slice(0, limit);
}

function collapseContactsByIdentity(
  contacts: ContactListItemDto[],
  limit = RESULT_LIMIT,
): ContactListItemDto[] {
  const byKey = new Map<string, ContactListItemDto>();
  for (const contact of contacts) {
    const key = identityKey(contact.id, contact.phone) ?? `id:${contact.id}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, contact);
      continue;
    }
    const prevTs = Date.parse(prev.updatedAt ?? "") || 0;
    const nextTs = Date.parse(contact.updatedAt ?? "") || 0;
    byKey.set(key, nextTs >= prevTs ? contact : prev);
  }
  return [...byKey.values()].slice(0, limit);
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
    queryFn: () => fetchContacts({ search: query, page: 1, perPage: FETCH_LIMIT }),
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
    queryFn: () => fetchDealsList({ search: query, page: 1, perPage: FETCH_LIMIT }),
    enabled: ready,
    staleTime: 15_000,
  });

  const contactItems: ContactListItemDto[] =
    (contacts.data?.items?.length ?? 0) > 0
      ? collapseContactsByIdentity(contacts.data?.items ?? [])
      : collapseConversationsByContact(
          (conversationFallback.data?.items ?? []).filter(Boolean),
        ).map(contactFromTicket);

  const contactKeys = new Set(
    contactItems.map((c) => identityKey(c.id, c.phone) ?? `id:${c.id}`),
  );

  const dealItems: DealListItemDto[] = collapseDealsByContact(
    deals.data?.items ?? [],
  ).filter((deal) => {
    const key = dealGroupKey(deal);
    return !contactKeys.has(key);
  });

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
