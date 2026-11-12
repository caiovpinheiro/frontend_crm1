"use client";

import { toast } from "sonner";

import { ActivityComposer } from "@/components/crm/activities/activity-composer";
import { useCreateActivity } from "@/features/directory-v2/hooks";
import {
  activityKindToType,
  localDateTimeToIso,
} from "@/features/directory-v2/activity-adapter";
import type { Activity } from "@/lib/activities-data";

export type TaskDialogDealOption = { id: string; title: string };

/**
 * Wrapper do composer canônico para o Inbox.
 * Não usa `conversationId` — o backend ignora; vínculo é contactId/dealId.
 */
export function TaskDialog({
  open,
  onClose,
  contactId,
  contactName,
  dealId,
  dealTitle,
  deals,
}: {
  open: boolean;
  onClose: () => void;
  /** @deprecated Ignorado — Activity não vincula conversa. */
  conversationId?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  dealId?: string | null;
  dealTitle?: string | null;
  deals?: TaskDialogDealOption[];
}) {
  const createMutation = useCreateActivity();

  const handleCreate = (a: Activity) => {
    createMutation.mutate(
      {
        type: activityKindToType(a.kind),
        title: a.title,
        description: a.notes ?? null,
        scheduledAt: localDateTimeToIso(a.start),
        completed: false,
        contactId: a.contactId ?? contactId ?? null,
        dealId: a.dealId ?? null,
        userId: a.assigneeType === "department" ? null : a.assigneeUserId ?? undefined,
        departmentId: a.assigneeType === "department" ? a.departmentId ?? null : null,
        visibleToAll: a.assigneeType === "all",
      },
      {
        onSuccess: () => toast.success("Tarefa criada"),
        onError: (err) => toast.error(err.message || "Falha ao criar tarefa"),
      },
    );
  };

  return (
    <ActivityComposer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      defaultDate={new Date()}
      onCreate={handleCreate}
      presetContactId={contactId}
      presetContactName={contactName}
      presetDealId={dealId}
      presetDealTitle={dealTitle}
      availableDeals={deals}
      lockContact={Boolean(contactId)}
    />
  );
}
