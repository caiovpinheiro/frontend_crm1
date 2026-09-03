"use client";

import {
  IconBriefcase,
  IconPhone,
  IconUsers,
} from "@tabler/icons-react";

import { sanitizeContactName } from "@/lib/display-name";
import { formatPhoneDisplay } from "@/lib/phone";
import type { ContactListItemDto } from "@/features/directory-v2/api";
import type { DealListItemDto } from "@/features/pipeline-v2/api/list";
import {
  OmnisearchHitAvatar,
  OmnisearchHitButton,
  OmnisearchResultsPanel,
  OmnisearchSection,
  OmnisearchStatusPill,
} from "@/components/crm/omnisearch-results";
import type { OmnisearchCoords } from "@/components/crm/use-omnisearch-menu";

const DEAL_STATUS: Record<DealListItemDto["status"], string> = {
  OPEN: "Aberto",
  WON: "Ganho",
  LOST: "Perdido",
};

export type InboxSearchHit =
  | { kind: "contact"; contact: ContactListItemDto }
  | { kind: "deal"; deal: DealListItemDto };

export function flattenInboxSearchHits(
  contacts: ContactListItemDto[],
  deals: DealListItemDto[],
): InboxSearchHit[] {
  return [
    ...contacts.map((contact) => ({ kind: "contact" as const, contact })),
    ...deals.map((deal) => ({ kind: "deal" as const, deal })),
  ];
}

export function InboxSearchResultsPanel({
  coords,
  loading,
  query,
  contacts,
  deals,
  activeIndex,
  onActiveIndexChange,
  onPickContact,
  onPickDeal,
  onSeeAll,
}: {
  coords: OmnisearchCoords;
  loading: boolean;
  query: string;
  contacts: ContactListItemDto[];
  deals: DealListItemDto[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onPickContact: (contact: ContactListItemDto) => void;
  onPickDeal: (id: string) => void;
  onSeeAll?: () => void;
}) {
  const empty = !loading && contacts.length === 0 && deals.length === 0;
  const total = contacts.length + deals.length;
  const dealOffset = contacts.length;

  return (
    <OmnisearchResultsPanel
      coords={coords}
      loading={loading}
      query={query}
      empty={empty}
      total={total}
      onSeeAll={onSeeAll}
    >
      {contacts.length > 0 && (
        <OmnisearchSection
          icon={<IconUsers size={13} />}
          label="Contatos"
          count={contacts.length}
        >
          {contacts.map((contact, i) => (
            <ContactHit
              key={contact.id}
              contact={contact}
              active={i === activeIndex}
              onHover={() => onActiveIndexChange(i)}
              onClick={() => onPickContact(contact)}
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

function ContactHit({
  contact,
  active,
  onHover,
  onClick,
}: {
  contact: ContactListItemDto;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const name = sanitizeContactName(contact.name) || "Contato";
  const phone = formatPhoneDisplay(contact.phone) || contact.phone?.trim() || null;

  return (
    <OmnisearchHitButton active={active} onHover={onHover} onClick={onClick}>
      <OmnisearchHitAvatar
        id={contact.id}
        name={name}
        imageUrl={contact.avatarUrl}
        overlay={<IconUsers size={10} />}
      />
      <span className="min-w-0 flex-1">
        <span className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
          {name}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 font-body text-[12px] text-[var(--text-secondary)]">
          <IconPhone size={12} className="shrink-0 text-[var(--text-muted)]" />
          <span className="truncate">{phone || contact.email || "Abrir conversa"}</span>
        </span>
      </span>
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
