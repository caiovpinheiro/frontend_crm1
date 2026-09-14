"use client";

import { useQuery } from "@tanstack/react-query";

import { AppLoading } from "@/components/crm/app-loading";
import { ChatWindow } from "@/components/inbox/chat-window-lazy";
import { WorkspaceShell } from "@/components/pipeline/deal-workspace/shell";
import { findCurrentInboxConversationForContact } from "@/features/inbox-v2/api/conversations";
import { apiUrl } from "@/lib/api";

import type { OpenCrmCard } from "./types";

async function fetchDealContactId(dealId: string): Promise<string | null> {
  const res = await fetch(apiUrl(`/api/deals/${dealId}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.message === "string" ? data.message : "Erro ao carregar negócio");
  }
  return typeof data?.contact?.id === "string" ? data.contact.id : null;
}

export function RecordPeek({
  card,
  onClose,
}: {
  card: OpenCrmCard | null;
  onClose: () => void;
}) {
  const conversationId = card?.type === "conversation" ? card.id : null;
  const resolved = useQuery({
    queryKey: ["team-chat-record-peek", card?.type, card?.id],
    enabled: Boolean(card && card.type !== "conversation"),
    queryFn: async () => {
      const contactId = card!.type === "contact" ? card!.id : await fetchDealContactId(card!.id);
      if (!contactId) return null;
      const row = await findCurrentInboxConversationForContact(contactId);
      return row?.id ?? null;
    },
  });

  const chatId = conversationId ?? resolved.data ?? null;
  const loading = Boolean(card && card.type !== "conversation" && resolved.isPending);
  const error =
    resolved.error instanceof Error
      ? resolved.error.message
      : resolved.isError
        ? "Não foi possível abrir o atendimento."
        : null;

  return (
    <WorkspaceShell open={Boolean(card)} onClose={onClose} closeLabel="Voltar ao chat">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
        <div className="flex h-12 shrink-0 items-center border-b border-border px-4 pr-14">
          <p className="truncate text-sm font-semibold text-foreground">{card?.title ?? "Atendimento"}</p>
        </div>
        {loading ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : error ? (
          <AppLoading
            variant="inline"
            className="min-h-0 flex-1"
            error={error}
            onRetry={() => void resolved.refetch()}
          />
        ) : chatId ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ChatWindow conversationId={chatId} compactChrome />
          </div>
        ) : (
          <p className="px-6 py-10 text-sm text-muted-foreground">
            Não há atendimento para abrir aqui. O chat interno continua nesta tela.
          </p>
        )}
      </div>
    </WorkspaceShell>
  );
}
