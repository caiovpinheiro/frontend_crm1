"use client";

import { TagChip } from "@/components/crm/tag-chip";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { TagsPopover } from "@/features/inbox-v2/extras";
import { ContactTagsPopover } from "@/features/inbox-v2/extras/contact-tags-popover";
import { DealTagsPopover } from "@/features/pipeline-v2/extras/deal-tags-popover";

type TagItem = { id: string; name: string; color: string | null };

// ── DealTagsTray — chips das tags do negócio + botão para adicionar/remover.
// Mostra as 2 primeiras; a lista completa fica no popover ("Selecionadas").
export function DealTagsTray({
  dealId,
  currentTags,
}: {
  dealId: string;
  currentTags: TagItem[];
}) {
  const MAX_VISIBLE = 2;
  const visible = currentTags.slice(0, MAX_VISIBLE);

  function chip(t: TagItem) {
    return (
      <TooltipGlass key={t.id} label={t.name} side="top">
        <TagChip
          name={t.name}
          color={t.color}
          className="h-5 min-w-0 max-w-[12rem] shrink"
        />
      </TooltipGlass>
    );
  }

  // Uma linha: chips truncam com tooltip; "+" fixo à direita. Excedente
  // fica em "Selecionadas" no popover.
  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
      {visible.map(chip)}
      <span className="ml-auto shrink-0 pl-1">
        <DealTagsPopover dealId={dealId} currentTags={currentTags} />
      </span>
    </div>
  );
}

// ── ContactTagsTray — mesmo padrao de DealTagsTray, so troca o popover ──
export function ContactTagsTray({
  contactId,
  currentTags,
}: {
  contactId: string;
  currentTags: TagItem[];
}) {
  const MAX_VISIBLE = 2;
  const visible = currentTags.slice(0, MAX_VISIBLE);

  function chip(t: TagItem) {
    return (
      <TooltipGlass key={t.id} label={t.name} side="top">
        <TagChip
          name={t.name}
          color={t.color}
          className="h-5 min-w-0 max-w-[12rem] shrink"
        />
      </TooltipGlass>
    );
  }

  // Mesmo layout do DealTagsTray: uma linha, "+" à direita.
  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
      {visible.map(chip)}
      <span className="ml-auto shrink-0 pl-1">
        <ContactTagsPopover contactId={contactId} currentTags={currentTags} triggerVariant="icon" />
      </span>
    </div>
  );
}

const MAX_ASIDE_TAGS = 2;

// Tags da conversa ativa — até 2 chips + "+N" para o restante, com o
// popover de gerenciamento.
export function ConversationTagsTray({
  conversationId,
  tags: activeTags,
}: {
  conversationId: string | null;
  tags: TagItem[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {activeTags.slice(0, MAX_ASIDE_TAGS).map((t) => {
        const hex = t.color ?? null;
        const clean = (hex ?? "").replace("#", "");
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        const valid = hex && ![r, g, b].some(Number.isNaN);
        const bg = valid ? `rgba(${r},${g},${b},0.14)` : "var(--color-enterprise-bg)";
        const fg = valid
          ? `rgb(${Math.max(0, r - 30)},${Math.max(0, g - 30)},${Math.max(0, b - 30)})`
          : "var(--brand-primary)";
        const border = valid ? `rgba(${r},${g},${b},0.30)` : "rgba(91,111,245,0.25)";
        return (
          <TooltipGlass key={t.id} label={t.name} side="top">
            <span
              className="inline-flex shrink-0 items-center rounded-full border px-2 py-px font-display text-[10.5px] font-semibold whitespace-nowrap"
              style={{ background: bg, color: fg, borderColor: border }}
            >
              {t.name}
            </span>
          </TooltipGlass>
        );
      })}
      {activeTags.length > MAX_ASIDE_TAGS && (
        <TooltipGlass label={activeTags.slice(MAX_ASIDE_TAGS).map((t) => t.name).join(", ")} side="top">
          <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-1.5 py-px font-display text-[10.5px] font-bold text-[var(--text-secondary)]">
            +{activeTags.length - MAX_ASIDE_TAGS}
          </span>
        </TooltipGlass>
      )}
      <TagsPopover
        conversationId={conversationId}
        currentTags={activeTags}
      />
    </div>
  );
}
