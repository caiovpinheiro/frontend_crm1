"use client";

/**
 * SalesHubChat — o chat do Sales Hub é o MESMO stack do `/inbox`.
 *
 * O Sales Hub usava `ConversationHeader` + `ChatWindow` (stack legado do
 * inbox v1). Depois passou a replicar a ligação de dados do `/inbox`
 * (`_v2-client`) por conta própria. Hoje é só um adaptador de props para
 * o host canônico (`ConversationChatHost`): mesmas queries, mesmas
 * mutations, mesmos componentes visuais — inclusive o kebab da conversa,
 * marcar como lida e o painel de favoritas. As ações específicas de
 * negócio (Ganho/Perdido, gaveta CRM, chip de ligação) entram por
 * `headerActionsSlot`.
 */

import { useMemo } from "react";

import { ConversationChatHost } from "@/features/inbox-v2/extras/conversation-chat-host";

export type SalesHubChatProps = {
  conversationId: string;
  conversationStatus?: string | null;
  conversationNumber?: number | null;
  conversationClosedAt?: string | null;
  /** `lastInboundAt` da conversa — fallback da janela de 24h da Meta. */
  lastInboundAt?: string | null;
  /** Responsável atual — kebab (transferir) e Composer. */
  assignedToId?: string | null;
  /** Departamento — tabulação ao encerrar (Composer e kebab). */
  departmentId?: string | null;
  requireTabulationOnClose?: boolean;
  contactId: string;
  contactName: string;
  contactPhone?: string | null;
  contactChannel?: string | null;
  dealId: string;
  pipelineId?: string | null;
  /** Ações à direita do header (Ganho/Perdido, gaveta CRM…), antes do kebab. */
  headerActionsSlot?: React.ReactNode;
  /** Abre a busca inline do ChatArea a partir de fora (ver ChatArea). */
  searchControlRef?: React.MutableRefObject<{ open: () => void } | null>;
  /**
   * Enviar numa conversa encerrada reabre como NOVO ticket (id novo). O
   * host precisa trocar a conversa ativa, senão a UI fica presa no
   * ticket antigo e parece que o envio não funcionou.
   */
  onConversationReopened?: (newConversationId: string) => void;
  /** Após "Encerrar" (Composer ou kebab). */
  onResolved?: (conversationId: string) => void;
};

export function SalesHubChat({
  conversationId,
  conversationStatus,
  conversationNumber,
  conversationClosedAt,
  lastInboundAt,
  assignedToId,
  departmentId,
  requireTabulationOnClose,
  contactId,
  contactName,
  contactPhone,
  contactChannel,
  dealId,
  pipelineId,
  headerActionsSlot,
  searchControlRef,
  onConversationReopened,
  onResolved,
}: SalesHubChatProps) {
  const conversation = useMemo(
    () => ({
      status: conversationStatus ?? null,
      number: conversationNumber ?? null,
      closedAt: conversationClosedAt ?? null,
      lastInboundAt: lastInboundAt ?? null,
      assignedToId: assignedToId ?? null,
    }),
    [conversationStatus, conversationNumber, conversationClosedAt, lastInboundAt, assignedToId],
  );
  const contact = useMemo(
    () => ({
      id: contactId,
      name: contactName,
      phone: contactPhone ?? null,
      channel: contactChannel ?? null,
    }),
    [contactId, contactName, contactPhone, contactChannel],
  );

  return (
    <ConversationChatHost
      conversationId={conversationId}
      conversation={conversation}
      contact={contact}
      dealId={dealId}
      pipelineId={pipelineId}
      departmentId={departmentId}
      requireTabulationOnClose={requireTabulationOnClose}
      headerActionsSlot={headerActionsSlot}
      searchControlRef={searchControlRef}
      onConversationReopened={onConversationReopened}
      onResolved={onResolved}
    />
  );
}
