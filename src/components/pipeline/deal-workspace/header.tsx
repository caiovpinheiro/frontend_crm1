"use client";

/**
 * WorkspaceHeader — topo do workspace do deal (kanban): barra mínima de
 * ações (lista de conversas, Ganho/Perdido, busca, menu ⋯). Nome, telefone
 * e avatar ficam apenas na sidebar.
 *
 * Botão mobile "Dados do negócio" (`PanelRightOpen`) permanece num wrapper
 * absoluto separado. Fechar: último botão da `DealChatActionBar` (X), alinhado
 * à direita da lupa e do menu ⋯; `WorkspaceShell` só usa X flutuante em loading/erro.
 */

import * as React from "react";
import { IconMenu2 as Menu, IconDots as MoreHorizontal, IconLayoutSidebarRightExpand as PanelRightOpen, IconSearch as Search, IconX as X } from "@tabler/icons-react";
import { RemindButton } from "@/components/inbox/remind-button";
import { TagPopover } from "@/components/inbox/tag-popover";
import {
  TransferControl,
  type TransferControlUser,
} from "@/components/inbox/transfer-control";
import {
  conversationHasCallingHint,
  WhatsappCallChip,
} from "@/components/inbox/whatsapp-call-chip";

import { LossReasonDialog } from "@/components/pipeline/loss-reason-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipHost } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { ContactDetail, ConversationRow, DealDetailData } from "./shared";

type WorkspaceHeaderProps = {
  deal: DealDetailData;
  contact: ContactDetail | undefined;

  // Ações do deal
  onEdit: () => void;
  onWon: () => void;
  onLostOpen: () => void;
  onReopen: () => void;
  onDelete: () => void;
  lostOpen: boolean;
  onLostConfirm: (reason: string) => void;
  onLostCancel: () => void;
  statusBusy: boolean;

  // Navegação
  onToggleSidebar?: () => void;
  onOpenConversationList?: () => void;
  /** Quantidade de conversas do contato — hamburger só com 2+. */
  conversationsCount?: number;
  /** Abre busca no texto das mensagens do `ChatWindow`. */
  onSearch?: () => void;
  /** Fecha o workspace (último à direita na barra, após lupa e ⋯). */
  onClose?: () => void;
  closeLabel?: string;

  // Conversa ativa (opcional — habilita voz/transferir/tags)
  conversation?: ConversationRow | null;
  conversationTags?: { name: string; color: string }[] | null;

  // Atribuição
  myUserId?: string;
  canManageAssignee?: boolean;
  currentAssigneeId?: string | null;
  teamUsers?: TransferControlUser[];
  assignLoading?: boolean;
  onAssign?: (userId: string | null) => void;

  // Callback para refetch após mutação de tags
  onTagsUpdated?: () => void;

  // Evento "Histórico" no slot actions (abre drawer de timeline)
  onOpenHistory?: () => void;
};

export function DealChatActionBar({
  onOpenConversationList,
  onSearch,
  actions,
  workspaceMenu,
  conversationsCount = 0,
  onClose,
  closeLabel = "Fechar negocio",
}: {
  onOpenConversationList?: () => void;
  onSearch?: () => void;
  actions?: React.ReactNode;
  workspaceMenu?: React.ReactNode;
  conversationsCount?: number;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-white px-2">
      {onOpenConversationList && conversationsCount > 1 ? (
        <button
          type="button"
          onClick={onOpenConversationList}
          className="inline-flex size-7 items-center justify-center rounded-md text-[var(--color-ink-soft)] hover:bg-[var(--glass-bg-subtle)]"
          aria-label="Conversas"
        >
          <Menu className="size-3.5" strokeWidth={2} />
        </button>
      ) : null}

      <div className="flex-1" />

      {actions ? (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      ) : null}

      <div className="flex shrink-0 items-center gap-1.5">
        {onSearch ? (
          <TooltipHost label="Buscar (Ctrl+F)" side="bottom">
            <button
              type="button"
              onClick={onSearch}
              className="inline-flex size-7 items-center justify-center rounded-md text-[var(--color-ink-soft)] hover:bg-[var(--glass-bg-subtle)]"
              aria-label="Buscar na conversa (Ctrl+F)"
            >
              <Search className="size-3.5" strokeWidth={2.2} />
            </button>
          </TooltipHost>
        ) : null}

        {workspaceMenu}

        {onClose ? (
          <TooltipHost label="Fechar (Esc)" side="bottom">
            <button
              data-deal-workspace-close
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="inline-flex size-7 items-center justify-center rounded-md text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--glass-bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-95"
            >
              <X className="size-3.5" strokeWidth={2.2} />
            </button>
          </TooltipHost>
        ) : null}
      </div>
    </div>
  );
}

