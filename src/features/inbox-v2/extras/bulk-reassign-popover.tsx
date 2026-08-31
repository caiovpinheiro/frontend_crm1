"use client";

/*
 * BulkReassignPopover — ação em massa "Reatribuir" / "Sem responsável"
 * na barra de seleção do Inbox. POST /api/conversations/bulk (assign).
 * Lotes pequenos persistem na API; só acima do teto enfileira o worker.
 */

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconUserPlus, IconUserOff } from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { UserAvatar } from "@/components/crm/user-avatar";
import {
  SystemPresenceIndicator,
  sortByPresence,
} from "@/components/crm/system-presence-indicator";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  useBulkAssignConversations,
  useTeamUsers,
} from "@/features/inbox-v2/hooks";
import { useCan } from "@/hooks/use-my-permissions";
import {
  computePopoverPosition,
  usePortalPopover,
} from "@/features/pipeline-v2/extras/use-portal-popover";

interface BulkReassignPopoverProps {
  conversationIds: string[];
  disabled?: boolean;
  disabledReason?: string;
  /** Todas as conversas do filtro atual (todas as páginas). */
  allInFilter?: boolean;
  filterTotal?: number;
  tab?: string;
  search?: string;
  filters?: Record<string, unknown>;
  onQueued?: (operationId: string, total: number, unassign: boolean) => void;
  /** Persistiu na API (sem worker). `skipped` = IDs sem permissão / não encontrados. */
  onPersisted?: (updated: number, skipped: number, unassign: boolean) => void;
  onDone?: () => void;
}

export function BulkReassignPopover({
  conversationIds,
  disabled,
  disabledReason,
  allInFilter,
  filterTotal,
  tab,
  search,
  filters,
  onQueued,
  onPersisted,
  onDone,
}: BulkReassignPopoverProps) {
  const { open, rect, triggerRef, popoverRef, toggle, close } =
    usePortalPopover();
  const [filter, setFilter] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirm();

  const { data: users = [], isLoading } = useTeamUsers(open);
  const bulkAssign = useBulkAssignConversations();
  const canUnassign = useCan("conversation:reassign_others");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = users.filter((u) =>
      (u.name ?? u.email ?? "").toLowerCase().includes(q),
    );
    return sortByPresence(list);
  }, [users, filter]);

  async function handleSelect(userId: string | null, assigneeName: string) {
    if (bulkAssign.isPending) return;
    const count = allInFilter
      ? (filterTotal ?? conversationIds.length)
      : conversationIds.length;
    if (!allInFilter && conversationIds.length === 0) return;

    const unassign = userId === null;
    const confirmed = await confirm({
      title: unassign ? "Remover responsável" : "Confirmar reatribuição",
      description: allInFilter
        ? `${unassign ? "Remover o responsável de" : "Reatribuir"} ${count.toLocaleString("pt-BR")} conversa${count === 1 ? "" : "s"} do filtro atual${unassign ? "" : ` para ${assigneeName}`}?`
        : `${unassign ? "Remover o responsável de" : "Reatribuir"} ${count} conversa${count === 1 ? "" : "s"}${unassign ? "" : ` para ${assigneeName}`}?`,
      confirmLabel: unassign ? "Remover" : "Reatribuir",
    });
    if (!confirmed) return;

    close();
    bulkAssign.mutate(
      allInFilter
        ? {
            ids: [],
            assignedToId: userId,
            allInFilter: true,
            tab,
            search,
            filters,
          }
        : { ids: conversationIds, assignedToId: userId },
      {
        onSuccess: (result) => {
          setFilter("");
          if (result.operationId) {
            onQueued?.(
              result.operationId,
              result.total ?? count,
              unassign,
            );
            onDone?.();
            return;
          }
          const skipped = Array.isArray(result.skipped)
            ? result.skipped.length
            : 0;
          onPersisted?.(result.updated ?? 0, skipped, unassign);
          onDone?.();
        },
        onError: () => setFilter(""),
      },
    );
  }

  const pos = computePopoverPosition(rect, 280, 320);
  const busy =
    bulkAssign.isPending ||
    disabled ||
    (!allInFilter && conversationIds.length === 0);

  return (
    <>
      <ButtonGlass
        ref={triggerRef}
        type="button"
        variant="glass"
        size="sm"
        disabled={busy}
        title={busy && disabledReason ? disabledReason : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (busy) return;
          toggle();
        }}
      >
        <IconUserPlus size={14} />
        <span className="ml-1.5">Reatribuir</span>
      </ButtonGlass>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              role="listbox"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: 280,
                isolation: "isolate",
              }}
              className="z-(--z-popover) rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] p-2 shadow-[var(--glass-shadow-lg)] backdrop-blur-xl"
            >
              <p className="mb-1.5 px-1 text-[11px] text-[var(--text-muted)]">
                Atribuir{" "}
                {(allInFilter
                  ? (filterTotal ?? conversationIds.length)
                  : conversationIds.length
                ).toLocaleString("pt-BR")}{" "}
                conversa
                {(allInFilter
                  ? (filterTotal ?? conversationIds.length)
                  : conversationIds.length) > 1
                  ? "s"
                  : ""}{" "}
                a…
              </p>
              <input
                autoFocus
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Buscar pessoa…"
                onKeyDown={(e) => {
                  if (e.key === "Escape") close();
                }}
                className="mb-1.5 w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2.5 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)]/40"
              />
              <ul className="max-h-64 overflow-y-auto">
                {canUnassign && (
                  <li>
                    <button
                      type="button"
                      disabled={bulkAssign.isPending}
                      onClick={() => void handleSelect(null, "Sem responsável")}
                      className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12.5px] text-[var(--color-warning)] transition-colors hover:bg-[var(--color-warning)]/10"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--glass-bg-strong)] text-[var(--text-muted)]">
                        <IconUserOff size={13} stroke={2.2} />
                      </span>
                      Sem responsável
                    </button>
                  </li>
                )}
                {isLoading && (
                  <li className="px-2 py-2 text-[12px] text-[var(--text-muted)]">
                    Carregando…
                  </li>
                )}
                {!isLoading && filtered.length === 0 && (
                  <li className="px-2 py-2 text-[12px] text-[var(--text-muted)]">
                    Ninguém encontrado.
                  </li>
                )}
                {filtered.map((u) => {
                  const name = u.name ?? u.email ?? "—";
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        disabled={bulkAssign.isPending}
                        onClick={() => void handleSelect(u.id, name)}
                        className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12.5px] text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-strong)]"
                      >
                        <UserAvatar
                          name={name}
                          imageUrl={u.avatarUrl ?? null}
                          size={24}
                        />
                        <SystemPresenceIndicator
                          systemOnline={u.systemOnline}
                          lastSeenAt={u.lastSeenAt}
                        />
                        <span className="min-w-0 truncate">{name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body,
          )
        : null}
      {confirmDialog}
    </>
  );
}
