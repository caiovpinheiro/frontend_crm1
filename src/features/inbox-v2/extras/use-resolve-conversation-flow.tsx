"use client";

import { useState } from "react";

import { useUserRole } from "@/hooks/use-user-role";
import { useToggleConversationResolve } from "@/features/inbox-v2/hooks";

import { TabulationDialog } from "./tabulation-dialog";
import { ResolveConfirmDialog } from "./skip-automations-option";
import { FollowUpTaskDialog } from "./follow-up-task-dialog";

/**
 * Encerrar / reabrir conversa.
 *
 * Toggle Finalizar (Encerradas) vs Acompanhar (Resolvido + tarefa).
 * Tabulação quando o departamento exige. Admin pode pular automações.
 */
export function useResolveConversationFlow(opts: {
  conversationId: string | null;
  isResolved?: boolean;
  departmentId?: string | null;
  requireTabulationOnClose?: boolean;
  contactId?: string | null;
  contactName?: string | null;
  onReopenNewConversation?: (newConversationId: string) => void;
  onResolved?: (conversationId: string) => void;
  onFollowedUp?: (conversationId: string) => void;
}) {
  const { role, isSuperAdmin } = useUserRole();
  const canSkipAutomations = isSuperAdmin || role === "ADMIN";
  const [tabulationOpen, setTabulationOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [tabulationDeptId, setTabulationDeptId] = useState<string | null>(null);

  const toggleResolve = useToggleConversationResolve({
    onNewConversation: (newId) => opts.onReopenNewConversation?.(newId),
    onResolved: (id) => opts.onResolved?.(id),
    onFollowedUp: (id) => {
      opts.onFollowedUp?.(id);
      setTaskOpen(true);
    },
    onTabulationRequired: ({ departmentId: deptFromApi }) => {
      setTabulationDeptId(deptFromApi ?? opts.departmentId ?? null);
      setConfirmOpen(false);
      setTabulationOpen(true);
    },
  });

  function mutateResolve(extra?: {
    tabulationId?: string | null;
    skipAutomations?: boolean;
    followUp?: boolean;
  }) {
    if (!opts.conversationId) return;
    toggleResolve.mutate(
      {
        conversationId: opts.conversationId,
        action: "resolve",
        tabulationId: extra?.tabulationId,
        skipAutomations:
          canSkipAutomations && extra?.skipAutomations ? true : undefined,
        followUp: extra?.followUp === true,
      },
      {
        onSuccess: () => {
          setTabulationOpen(false);
          setConfirmOpen(false);
        },
      },
    );
  }

  function handleToggleResolve() {
    if (!opts.conversationId) return;
    if (opts.isResolved) {
      toggleResolve.mutate({
        conversationId: opts.conversationId,
        action: "reopen",
      });
      return;
    }
    if (opts.requireTabulationOnClose && opts.departmentId) {
      setTabulationDeptId(opts.departmentId);
      setTabulationOpen(true);
      return;
    }
    setConfirmOpen(true);
  }

  const dialogs = (
    <>
      <TabulationDialog
        open={tabulationOpen}
        onOpenChange={setTabulationOpen}
        departmentId={tabulationDeptId ?? opts.departmentId ?? null}
        submitting={toggleResolve.isPending}
        allowSkipAutomations={canSkipAutomations}
        onConfirm={(tabulationId, extra) => {
          mutateResolve({
            tabulationId,
            skipAutomations: extra?.skipAutomations,
            followUp: extra?.followUp,
          });
        }}
      />
      <ResolveConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        submitting={toggleResolve.isPending}
        allowSkipAutomations={canSkipAutomations}
        onConfirm={(skipAutomations, followUp) =>
          mutateResolve({ skipAutomations, followUp })
        }
      />
      <FollowUpTaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        contactId={opts.contactId}
        contactName={opts.contactName}
      />
    </>
  );

  return { handleToggleResolve, toggleResolve, dialogs, canSkipAutomations };
}