export function WorkspaceHeader({
  deal,
  contact,
  onEdit,
  onWon,
  onLostOpen,
  onReopen,
  onDelete,
  lostOpen,
  onLostConfirm,
  onLostCancel,
  statusBusy,
  onToggleSidebar,
  onOpenConversationList,
  conversationsCount = 0,
  onSearch,
  onClose,
  closeLabel,
  conversation,
  conversationTags,
  myUserId,
  canManageAssignee,
  currentAssigneeId,
  teamUsers,
  assignLoading,
  onAssign,
  onTagsUpdated,
}: WorkspaceHeaderProps) {
  const contactTags = React.useMemo(() => {
    if (conversationTags && conversationTags.length > 0) return conversationTags;
    // Fallback para tags do deal (quando a API do deal já inclui relation tags).
    const fromDeal = deal.tags?.map((t) => ({ name: t.tag.name, color: t.tag.color }));
    return fromDeal ?? [];
  }, [conversationTags, deal.tags]);

  return (
    <>
      {/* Botão "abrir sidebar" — absoluto, não entra na barra de ações. */}
      {onToggleSidebar ? (
        <div className="relative">
          <div className="pointer-events-none absolute left-2 top-2 z-10 md:hidden">
            <TooltipHost label="Dados do negócio" side="bottom">
              <button
                type="button"
                onClick={onToggleSidebar}
                aria-label="Abrir dados do negócio"
                className={cn(
                  "pointer-events-auto inline-flex size-8 items-center justify-center rounded-full",
                  "border border-black/6 bg-white text-[var(--color-ink-soft)]",
                  "transition-colors hover:bg-[var(--color-bg-subtle)] active:scale-95",
                )}
              >
                <PanelRightOpen className="size-4" strokeWidth={2.2} />
              </button>
            </TooltipHost>
          </div>
        </div>
      ) : null}

      <DealChatActionBar
        onOpenConversationList={onOpenConversationList}
        conversationsCount={conversationsCount}
        onSearch={onSearch}
        onClose={onClose}
        closeLabel={closeLabel}
        workspaceMenu={
          <DealWorkspaceToolbarMenu
            conversationId={conversation?.id ?? null}
            conversationChannel={conversation?.channel ?? null}
            hasCalling={conversationHasCallingHint(conversation)}
            contactId={contact?.id ?? null}
            contactName={contact?.name ?? deal.title}
            canManageAssignee={canManageAssignee}
            myUserId={myUserId}
            currentAssigneeId={currentAssigneeId ?? conversation?.assignedToId ?? null}
            teamUsers={teamUsers}
            assignLoading={assignLoading}
            onAssign={onAssign}
            tags={contactTags}
            onTagsUpdated={onTagsUpdated}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        }
        actions={
          <DealHeaderWorkspaceOutcomes
            dealStatus={deal.status}
            statusBusy={statusBusy}
            onWon={onWon}
            onLostOpen={onLostOpen}
            onReopen={onReopen}
          />
        }
      />

      <LossReasonDialog
        open={lostOpen}
        onOpenChange={(o) => { if (!o) onLostCancel(); }}
        onConfirm={onLostConfirm}
        isPending={statusBusy}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Workspace — header compacto: Ganho/Perdido inline; resto no menu ⋯
// ─────────────────────────────────────────────────────────────────────────────

export function DealHeaderWorkspaceOutcomes({
  dealStatus,
  statusBusy,
  onWon,
  onLostOpen,
  onReopen,
}: {
  dealStatus: DealDetailData["status"];
  statusBusy: boolean;
  onWon: () => void;
  onLostOpen: () => void;
  onReopen: () => void;
}) {
  if (dealStatus === "OPEN") {
    return (
      <>
        <button
          type="button"
          onClick={onWon}
          disabled={statusBusy}
          className="h-7 shrink-0 rounded-md border border-[var(--color-success)]/35 bg-[var(--color-success-soft)] px-2.5 text-[11px] font-medium text-[var(--color-success)] transition-colors hover:brightness-[0.97] disabled:opacity-50"
        >
          Ganho
        </button>
        <button
          type="button"
          onClick={onLostOpen}
          disabled={statusBusy}
          className="h-7 shrink-0 rounded-md border border-[var(--color-destructive)]/35 bg-[var(--color-destructive-soft)] px-2.5 text-[11px] font-medium text-[var(--color-destructive)] transition-colors hover:brightness-[0.97] disabled:opacity-50"
        >
          Perdido
        </button>
      </>
    );
  }
  return (
    <button
      type="button"
      onClick={onReopen}
      disabled={statusBusy}
      className="h-7 shrink-0 rounded-md border border-border bg-[var(--color-bg-subtle)] px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
    >
      Reabrir
    </button>
  );
}

export type DealWorkspaceToolbarMenuItemsProps = {
  conversationId: string | null;
  conversationChannel: string | null;
  hasCalling?: boolean;
  contactId: string | null;
  contactName: string;
  canManageAssignee?: boolean;
  myUserId?: string;
  currentAssigneeId: string | null;
  teamUsers?: TransferControlUser[];
  assignLoading?: boolean;
  onAssign?: (userId: string | null) => void;
  tags: { name: string; color: string }[];
  onTagsUpdated?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

/** Conteúdo do menu ⋮ — reutilizado pelo `ConversationHeader` (sem trigger próprio). */
export function DealWorkspaceToolbarMenuItems({
  conversationId,
  conversationChannel,
  hasCalling = false,
  contactId,
  contactName,
  canManageAssignee,
  myUserId,
  currentAssigneeId,
  teamUsers = [],
  assignLoading,
  onAssign,
  tags,
  onTagsUpdated,
  onEdit,
  onDelete,
}: DealWorkspaceToolbarMenuItemsProps) {
  const showCall = !!conversationId;
  const showTransfer =
    !!conversationId &&
    !!onAssign &&
    (canManageAssignee || (!!myUserId && !currentAssigneeId));
  const showRemind = !!contactId;
  const showTagPopover = !!conversationId;

  return (
    <>
      {showCall ? (
        <div className="border-b border-border px-2 py-2">
          <WhatsappCallChip
            conversationId={conversationId!}
            channel={conversationChannel}
            contactName={contactName}
            hasCalling={hasCalling}
          />
        </div>
      ) : null}
      {showTransfer ? (
        <div className="border-b border-border px-2 py-2">
          <TransferControl
            teamUsers={teamUsers}
            currentAssigneeId={currentAssigneeId}
            myUserId={myUserId}
            canManageAssignee={!!canManageAssignee}
            loading={assignLoading}
            onAssign={(uid) => onAssign?.(uid)}
          />
        </div>
      ) : null}
      {showRemind ? (
        <div className="border-b border-border px-2 py-2">
          <RemindButton
            contactId={contactId!}
            contactName={contactName}
            conversationId={conversationId ?? undefined}
          />
        </div>
      ) : null}
      {showTagPopover ? (
        <div className="border-b border-border px-2 py-2">
          <TagPopover
            conversationId={conversationId!}
            currentTags={tags}
            onTagsUpdated={() => onTagsUpdated?.()}
          >
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-foreground hover:bg-[var(--glass-bg-subtle)]"
            >
              Tags da conversa…
            </button>
          </TagPopover>
        </div>
      ) : null}
      {onEdit ? (
        <DropdownMenuItem
          className="gap-2 px-2 py-1.5 text-[13px] hover:bg-[var(--glass-bg-subtle)] focus:bg-[var(--glass-bg-subtle)]"
          onClick={onEdit}
        >
          Editar negócio
        </DropdownMenuItem>
      ) : null}
      {onDelete ? (
        <DropdownMenuItem
          className="gap-2 px-2 py-1.5 text-[13px] text-[var(--color-destructive)] hover:bg-[var(--glass-bg-subtle)] focus:bg-[var(--glass-bg-subtle)] focus:text-[var(--color-destructive)]"
          onClick={onDelete}
        >
          Excluir negócio
        </DropdownMenuItem>
      ) : null}
    </>
  );
}

export function DealWorkspaceToolbarMenu(props: DealWorkspaceToolbarMenuItemsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="size-7 shrink-0 rounded-md p-0 text-[var(--color-ink-soft)] hover:bg-[var(--glass-bg-subtle)]"
        aria-label="Mais ações"
      >
        <MoreHorizontal className="size-3.5" strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="z-50 min-w-[200px] max-w-[min(280px,calc(100vw-2rem))] rounded-xl border border-[var(--glass-border-subtle)] bg-white p-1 shadow-[0_8px_32px_rgba(0,0,0,0.10)]"
      >
        <DealWorkspaceToolbarMenuItems {...props} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

