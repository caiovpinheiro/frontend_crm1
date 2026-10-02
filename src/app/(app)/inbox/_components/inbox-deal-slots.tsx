"use client";

import { UserAvatar } from "@/components/crm/user-avatar";
import type { useConfirm } from "@/components/ui/confirm-dialog";
import { postConversationAction } from "@/features/inbox-v2/api";
import type { PipelineListStageDto } from "@/features/pipeline-v2/api";
import { AssigneePopover as DealOwnerPopover } from "@/features/pipeline-v2/extras/assignee-popover";
import { StagePicker } from "@/features/pipeline-v2/extras/stage-picker";
import type { useDealDetail } from "@/features/pipeline-v2/hooks";
import { ownerLabel } from "@/lib/utils";

import { InboxStageDropdown } from "./inbox-stage-dropdown";

/** Responsável do 1º negócio no card do ContactAside (com transferência do chat). */
export function InboxDealOwnerSlot({
  dealId,
  dealDetail: firstDealDetail,
  pipelineId,
  conversationId,
  conversationAssigneeId,
  confirmDialog,
}: {
  dealId: string;
  dealDetail: ReturnType<typeof useDealDetail>["data"];
  pipelineId: string | null;
  conversationId: string | null;
  conversationAssigneeId: string | null;
  confirmDialog: ReturnType<typeof useConfirm>["confirm"];
}) {
  return (
    <DealOwnerPopover
      dealId={dealId}
      currentOwnerId={firstDealDetail?.owner?.id ?? null}
      currentOwnerName={
        ownerLabel(
          firstDealDetail?.owner?.name,
          (firstDealDetail?.owner as { type?: string | null } | undefined)?.type,
        ) || null
      }
      pipelineId={pipelineId}
      conversationId={conversationId}
      conversationAssigneeId={conversationAssigneeId}
      askTransferConversation={async ({ newOwnerId, newOwnerName }) => {
        const name = newOwnerName.trim() || "este responsável";
        if (newOwnerId) {
          return confirmDialog({
            title: "Transferir a conversa também?",
            description: `O responsável do negócio será ${name}. Transferir também a conversa para ${name}?`,
            confirmLabel: "Sim, transferir conversa",
            cancelLabel: "Só o negócio",
          });
        }
        return confirmDialog({
          title: "Remover da conversa também?",
          description:
            "O negócio ficará sem responsável. Remover também o responsável da conversa?",
          confirmLabel: "Sim, remover da conversa",
          cancelLabel: "Só o negócio",
        });
      }}
      onTransferConversation={async (assignedToId) => {
        if (!conversationId) return;
        await postConversationAction(conversationId, {
          action: "assign",
          assignedToId,
        });
      }}
      trigger={
        firstDealDetail?.owner?.name ? (
          <span
            className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-white py-px pl-px pr-2 text-[#2e3b6e] shadow-sm transition-colors hover:bg-white/90"
            title={ownerLabel(
              firstDealDetail.owner.name,
              (firstDealDetail.owner as { type?: string | null }).type,
            )}
          >
            <UserAvatar
              name={firstDealDetail.owner.name}
              imageUrl={firstDealDetail.owner.avatarUrl ?? null}
              size={20}
            />
            <span className="min-w-0 truncate font-display text-[10.5px] font-semibold text-[#2e3b6e]">
              {ownerLabel(
                firstDealDetail.owner.name,
                (firstDealDetail.owner as { type?: string | null }).type,
              )}
            </span>
          </span>
        ) : (
          <span className="inline-flex cursor-pointer items-center rounded-full bg-white px-2.5 py-1 font-display text-[10.5px] font-semibold text-[#2e3b6e] shadow-sm">
            +Responsável
          </span>
        )
      }
    />
  );
}

/** Troca de etapa do 1º negócio no card do ContactAside. */
export function InboxDealStageSlot({
  dealId,
  stageId,
  pipelineId,
  stages,
}: {
  dealId: string;
  stageId: string;
  pipelineId: string | null;
  stages: PipelineListStageDto[];
}) {
  return (
    <StagePicker
      dealId={dealId}
      currentStageId={stageId}
      pipelineId={pipelineId}
    >
      {({ onSelectStage, isPending, canMove }) => (
        <InboxStageDropdown
          stages={stages}
          currentStageId={stageId}
          currentPipelineId={pipelineId}
          isPending={isPending}
          canMove={canMove}
          onSelect={onSelectStage}
        />
      )}
    </StagePicker>
  );
}
