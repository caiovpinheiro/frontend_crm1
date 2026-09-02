"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

import { useUserRole } from "@/hooks/use-user-role";
import { useToggleConversationResolve } from "@/features/inbox-v2/hooks";

import { TabulationDialog } from "./tabulation-dialog";
import { ResolveConfirmDialog } from "./skip-automations-option";
import { FollowUpTaskDialog } from "./follow-up-task-dialog";

type PendingResolve = {
  tabulationId?: string | null;
  skipAutomations?: boolean;
};

/**
 * Encerrar / reabrir conversa.
 *
 * Finalizar: tabulação (se houver) e encerra (automações disparam).
 * Acompanhar: agenda a tarefa primeiro; só então grava a tabulação,
 * manda o ticket para Resolvendo sem encerrar e sem automação.
 */
export function useResolveConversationFlow(opts: {
  conversationId: string | null;
  isResolved?: boolean;
  departmentId?: string | null;
  assignedToId?: string | null;
  requireTabulationOnClose?: boolean;
  contactId?: string | null;
  contactName?: string | null;
  dealId?: string | null;
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
  const [pendingResolve, setPendingResolve] = useState<PendingResolve | null>(
    null,
  );

  const toggleResolve = useToggleConversationResolve({
    onNewConversation: (newId) => opts.onReopenNewConversation?.(newId),
    onResolved: (id) => opts.onResolved?.(id),
    onFollowedUp: (id) => opts.onFollowedUp?.(id),
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
          setTaskOpen(false);
          setPendingResolve(null);
        },
      },
    );
  }

  function startFollowUp(extra?: PendingResolve) {
    setPendingResolve({
      tabulationId: extra?.tabulationId,
      skipAutomations: extra?.skipAutomations,
    });
    setTabulationOpen(false);
    setConfirmOpen(false);
    setTaskOpen(true);
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
      setTabulationUserId(agentUserId);
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
        userId={tabulationUserId ?? agentUserId}
        submitting={toggleResolve.isPending}
        allowSkipAutomations={canSkipAutomations}
        onConfirm={(tabulationId, extra) => {
          if (extra?.followUp) {
            startFollowUp({
              tabulationId,
              skipAutomations: extra.skipAutomations,
            });
            return;
          }
          mutateResolve({
            tabulationId,
            skipAutomations: extra?.skipAutomations,
            followUp: false,
          });
        }}
      />
      <ResolveConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        submitting={toggleResolve.isPending}
        allowSkipAutomations={canSkipAutomations}
        onConfirm={(skipAutomations, followUp) => {
          if (followUp) {
            startFollowUp({ skipAutomations });
            return;
          }
          mutateResolve({ skipAutomations, followUp: false });
        }}
      />
      <FollowUpTaskDialog
        open={taskOpen}
        onOpenChange={(open) => {
          setTaskOpen(open);
          if (!open) setPendingResolve(null);
        }}
        contactId={opts.contactId}
        contactName={opts.contactName}
        dealId={opts.dealId}
        submitting={toggleResolve.isPending}
        onScheduled={() => {
          mutateResolve({
            tabulationId: pendingResolve?.tabulationId,
            skipAutomations: pendingResolve?.skipAutomations,
            followUp: true,
          });
        }}
      />
    </>
  );

  return { handleToggleResolve, toggleResolve, dialogs, canSkipAutomations };
}
