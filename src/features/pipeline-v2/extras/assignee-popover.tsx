"use client";

/*
 * Popover de Responsável (Owner) do Deal.
 * Renderizado via createPortal em document.body para escapar dos
 * stacking contexts criados por @hello-pangea/dnd em cada Draggable.
 */

import {
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import {
  SystemPresenceIndicator,
  sortByPresence,
} from "@/components/crm/system-presence-indicator";

import { useTeamUsers, useUpdateDeal } from "@/features/pipeline-v2/hooks";
import type { StatusFilter } from "@/features/pipeline-v2/api";
import { useCan } from "@/hooks/use-my-permissions";

import { computePopoverPosition, usePortalPopover } from "./use-portal-popover";

interface AssigneePopoverProps {
  dealId: string | null;
  currentOwnerId?: string | null;
  currentOwnerName?: string | null;
  pipelineId: string | null;
  statusFilter?: StatusFilter;
  disabled?: boolean;
  trigger: ReactNode;
  /**
   * Conversa aberta no inbox: se o responsável do chat for outro,
   * `askTransferConversation` decide se o chat também muda.
   */
  conversationId?: string | null;
  conversationAssigneeId?: string | null;
  askTransferConversation?: (args: {
    newOwnerId: string | null;
    newOwnerName: string;
  }) => Promise<boolean>;
  /** Atribui o ticket aberto (loga no chat mesmo se a conversa estiver encerrada). */
  onTransferConversation?: (assignedToId: string | null) => Promise<void>;
}

export function AssigneePopover({
  dealId,
  currentOwnerId,
  currentOwnerName,
  pipelineId,
  statusFilter = "OPEN",
  disabled,
  trigger,
  conversationId,
  conversationAssigneeId,
  askTransferConversation,
  onTransferConversation,
}: AssigneePopoverProps) {
  const qc = useQueryClient();
  const { open, rect, triggerRef, popoverRef, toggle, close } = usePortalPopover();
  const [filter, setFilter] = useState("");

  // Mesma regra do backend: `deal:transfer_owner` libera qualquer negócio;
  // `deal:edit` cobre entregar um negócio próprio/sem dono.
  const canTransferOwner = useCan("deal:transfer_owner");
  const canEditDeal = useCan("deal:edit");
  const readOnly = Boolean(disabled) || (!canTransferOwner && !canEditDeal);

  const { data: users = [], isLoading } = useTeamUsers(open, { includeAi: true });
  const update = useUpdateDeal(pipelineId, statusFilter);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = users.filter((u) =>
      (u.name ?? u.email ?? "").toLowerCase().includes(q),
    );
    return sortByPresence(list);
  }, [users, filter]);

  // Dedupe: a seleção é disparada tanto no pointerdown quanto no click.
  // Pointerdown cobre o caso em que o clique é engolido (dnd dos cards,
  // re-render do board); o click cobre navegadores/interações em que o
  // preventDefault do pointerdown cancela o evento seguinte.
  const lastSelectAtRef = useRef(0);

  async function handleSelect(userId: string | null) {
    if (!dealId || update.isPending || readOnly) return;
    const now = Date.now();
    if (now - lastSelectAtRef.current < 500) return;
    lastSelectAtRef.current = now;

    const newOwnerName =
      (userId
        ? users.find((u) => u.id === userId)?.name
        : undefined) ??
      (userId ? "este responsável" : "");

    close();
    setFilter("");

    let propagateToChat: boolean | undefined;
    const chatDiffers = (conversationAssigneeId ?? null) !== userId;
    if (askTransferConversation && chatDiffers) {
      propagateToChat = await askTransferConversation({
        newOwnerId: userId,
        newOwnerName,
      });
    }

    if (
      propagateToChat !== false &&
      onTransferConversation &&
      chatDiffers
    ) {
      try {
        await onTransferConversation(userId);
      } catch {
        /* segue o PUT do negócio mesmo se o assign do chat falhar */
      }
    }

    update.mutate(
      {
        dealId,
        payload: {
          ownerId: userId,
          ...(propagateToChat !== undefined ? { propagateToChat } : {}),
        },
      },
      {
        onSuccess: () => {
          if (conversationId && propagateToChat !== false) {
            qc.invalidateQueries({ queryKey: ["messages", conversationId] });
            qc.invalidateQueries({
              queryKey: ["conversation-timeline", conversationId],
            });
            qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
          }
        },
      },
    );
  }

  function selectHandlers(userId: string | null) {
    return {
      onPointerDown: (e: ReactPointerEvent) => {
        e.stopPropagation();
        void handleSelect(userId);
      },
      onClick: (e: ReactMouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        void handleSelect(userId);
      },
    };
  }

  const position = computePopoverPosition(rect, 280, 256);

  return (
    <>
      <TooltipGlass
        label={
          readOnly
            ? currentOwnerName ?? "Sem permissão para transferir o responsável"
            : currentOwnerName ?? "Selecionar responsável"
        }
        side="top"
      >
        <button
          ref={triggerRef}
          type="button"
          disabled={readOnly || !dealId}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="inline-flex"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {trigger}
        </button>
      </TooltipGlass>

      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            data-assignee-popover=""
            className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] p-2 shadow-[var(--glass-shadow-lg)] backdrop-blur-xl"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: 256,
              zIndex: "var(--z-popover)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar pessoa…"
              className="mb-1.5 w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2.5 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <ul className="max-h-56 overflow-y-auto">
              {currentOwnerId && (
                <li>
                  <button
                    type="button"
                    disabled={update.isPending}
                    {...selectHandlers(null)}
                    className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12.5px] text-[var(--color-warning)] hover:bg-[var(--glass-bg-strong)] disabled:opacity-50"
                  >
                    <span>Remover responsável</span>
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
                const isActive = u.id === currentOwnerId;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={update.isPending}
                      {...selectHandlers(u.id)}
                      className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12.5px] hover:bg-[var(--glass-bg-strong)] disabled:opacity-50 ${
                        isActive
                          ? "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]"
                          : "text-[var(--text-primary)]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <SystemPresenceIndicator
                          systemOnline={u.systemOnline}
                          lastSeenAt={u.lastSeenAt}
                        />
                        <span className="truncate">
                          {u.name ?? u.email ?? "—"}
                          {(u.type ?? "").toUpperCase() === "AI" ? " (IA)" : ""}
                        </span>
                      </span>
                      {isActive && <span aria-hidden>✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
