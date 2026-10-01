import type { Dispatch, SetStateAction } from "react";
import { IconLock, IconMessage } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { ChannelSelector } from "../channel-selector";
import { ConversationResolveButton } from "../conversation-resolve-button";
import { SignatureControl } from "./signature-control";
import type { ComposerProps } from "./types";
import type { ComposerSignature } from "./use-composer-signature";

type ComposerTopRowProps = Pick<
  ComposerProps,
  | "transferSlot"
  | "onSendNote"
  | "availableChannels"
  | "selectedChannelId"
  | "conversationChannelId"
  | "onSelectChannel"
  | "viewersSlot"
  | "conversationNumber"
  | "conversationId"
  | "isResolved"
  | "hideResolveButton"
  | "departmentId"
  | "assignedToId"
  | "requireTabulationOnClose"
  | "onReopenNewConversation"
  | "onResolved"
  | "onFollowedUp"
  | "contactId"
  | "contactName"
  | "dealId"
> & {
  noteMode: boolean;
  setNoteMode: Dispatch<SetStateAction<boolean>>;
  busy: boolean;
  signatureAllowed: boolean;
  signatureEditable: boolean;
  signature: ComposerSignature;
  agentName: string;
};

/** Row acima do input: Transferir + tabs (esq.) … canal, assinatura, Nº + Encerrar/Reabrir (dir.). */
export function ComposerTopRow({
  transferSlot,
  onSendNote,
  noteMode,
  setNoteMode,
  availableChannels,
  selectedChannelId,
  conversationChannelId,
  onSelectChannel,
  busy,
  signatureAllowed,
  signature,
  agentName,
  signatureEditable,
  viewersSlot,
  conversationNumber,
  conversationId,
  isResolved,
  hideResolveButton,
  departmentId,
  assignedToId,
  requireTabulationOnClose,
  onReopenNewConversation,
  onResolved,
  onFollowedUp,
  contactId,
  contactName,
  dealId,
}: ComposerTopRowProps) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 px-0.5">
      {transferSlot}

      {/* Tabs Mensagem / Nota interna */}
      {onSendNote && (
        <>
          <button
            type="button"
            onClick={() => setNoteMode(false)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11.5px] font-semibold transition-all",
              !noteMode
                ? "bg-[var(--brand-primary)] text-white shadow-[0_2px_8px_rgba(91,111,245,0.35)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )}
          >
            <IconMessage size={12} />
            Mensagem
          </button>
          <button
            type="button"
            onClick={() => setNoteMode(true)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11.5px] font-semibold transition-all",
              noteMode
                ? "border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] text-[var(--text-primary)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )}
          >
            <IconLock size={12} />
            Nota interna
          </button>
        </>
      )}

      <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
      {/* Seletor de canal — só quando há >1 WhatsApp CONNECTED e fora do modo nota.
          Notas internas não trafegam por canal. */}
      {!noteMode &&
        availableChannels &&
        availableChannels.length > 1 &&
        onSelectChannel ? (
        <ChannelSelector
          channels={availableChannels}
          selectedChannelId={selectedChannelId ?? null}
          conversationChannelId={conversationChannelId ?? null}
          onSelect={onSelectChannel}
          disabled={busy}
        />
      ) : null}

      {/* Slot direito: badge "Nota" no modo nota, assinatura no modo mensagem */}
      {noteMode ? (
        /* Badge de nota — ocupa o mesmo espaço da assinatura */
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 font-display text-[11.5px] font-semibold text-warning ring-1 ring-inset ring-warning/25">
          <IconLock size={12} /> Nota
        </span>
      ) : signatureAllowed ? (
        /* Assinatura do agente */
        <SignatureControl
          signature={signature}
          agentName={agentName}
          signatureEditable={signatureEditable}
        />
      ) : null}

      {viewersSlot}

      {/* Nº da conversa + Encerrar/Reabrir */}
      {(conversationNumber != null || conversationId) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {conversationNumber != null && (
            <TooltipGlass
              label={`Conversa Nº ${conversationNumber}`}
              side="top"
            >
              <span
                className={cn(
                  "cursor-default font-display text-[11px] font-semibold tabular-nums",
                  isResolved
                    ? "text-[var(--text-muted)]"
                    : "text-emerald-600 v2-dark:text-emerald-400",
                )}
              >
                Nº {conversationNumber}
              </span>
            </TooltipGlass>
          )}
          {conversationId && !hideResolveButton && (
            <ConversationResolveButton
              conversationId={conversationId}
              isResolved={isResolved}
              departmentId={departmentId}
              assignedToId={assignedToId}
              requireTabulationOnClose={requireTabulationOnClose}
              onReopenNewConversation={onReopenNewConversation}
              onResolved={onResolved}
              onFollowedUp={onFollowedUp}
              contactId={contactId}
              contactName={contactName}
              dealId={dealId}
              disabled={busy}
            />
          )}
        </div>
      )}
      </div>
    </div>
  );
}
