"use client";

import {
  IconBell,
  IconBellOff,
  IconCircleCheck,
  IconRotateClockwise,
  IconSquareCheck,
} from "@tabler/icons-react";
import { Plus } from "lucide-react";

import { RequirePermission } from "@/components/auth/require-permission";
import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import {
  BulkReassignPopover,
  ResolveConfirmDialog,
  TabulationDialog,
} from "@/features/inbox-v2/extras";

/** Menu "+" da coluna de conversas: notificações sonoras e modo de seleção. */
export function InboxColumnMoreMenu({
  soundMuted,
  setSoundMuted,
  selectionMode,
  onEnterSelectionMode,
  onExitSelectionMode,
}: {
  soundMuted: boolean;
  setSoundMuted: (muted: boolean) => void;
  selectionMode: boolean;
  onEnterSelectionMode: () => void;
  onExitSelectionMode: () => void;
}) {
  return (
    <div data-tour="inbox-list-more" className="relative shrink-0">
      <DropdownGlass
        matchTriggerWidth={false}
        className="min-w-[220px]"
        align="end"
        options={[
          {
            value: "sound",
            label: "Notificações",
            icon: soundMuted ? <IconBellOff size={15} /> : <IconBell size={15} />,
            trailing: !soundMuted ? (
              <IconCircleCheck size={15} className="text-[var(--brand-primary)]" />
            ) : undefined,
          },
          {
            value: "select",
            label: "Seleção de múltiplas",
            icon: <IconSquareCheck size={15} />,
            trailing: selectionMode ? (
              <IconCircleCheck size={15} className="text-[var(--brand-primary)]" />
            ) : undefined,
          },
        ]}
        onValueChange={(v) => {
          if (v === "sound") setSoundMuted(!soundMuted);
          if (v === "select") {
            if (selectionMode) onExitSelectionMode();
            else onEnterSelectionMode();
          }
        }}
        trigger={
          // TooltipGlass não pode envolver o trigger do DropdownGlass (asChild
          // aninhado): o menu deixa de abrir.
          <button
            type="button"
            title="Mais opções"
            aria-haspopup="menu"
            aria-label="Abrir menu de opções"
            className="group flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus
              className="h-4 w-4 transition-transform group-data-[state=open]:rotate-45"
              aria-hidden
            />
          </button>
        }
      />
    </div>
  );
}

// Ações da barra de seleção — Encerrar/Reabrir/Reatribuir (protegidas por
// permissão) + Cancelar (sempre visível). Reatribuir/remover responsável
// usa POST /api/conversations/bulk (assign), inclusive "todas do filtro".
export function InboxBulkActionsBar({
  selectedIds,
  selectAllFilter,
  pending,
  canBulkAssign,
  filterTotal,
  tab,
  filters,
  onBulkAction,
  onReassignQueued,
  onReassignPersisted,
  onExitSelectionMode,
}: {
  selectedIds: Set<string>;
  selectAllFilter: boolean;
  pending: boolean;
  canBulkAssign: boolean;
  filterTotal: number | undefined;
  /** Abas serializadas (`serializeInboxTabs`). */
  tab: string;
  filters: Record<string, unknown>;
  onBulkAction: (action: "resolve" | "reopen") => void;
  onReassignQueued: (operationId: string, total: number, unassign: boolean) => void;
  onReassignPersisted: (updated: number, skipped: number, unassign: boolean) => void;
  onExitSelectionMode: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 @max-[520px]:grid @max-[520px]:w-full @max-[520px]:grid-cols-2">
      {(selectedIds.size > 0 || selectAllFilter) && (
        <>
          <RequirePermission permission="conversation:resolve">
            <ButtonGlass
              type="button"
              variant="glass"
              size="sm"
              disabled={pending}
              onClick={() => onBulkAction("resolve")}
            >
              <IconCircleCheck size={14} />
              <span className="ml-1.5">Encerrar</span>
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="glass"
              size="sm"
              disabled={pending}
              onClick={() => onBulkAction("reopen")}
            >
              <IconRotateClockwise size={14} />
              <span className="ml-1.5">Reabrir</span>
            </ButtonGlass>
          </RequirePermission>
          {canBulkAssign && (
            <BulkReassignPopover
              conversationIds={[...selectedIds]}
              disabled={pending}
              allInFilter={selectAllFilter}
              filterTotal={filterTotal}
              tab={tab}
              search=""
              filters={filters}
              onQueued={onReassignQueued}
              onPersisted={onReassignPersisted}
              onDone={onExitSelectionMode}
            />
          )}
        </>
      )}
      <ButtonGlass type="button" variant="glass" size="sm" onClick={onExitSelectionMode}>
        Cancelar
      </ButtonGlass>
    </div>
  );
}

/** Diálogos do encerramento em massa: tabulação ou confirmação simples. */
export function InboxBulkResolveDialogs({
  tabulationOpen,
  onTabulationOpenChange,
  departmentId,
  userId,
  confirmOpen,
  onConfirmOpenChange,
  submitting,
  canSkipAutomations,
  onResolve,
}: {
  tabulationOpen: boolean;
  onTabulationOpenChange: (open: boolean) => void;
  departmentId: string | null;
  userId: string | null;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  submitting: boolean;
  canSkipAutomations: boolean;
  onResolve: (extra?: {
    tabulationId?: string | null;
    skipAutomations?: boolean;
  }) => void;
}) {
  return (
    <>
      <TabulationDialog
        open={tabulationOpen}
        onOpenChange={onTabulationOpenChange}
        departmentId={departmentId}
        userId={userId}
        submitting={submitting}
        allowSkipAutomations={canSkipAutomations}
        allowCloseWithoutTabulation={canSkipAutomations}
        onConfirm={(tabulationId, extra) => {
          onResolve({
            tabulationId: tabulationId.trim() || undefined,
            skipAutomations:
              canSkipAutomations && extra?.skipAutomations ? true : undefined,
          });
        }}
      />
      <ResolveConfirmDialog
        open={confirmOpen}
        onOpenChange={onConfirmOpenChange}
        submitting={submitting}
        onConfirm={(skipAutomations) =>
          onResolve({
            skipAutomations:
              canSkipAutomations && skipAutomations ? true : undefined,
          })
        }
      />
    </>
  );
}
