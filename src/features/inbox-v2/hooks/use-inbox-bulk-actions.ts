"use client";

import { useEffect, useRef, useState, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { isBulkOperationFinished, useBulkOperation } from "@/hooks/use-bulk-operation";

import type { ConversationListRow, InboxTab } from "../api";
import { pickBulkCloseDepartment } from "../extras/tabulation-dialog";
import type { useBulkConversationAction } from "./use-conversation-actions";
import type { useInboxConversationList } from "./use-inbox-conversation-list";
import { serializeInboxTabs } from "./use-inbox-filters-url-sync";

/**
 * Ações em massa da seleção (encerrar/reabrir/reatribuir): diálogos de
 * tabulação/confirmação e acompanhamento da BulkOperation assíncrona.
 */
export function useInboxBulkActions(params: {
  bulkAction: ReturnType<typeof useBulkConversationAction>;
  selectedIds: Set<string>;
  selectAllFilter: boolean;
  exitSelectionMode: () => void;
  filterTotal: number | undefined;
  tab: InboxTab[];
  setTab: (next: SetStateAction<InboxTab[]>) => void;
  serverFilters: ReturnType<typeof useInboxConversationList>["serverFilters"];
  displayRows: ConversationListRow[];
  sessionUserId: string | null;
  canSkipAutomations: boolean;
  refreshInboxQueue: () => Promise<void>;
}) {
  const {
    bulkAction,
    selectedIds,
    selectAllFilter,
    exitSelectionMode,
    filterTotal,
    tab,
    setTab,
    serverFilters,
    displayRows,
    sessionUserId,
    canSkipAutomations,
    refreshInboxQueue,
  } = params;
  const qc = useQueryClient();

  const [bulkTabulationOpen, setBulkTabulationOpen] = useState(false);
  const [bulkTabulationDeptId, setBulkTabulationDeptId] = useState<string | null>(
    null,
  );
  const [bulkTabulationUserId, setBulkTabulationUserId] = useState<string | null>(
    null,
  );
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const pendingBulkRef = useRef<{
    useAllInFilter: boolean;
    ids: string[];
  } | null>(null);
  // Encerramento em massa roda no leads-worker (async). Guardamos o id da
  // BulkOperation pra pollar progresso e dar feedback ao terminar.
  const [bulkOpId, setBulkOpId] = useState<string | null>(null);
  const bulkSkippedRef = useRef(0);
  const bulkKindRef = useRef<"resolve" | "assign" | "unassign">("resolve");

  function executeBulkResolve(extra?: {
    tabulationId?: string | null;
    skipAutomations?: boolean;
  }) {
    const pending = pendingBulkRef.current;
    const useAllInFilter = pending?.useAllInFilter ?? false;
    const ids = pending?.ids ?? [...selectedIds];
    if (!useAllInFilter && ids.length === 0) return;

    const count = useAllInFilter ? (filterTotal ?? ids.length) : ids.length;
    bulkAction.mutate(
      useAllInFilter
        ? {
            ids: [],
            action: "resolve",
            allInFilter: true,
            tab: serializeInboxTabs(tab),
            search: "",
            filters: serverFilters as Record<string, unknown>,
            tabulationId: extra?.tabulationId,
            skipAutomations: extra?.skipAutomations,
          }
        : {
            ids,
            action: "resolve",
            tabulationId: extra?.tabulationId,
            skipAutomations: extra?.skipAutomations,
          },
      {
        onSuccess: (result) => {
          const skipped = Array.isArray(result?.skipped)
            ? result.skipped.length
            : 0;
          const closed = result?.updated ?? 0;
          setBulkTabulationOpen(false);
          setBulkConfirmOpen(false);
          pendingBulkRef.current = null;
          if (result?.operationId) {
            bulkKindRef.current = "resolve";
            bulkSkippedRef.current = skipped;
            setBulkOpId(result.operationId);
            const total = result.total ?? count;
            if (skipped > 0) {
              toast.warning(
                `Encerrando ${total} conversa${total > 1 ? "s" : ""} em segundo plano. ${skipped} exigem tabulação e não foram encerradas — encerre com uma tabulação.`,
                { id: `inbox-bulk-resolve-${result.operationId}` },
              );
            } else {
              toast.loading(
                `Encerrando ${total} conversa${total > 1 ? "s" : ""}…`,
                { id: `inbox-bulk-resolve-${result.operationId}` },
              );
            }
            exitSelectionMode();
            return;
          }
          if (closed > 0) {
            if (skipped > 0) {
              toast.warning(
                `${closed} encerrada(s). ${skipped} exigem tabulação e não foram encerradas — encerre com uma tabulação.`,
              );
            } else {
              toast.success(
                `${closed} conversa${closed > 1 ? "s" : ""} encerrada${closed > 1 ? "s" : ""}`,
              );
            }
            if (!useAllInFilter && ids.length > 0) {
              const closedSet = new Set(ids);
              qc.setQueriesData<{
                pages: { items: { id: string }[] }[];
                pageParams: unknown[];
              }>({ queryKey: ["inbox-conversations"] }, (old) => {
                if (!old?.pages) return old;
                return {
                  ...old,
                  pages: old.pages.map((page) => ({
                    ...page,
                    items: (page.items ?? []).filter((row) => !closedSet.has(row.id)),
                  })),
                };
              });
            }
            void refreshInboxQueue();
            exitSelectionMode();
            return;
          }
          if (skipped > 0) {
              toast.warning(
                `${skipped} conversa(s) exigem tabulação e não foram encerradas. Encerre com uma tabulação.`,
              );
          } else {
            toast.warning("Nenhuma conversa para encerrar.");
          }
          exitSelectionMode();
        },
      },
    );
  }

  function handleBulkAction(action: "resolve" | "reopen") {
    const ids = [...selectedIds];
    const useAllInFilter = selectAllFilter && action === "resolve";
    if (!useAllInFilter && ids.length === 0) return;

    if (action === "reopen") {
      bulkAction.mutate(
        { ids, action },
        {
          onSuccess: () => {
            toast.success(
              `${ids.length} conversa${ids.length > 1 ? "s" : ""} reaberta${ids.length > 1 ? "s" : ""}`,
            );
            setTab((current) =>
              current.every((t) => t === "finalizados" || t === "resolvidos")
                ? ["todos"]
                : current,
            );
            exitSelectionMode();
          },
        },
      );
      return;
    }

    pendingBulkRef.current = { useAllInFilter, ids };
    const picked = pickBulkCloseDepartment(displayRows, selectedIds, {
      allInFilter: useAllInFilter,
      fallbackUserId: sessionUserId,
    });
    if (picked.departmentId || picked.userId) {
      setBulkTabulationDeptId(picked.departmentId);
      setBulkTabulationUserId(picked.departmentId ? null : picked.userId);
      setBulkTabulationOpen(true);
      return;
    }
    if (canSkipAutomations) {
      setBulkConfirmOpen(true);
      return;
    }
    executeBulkResolve();
  }

  function handleBulkTabulationOpenChange(open: boolean) {
    setBulkTabulationOpen(open);
    if (!open) pendingBulkRef.current = null;
  }

  function handleBulkConfirmOpenChange(open: boolean) {
    setBulkConfirmOpen(open);
    if (!open) pendingBulkRef.current = null;
  }

  // Reatribuir/remover responsável em massa (POST /api/conversations/bulk).
  function handleBulkReassignQueued(
    operationId: string,
    total: number,
    unassign: boolean,
  ) {
    bulkKindRef.current = unassign ? "unassign" : "assign";
    setBulkOpId(operationId);
    toast.loading(
      `${unassign ? "Removendo responsável de" : "Reatribuindo"} ${total.toLocaleString("pt-BR")} conversa${total > 1 ? "s" : ""}…`,
      { id: `inbox-bulk-assign-${operationId}` },
    );
  }

  function handleBulkReassignPersisted(
    updated: number,
    skipped: number,
    unassign: boolean,
  ) {
    if (updated > 0) {
      const verb = unassign
        ? "sem responsável"
        : updated > 1
          ? "reatribuídas"
          : "reatribuída";
      if (skipped > 0) {
        toast.warning(
          `${updated} conversa${updated > 1 ? "s" : ""} ${verb}. ${skipped} não puderam ser ${unassign ? "liberadas" : "reatribuídas"}.`,
        );
      } else {
        toast.success(
          `${updated} conversa${updated > 1 ? "s" : ""} ${verb}`,
        );
      }
      void refreshInboxQueue();
      return;
    }
    if (skipped > 0) {
      toast.warning(
        unassign
          ? "Nenhuma conversa pôde ter o responsável removido."
          : "Nenhuma conversa pôde ser reatribuída.",
      );
      return;
    }
    toast.warning(
      unassign
        ? "Nenhuma conversa para remover responsável."
        : "Nenhuma conversa para reatribuir.",
    );
  }

  // ── Polling do encerramento em massa (leads-worker) ─────────────
  const bulkOp = useBulkOperation(bulkOpId);
  const bulkOpStatus = bulkOp.data?.status;
  useEffect(() => {
    if (!bulkOpId || !isBulkOperationFinished(bulkOpStatus)) return;
    const d = bulkOp.data;
    if (d) {
      const kind = bulkKindRef.current;
      const toastId =
        kind === "resolve"
          ? `inbox-bulk-resolve-${bulkOpId}`
          : `inbox-bulk-assign-${bulkOpId}`;
      const skipped = bulkSkippedRef.current;
      const doneVerb =
        kind === "unassign"
          ? "sem responsável"
          : kind === "assign"
            ? "reatribuída"
            : "encerrada";
      const doneVerbPlural =
        kind === "unassign"
          ? "sem responsável"
          : kind === "assign"
            ? "reatribuídas"
            : "encerradas";
      if (bulkOpStatus === "COMPLETED") {
        if (kind === "resolve" && skipped > 0) {
          toast.warning(
            `${d.succeeded} encerrada(s). ${skipped} exigem tabulação e não foram encerradas — encerre com uma tabulação.`,
            { id: toastId },
          );
        } else {
          toast.success(
            `${d.succeeded} conversa${d.succeeded > 1 ? "s" : ""} ${
              d.succeeded > 1 ? doneVerbPlural : doneVerb
            }`,
            { id: toastId },
          );
        }
      } else if (bulkOpStatus === "PARTIAL") {
        toast.warning(
          kind === "resolve" && skipped > 0
            ? `${d.succeeded} encerrada(s), ${d.failed} falharam. ${skipped} exigem tabulação — encerre com uma tabulação.`
            : `${d.succeeded} ${doneVerbPlural}, ${d.failed} falharam`,
          { id: toastId },
        );
      } else if (bulkOpStatus === "FAILED") {
        toast.error(
          kind === "resolve"
            ? "Falha ao encerrar as conversas em massa."
            : "Falha ao reatribuir as conversas em massa.",
          { id: toastId },
        );
      }
    }
    void qc.refetchQueries({ queryKey: ["inbox-conversations"] });
    void qc.refetchQueries({ queryKey: ["conversations", "tab-counts"] });
    qc.invalidateQueries({ queryKey: ["distribution-responsibles"] });
    qc.invalidateQueries({ queryKey: ["distribution-pending"] });
    setBulkOpId(null);
  }, [bulkOpId, bulkOpStatus, bulkOp.data, qc]);

  return {
    bulkTabulationOpen,
    bulkTabulationDeptId,
    bulkTabulationUserId,
    bulkConfirmOpen,
    executeBulkResolve,
    handleBulkAction,
    handleBulkTabulationOpenChange,
    handleBulkConfirmOpenChange,
    handleBulkReassignQueued,
    handleBulkReassignPersisted,
  };
}
