import { apiUrl } from "@/lib/api";
import type { FeedEvent } from "@/components/crm/feed";

export type ActivityFeedFilters = {
  entityType?: string[];
  actorType?: string[];
  actorUserId?: string | null;
  type?: string[];
  entityId?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  conversationId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  q?: string | null;
  /** Transição de fase — quando qualquer campo é informado, o backend
   *  força type=STAGE_CHANGED e filtra pelos ids no meta JSON. */
  stagePipelineId?: string | null;
  stageFrom?: string[];
  stageTo?: string[];
  /** Só eventos CONVERSATION_TABULATED. */
  tabulated?: boolean;
  /** Folhas de tabulação (`meta.tabulationId`). */
  tabulationIds?: string[];
  limit?: number;
};

export type ActivityFeedPage = {
  items: ActivityFeedItem[];
  nextCursor: string | null;
};

/// Linha do feed retornada pela API. Estende `FeedEvent` com os campos
/// que o backend expoe (occurredAt/actorUser) em vez do legado
/// createdAt/user do DealEvent.
export type ActivityFeedItem = FeedEvent;

function buildQuery(filters: ActivityFeedFilters, cursor: string | null): string {
  const sp = new URLSearchParams();
  if (cursor) sp.set("cursor", cursor);
  if (filters.limit) sp.set("limit", String(filters.limit));
  if (filters.entityType?.length) sp.set("entityType", filters.entityType.join(","));
  if (filters.actorType?.length) sp.set("actorType", filters.actorType.join(","));
  if (filters.type?.length) sp.set("type", filters.type.join(","));
  if (filters.actorUserId) sp.set("actorUserId", filters.actorUserId);
  if (filters.entityId) sp.set("entityId", filters.entityId);
  if (filters.dealId) sp.set("dealId", filters.dealId);
  if (filters.contactId) sp.set("contactId", filters.contactId);
  if (filters.conversationId) sp.set("conversationId", filters.conversationId);
  if (filters.dateFrom) sp.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) sp.set("dateTo", filters.dateTo);
  if (filters.q) sp.set("q", filters.q);
  if (filters.stagePipelineId) sp.set("stagePipelineId", filters.stagePipelineId);
  if (filters.stageFrom?.length) sp.set("stageFrom", filters.stageFrom.join(","));
  if (filters.stageTo?.length) sp.set("stageTo", filters.stageTo.join(","));
  if (filters.tabulated || filters.tabulationIds?.length) sp.set("tabulated", "1");
  if (filters.tabulationIds?.length) {
    sp.set("tabulationId", filters.tabulationIds.join(","));
  }
  return sp.toString();
}

export async function fetchActivityFeed(
  filters: ActivityFeedFilters,
  cursor: string | null,
): Promise<ActivityFeedPage> {
  const qs = buildQuery(filters, cursor);
  const url = apiUrl(`/api/activity-feed${qs ? `?${qs}` : ""}`);
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Falha ao carregar feed (${res.status})`);
  }
  return (await res.json()) as ActivityFeedPage;
}
