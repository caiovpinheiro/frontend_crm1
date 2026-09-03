"use client";

import {
  IconBriefcase,
  IconMessage,
  IconPhone,
} from "@tabler/icons-react";

import { sanitizeContactName } from "@/lib/display-name";
import { formatPhoneDisplay } from "@/lib/phone";
import type { DealListItemDto } from "@/features/pipeline-v2/api/list";
import {
  OmnisearchHitAvatar,
  OmnisearchHitButton,
  OmnisearchResultsPanel,
  OmnisearchSection,
  OmnisearchStatusPill,
} from "@/components/crm/omnisearch-results";
import type { OmnisearchCoords } from "@/components/crm/use-omnisearch-menu";

import { toConversationCard } from "../adapters";
import type { ConversationListRow } from "../api";

const DEAL_STATUS: Record<DealListItemDto["status"], string> = {
  OPEN: "Aberto",
  WON: "Ganho",
  LOST: "Perdido",
};

export type InboxSearchHit =
  | { kind: "conversation"; row: ConversationListRow }
  | { kind: "deal"; deal: DealListItemDto };

export function flattenInboxSearchHits(
  conversations: ConversationListRow[],
  deals: DealListItemDto[],
): InboxSearchHit[] {
  return [
    ...conversations.map((row) => ({ kind: "conversation" as const, row })),
    ...deals.map((deal) => ({ kind: "deal" as const, deal })),
  ];
}

export function InboxSearchResultsPanel({
  coords,
  loading,
  query,
  conversations,
  deals,
  activeIndex,
  onActiveIndexChange,
  onPickConversation,
  onPickDeal,
}: {
  coords: OmnisearchCoords;
  loading: boolean;
  query: string;
  conversations: ConversationListRow[];
  deals: DealListItemDto[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onPickConversation: (row: ConversationListRow) => void;
  onPickDeal: (id: string) => void;
}) {
  const empty = !loading && conversations.length === 0 && deals.length === 0;
  const total = conversations.length + deals.length;
  const dealOffset = conversations.length;

  return (
    <OmnisearchResultsPanel
      coords={coords}
      loading={loading}
      query={query}
      empty={empty}
      total={total}
    >
      {conversations.length > 0 && (
        <OmnisearchSection
          icon={<IconMessage size={13} />}
          label="Conversas"
          count={conversations.length}
        >
          {conversations.map((row, i) => (
            <ConversationHit
              key={row.id}
              row={row}
              active={i === activeIndex}
              onHover={() => onActiveIndexChange(i)}
              onClick={() => onPickConversation(row)}
            />
          ))}
        </OmnisearchSection>
      )}
      {deals.length > 0 && (
        <OmnisearchSection
          icon={<IconBriefcase size={13} />}
          label="Negócios"
          count={deals.length}
        >
          {deals.map((deal, i) => {
            const index = dealOffset + i;
            return (
              <DealHit
                key={deal.id}
                deal={deal}
                active={index === activeIndex}
                onHover={() => onActiveIndexChange(index)}
                onClick={() => onPickDeal(deal.id)}
              />
            );
          })}
        </OmnisearchSection>
      )}
    </OmnisearchResultsPanel>
  );
}

function ConversationHit({
  row,
  active,
  onHover,
  onClick,
}: {
  row: ConversationListRow;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const card = toConversationCard(row);
  const phone = formatPhoneDisplay(row.contact?.phone) || row.contact?.phone?.trim() || null;
  const closed = row.status === "RESOLVED";

  return (
    <OmnisearchHitButton active={active} onHover={onHover} onClick={onClick}>
      <OmnisearchHitAvatar
        id={row.contact?.id ?? row.id}
        name={card.name}
        imageUrl={row.contact?.avatarUrl}
        overlay={<IconMessage size={10} />}
      />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
            {card.name}
          </span>
          {row.number != null && (
            <span className="shrink-0 font-body text-[12px] tabular-nums text-[var(--text-muted)]">
              #{row.number}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 font-body text-[12px] text-[var(--text-secondary)]">
          <IconPhone size={12} className="shrink-0 text-[var(--text-muted)]" />
          <span className="truncate">{phone || card.preview || "Abrir conversa"}</span>
        </span>
      </span>
      {closed && <OmnisearchStatusPill tone="muted">Encerrada</OmnisearchStatusPill>}
    </OmnisearchHitButton>
  );
}

function DealHit({
  deal,
  active,
  onHover,
  onClick,
}: {
  deal: DealListItemDto;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const name = sanitizeContactName(deal.contact?.name) || deal.title || "Negócio";
  const stage = deal.stage?.name?.trim() || null;

  return (
    <OmnisearchHitButton active={active} onHover={onHover} onClick={onClick}>
      <OmnisearchHitAvatar
        id={deal.contact?.id ?? deal.id}
        name={name}
        imageUrl={deal.contact?.avatarUrl}
        overlay={<IconBriefcase size={10} />}
      />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
            {name}
          </span>
          {deal.number != null && (
            <span className="shrink-0 font-body text-[12px] tabular-nums text-[var(--text-muted)]">
              #{deal.number}
            </span>
          )}
        </span>
        <span className="mt-0.5 truncate font-body text-[12px] text-[var(--text-secondary)]">
          {stage ? `Etapa ${stage}` : deal.title}
        </span>
      </span>
      <OmnisearchStatusPill tone={deal.status === "LOST" ? "danger" : "success"}>
        {DEAL_STATUS[deal.status]}
      </OmnisearchStatusPill>
    </OmnisearchHitButton>
  );
}
