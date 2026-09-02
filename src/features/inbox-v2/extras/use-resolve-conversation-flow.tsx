"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

import { useUserRole } from "@/hooks/use-user-role";
import { useToggleConversationResolve } from "@/features/inbox-v2/hooks";

import { TabulationDialog } from "./tabulation-dialog";
import { ResolveConfirmDialog } from "./skip-automations-option";
import { FollowUpTaskDialog } from "./follow-up-task-dialog";

/**
 * Encerrar / reabrir conversa.
 *
 * Toggle Finalizar (Encerradas) vs Acompanhar (Resolvendo + tarefa).
 * Tabulação: departamento da conversa; sem depto, departamentos do agente.
 * Admin pode pular automações.
 */
export function useResolveConversationFlow(opts: {
  conversationId: string | null;
  isResolved?: boolean;
  departmentId?: string | null;
  assignedToId?: string | null;
  requireTabulationOnClose?: boolean;
  contactId?: string | null;
  contactName?: string | null;
  onReopenNewConversation?: (newConversationId: string) => void;
  onResolved?: (conversationId: string) => void;
  onFollowedUp?: (conversationId: string) => void;
}) {
  const { data: session } = useSession();
  const currentUserId =
    (session?.user as { id?: string } | undefined)?.id ?? null;
  const agentUserId = opts.assignedToId ?? currentUserId;
  const { role, isSuperAdmin } = useUserRole();
  const canSkipAutomations = isSuperAdmin || role === "ADMIN";
  const [tabulationOpen, setTabulationOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [tabulationDeptId, setTabulationDeptId] = useState<string | null>(null);
  const [tabulationUserId, setTabulationUserId] = useState<string | null>(null);

  const toggleResolve = useToggleConversationResolve({
    onNewConversation: (newId) => opts.onReopenNewConversation?.(newId),
    onResolved: (id) => opts.onResolved?.(id),
    onFollowedUp: (id) => {
      opts.onFollowedUp?.(id);
      setTaskOpen(true);
    },
    onTabulationRequired: ({
      departmentId: deptFromApi,
      userId: userFromApi,
    }) => {
      setTabulationDeptId(deptFromApi ?? opts.departmentId ?? null);
      setTabulationUserId(userFromApi ?? agentUserId ?? null);
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
        tabulationId: extra?.tabulationId || undefined,
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
    if (opts.departmentId && opts.requireTabulationOnClose) {
      setTabulationDeptId(opts.departmentId);
      setTabulationUserId(null);
      setTabulationOpen(true);
      return;
    }
    if (!opts.departmentId && agentUserId) {
      setTabulationDeptId(null);
      setTabulationUserId(agentUserId);
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
        userId={
          tabulationDeptId || opts.departmentId
            ? null
            : (tabulationUserId ?? agentUserId)
        }
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
