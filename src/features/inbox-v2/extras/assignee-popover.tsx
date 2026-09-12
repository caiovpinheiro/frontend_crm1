"use client";

/*
 * AssigneePopover (Inbox v2) — versão portal.
 * Mesma motivação do TagsPopover: escapar de containers com overflow.
 */

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Chip } from "@/components/crm/chip";
import { UserAvatar } from "@/components/crm/user-avatar";
import {
  SystemPresenceIndicator,
  sortByPresence,
} from "@/components/crm/system-presence-indicator";
import {
  useAssignConversation,
  useTeamUsers,
} from "@/features/inbox-v2/hooks";

import {
  computePopoverPosition,
  usePortalPopover,
} from "@/features/pipeline-v2/extras/use-portal-popover";

interface AssigneePopoverProps {
  conversationId: string | null;
  currentAssigneeName?: string;
  currentAssigneeId?: string | null;
  currentAssigneeImageUrl?: string | null;
  disabled?: boolean;
}

export function AssigneePopover({
  conversationId,
  currentAssigneeName,
  currentAssigneeId,
  currentAssigneeImageUrl,
  disabled,
}: AssigneePopoverProps) {
  const { open, rect, triggerRef, popoverRef, toggle, close } =
    usePortalPopover();
  const [filter, setFilter] = useState("");

  const { data: users = [], isLoading } = useTeamUsers(open, { includeAi: true });
  const assign = useAssignConversation();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = users.filter((u) =>
      (u.name ?? u.email ?? "").toLowerCase().includes(q),
    );
    return sortByPresence(list);
  }, [users, filter]);

  function handleSelect(userId: string | null) {
    if (!conversationId) return;
    const user = userId
      ? users.find((u) => u.id === userId) ?? filtered.find((u) => u.id === userId)
      : null;
    assign.mutate(
      {
        conversationId,
        assignedToId: userId,
        assignedTo: user
          ? {
              id: user.id,
              name: user.name?.trim() || user.email || "",
              avatarUrl: user.avatarUrl ?? null,
              type: user.type ?? "HUMAN",
            }
          : null,
      },
      {
        onSuccess: () => {
          close();
          setFilter("");
        },
      },
    );
  }

  const pos = computePopoverPosition(rect, 280, 256);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || !conversationId}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex max-w-full"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {currentAssigneeName ? (
          // Responsável (agente): mesmo padrão do owner no kanban — UserAvatar
          // (gradiente do brand + foto do perfil; iniciais como fallback) + nome.
          <span
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] py-px pl-px pr-2 transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--glass-bg-base)]"
            title={currentAssigneeName}
          >
            <UserAvatar
              name={currentAssigneeName}
              imageUrl={currentAssigneeImageUrl ?? null}
              size={20}
            />
            <span className="min-w-0 truncate font-display text-[10.5px] font-semibold text-[var(--text-secondary)]">
              {currentAssigneeName}
            </span>
          </span>
        ) : (
          <Chip variant="ghost" className="whitespace-nowrap">+Responsável</Chip>
        )}
      </button>

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
                width: 256,
                isolation: "isolate",
              }}
              className="z-(--z-popover) rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] p-2 shadow-[var(--glass-shadow-lg)] backdrop-blur-xl"
            >
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
              <ul className="max-h-56 overflow-y-auto">
                {currentAssigneeId && (
                  <li>
                    <button
                      type="button"
                      onClick={() => handleSelect(null)}
                      className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12.5px] text-[var(--color-warning)] transition-colors hover:bg-[var(--color-warning)]/10"
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
                  const isActive = u.id === currentAssigneeId;
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        disabled={assign.isPending}
                        onClick={() => handleSelect(u.id)}
                        className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-[var(--glass-bg-strong)] ${
                          isActive
                            ? "bg-[var(--color-enterprise-bg)] font-semibold text-[var(--brand-primary)]"
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
                        {isActive && (
                          <span aria-hidden className="text-[var(--brand-primary)]">
                            ✓
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
