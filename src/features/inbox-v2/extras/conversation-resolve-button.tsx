"use client";

import { IconCircleCheck, IconRotateClockwise } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { RequirePermission } from "@/components/auth/require-permission";
import { TooltipGlass } from "@/components/crm/tooltip-glass";

import { useResolveConversationFlow } from "./use-resolve-conversation-flow";

/**
 * Botão dedicado "Encerrar / Reabrir conversa" — usado na barra do composer.
 * Só ícone + TooltipGlass: Encerrar verde, Reabrir roxo.
 */
export function ConversationResolveButton({
  conversationId,
  isResolved,
  departmentId,
  assignedToId,
  requireTabulationOnClose,
  onReopenNewConversation,
  onResolved,
  onFollowedUp,
  contactId,
  contactName,
  disabled,
}: {
  conversationId: string | null;
  isResolved?: boolean;
  departmentId?: string | null;
  assignedToId?: string | null;
  requireTabulationOnClose?: boolean;
  onReopenNewConversation?: (newConversationId: string) => void;
  /** Após Encerrar — atualiza sticky/status local sem refetch do id. */
  onResolved?: (conversationId: string) => void;
  onFollowedUp?: (conversationId: string) => void;
  contactId?: string | null;
  contactName?: string | null;
  disabled?: boolean;
}) {
  const { handleToggleResolve, toggleResolve, dialogs } =
    useResolveConversationFlow({
      conversationId,
      isResolved,
      departmentId,
      assignedToId,
      requireTabulationOnClose,
      contactId,
      contactName,
      onReopenNewConversation,
      onResolved,
      onFollowedUp,
    });

  const label = isResolved ? "Reabrir conversa" : "Encerrar conversa";

  return (
    <RequirePermission permission="conversation:resolve">
      <>
        <TooltipGlass label={label} side="top">
          <button
            type="button"
            onClick={handleToggleResolve}
            disabled={disabled || !conversationId || toggleResolve.isPending}
            aria-label={label}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white transition-all disabled:opacity-50",
              isResolved
                ? "bg-violet-600 shadow-[0_2px_8px_rgba(124,58,237,0.35)] hover:bg-violet-500"
                : "bg-[color-mix(in_srgb,var(--color-success)_92%,transparent)] shadow-[0_2px_8px_rgba(16,185,129,0.35)] hover:brightness-95",
            )}
          >
            {isResolved ? (
              <IconRotateClockwise size={15} stroke={2.2} />
            ) : (
              <IconCircleCheck size={15} stroke={2.2} />
            )}
          </button>
        </TooltipGlass>
        {dialogs}
      </>
    </RequirePermission>
  );
}
