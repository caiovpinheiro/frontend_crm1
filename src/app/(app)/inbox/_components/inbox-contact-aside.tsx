"use client";

import dynamic from "next/dynamic";

import { RequirePermission } from "@/components/auth/require-permission";
import type { useConfirm } from "@/components/ui/confirm-dialog";
import type { ContactAsideView } from "@/features/inbox-v2/adapters";
import type { ContactDetail } from "@/features/inbox-v2/api";
import type { useInboxFirstDeal } from "@/features/inbox-v2/hooks/use-inbox-first-deal";

import { InboxDealOwnerSlot, InboxDealStageSlot } from "./inbox-deal-slots";
import { ContactTagsTray, ConversationTagsTray, DealTagsTray } from "./inbox-tags";

const ContactAside = dynamic(
  () =>
    import("@/components/crm/contact-aside").then((m) => ({
      default: m.ContactAside,
    })),
  { ssr: false },
);
const FieldConfigPanel = dynamic(
  () =>
    import("@/components/crm/fields/field-config-panel").then((m) => ({
      default: m.FieldConfigPanel,
    })),
  { ssr: false },
);

/** Painel do contato (aside) da conversa ativa, com os slots do 1º negócio. */
export function InboxContactAside({
  contactAsideView,
  firstDeal,
  conversationId,
  conversationAssigneeId,
  confirmDialog,
  conversationTags,
  contactId,
  contactTags,
  collapsed,
  onToggleCollapse,
}: {
  contactAsideView: ContactAsideView;
  firstDeal: ReturnType<typeof useInboxFirstDeal>;
  conversationId: string | null;
  conversationAssigneeId: string | null;
  confirmDialog: ReturnType<typeof useConfirm>["confirm"];
  conversationTags: { id: string; name: string; color: string | null }[];
  contactId: string | null;
  contactTags: ContactDetail["tags"] | undefined;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const {
    firstDealId,
    firstDealDetail,
    firstDealPipelineId,
    firstDealPipelineName,
    boardStages,
    firstDealFunnelSegments,
    firstDealStageId,
    firstDealStageName,
  } = firstDeal;

  // Injeta funnelSegments + stageDropdownSlot + assigneeSlot apenas no primeiro deal.
  const dealsWithSlots = (contactAsideView.deals ?? []).map((d, idx) => {
    if (idx !== 0) return d;
    const dealOwnerSlot = firstDealId ? (
        <InboxDealOwnerSlot
          dealId={firstDealId}
          dealDetail={firstDealDetail}
          pipelineId={firstDealPipelineId}
          conversationId={conversationId}
          conversationAssigneeId={conversationAssigneeId}
          confirmDialog={confirmDialog}
        />
      ) : undefined;

    return {
      ...d,
      ...(boardStages.length
        ? {
            stageId: firstDealStageId ?? d.stageId,
            stageName: firstDealStageName ?? d.stageName,
            pipelineName: firstDealPipelineName ?? d.pipelineName,
            funnelSegments: firstDealFunnelSegments,
            stageDropdownSlot:
              firstDealId && firstDealStageId ? (
                <InboxDealStageSlot
                  dealId={firstDealId}
                  stageId={firstDealStageId}
                  pipelineId={firstDealPipelineId}
                  stages={boardStages}
                />
              ) : undefined,
          }
        : {}),
      assigneeSlot: dealOwnerSlot,
      dealTagsNode: (
        <DealTagsTray
          dealId={d.id}
          currentTags={(firstDealDetail as { tags?: { id: string; name: string; color: string | null }[] } | undefined)?.tags ?? []}
        />
      ),
    };
  });

  const contactAsideViewWithSlots = { ...contactAsideView, deals: dealsWithSlots };

  return (
    <ContactAside
      contact={contactAsideViewWithSlots}
      headerActionsNode={undefined}
      tagsNode={
        <ConversationTagsTray conversationId={conversationId} tags={conversationTags} />
      }
      contactTagsNode={
        // IB7: tags do CONTATO (mesmo padrao das tags de negocio) —
        // mostra 2 mais recentes + `+N` com tooltip pro resto + popover
        // pra adicionar/remover.
        contactId ? (
          <ContactTagsTray
            contactId={contactId}
            /* Backend (getContactById) devolve tags como TagOnContact[]
               = { contactId, tagId, tag: { id, name, color } }[]. Já a
               rota de list (getContacts) achata pra { id, name, color }[].
               Como ContactTagsTray/Popover esperam o shape achatado,
               normalizamos aqui — assim as pills ganham cor e label
               corretos (antes ficavam vazias). */
            currentTags={(contactTags ?? []).map((t) =>
              (t as unknown as { tag?: { id: string; name: string; color: string | null } }).tag
                ?? (t as unknown as { id: string; name: string; color: string | null })
            )}
          />
        ) : null
      }
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      contactFieldConfigSlot={
        <RequirePermission permission="settings:custom_fields">
          <FieldConfigPanel entities={["contact"]} context="inbox_lead_v2" />
        </RequirePermission>
      }
      dealFieldConfigSlot={
        <RequirePermission permission="settings:custom_fields">
          <FieldConfigPanel entities={["deal"]} context="inbox_lead_v2" />
        </RequirePermission>
      }
    />
  );
}
