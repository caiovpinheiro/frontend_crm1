"use client";

import { apiUrl } from "@/lib/api";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { IconArrowLeft as ArrowLeft, IconLoader2 as Loader2, IconMessage as MessageSquare, IconSend as Send } from "@tabler/icons-react";

import { ChannelBadge } from "@/components/inbox/channel-badge";
import { ChatWindow } from "@/components/inbox/chat-window-lazy";
import { Button } from "@/components/ui/button";
import { TooltipHost } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { ConversationRow } from "../shared";
import { STATUS_LABEL } from "../shared";

// ChatWindow permanece intocado (regra explicita §1: nao mexer no chat).
// Aqui so refatoramos o WRAPPER visual (lista + header de conversa).

type ConversationsPanelProps = {
  conversations: ConversationRow[];
  selected: ConversationRow | null;
  onSelect: (c: ConversationRow | null) => void;
  convStatus: string;
  onStatusChange: (s: string) => void;
  contactId?: string;
  contactPhone?: string | null;
  onConversationCreated?: () => void;
};

export function ConversationsPanel({
  conversations,
  selected,
  onSelect,
  convStatus,
  contactId,
  onConversationCreated,
  onStatusChange,
}: ConversationsPanelProps) {
  const queryClient = useQueryClient();
  const autoCreatedRef = React.useRef(false);

  const autoCreateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl("/api/conversations/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          skipSend: true,
          source: "deal_workspace",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "Erro ao criar conversa");
      return data.conversation as ConversationRow;
    },
    onSuccess: (conv) => {
      if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      onConversationCreated?.();
      onSelect(conv);
    },
  });

  React.useEffect(() => {
    if (
      conversations.length === 0 &&
      contactId &&
      !selected &&
      !autoCreatedRef.current &&
      !autoCreateMutation.isPending
    ) {
      autoCreatedRef.current = true;
      autoCreateMutation.mutate();
    }
  }, [conversations.length, contactId, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selected) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div
          className={cn(
            "flex items-center gap-2 border-b border-[var(--glass-border-subtle)]",
            "bg-[var(--glass-bg-overlay)] px-3 py-2 backdrop-blur-sm sm:px-4",
          )}
        >
          {conversations.length > 1 ? (
            <TooltipHost label="Voltar" side="bottom">
              <button
                type="button"
                onClick={() => onSelect(null)}
                aria-label="Voltar"
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full",
                  "border border-border bg-white text-[var(--text-muted)]",
                  "transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--text-primary)] active:scale-95",
                )}
              >
                <ArrowLeft className="size-4" />
              </button>
            </TooltipHost>
          ) : null}
          <ChannelBadge channel={selected.channel} />
          {selected.inboxName ? (
            <span className="text-[12px] font-semibold tracking-tight text-[var(--text-muted)]">
              {selected.inboxName}
            </span>
          ) : null}
          <span
            className={cn(
              "ml-auto inline-flex items-center rounded-full border border-border bg-[var(--color-bg-subtle)]",
              "px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]",
            )}
          >
            {STATUS_LABEL[selected.status] ?? selected.status}
          </span>
        </div>
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-0 sm:px-2">
          <ChatWindow
            conversationId={selected.id}
            conversationStatus={convStatus || selected.status}
            onResolve={(s) => onStatusChange(s)}
            onReopen={(s) => onStatusChange(s)}
            compactChrome
          />
        </div>
      </div>
    );
  }

  if (autoCreateMutation.isPending) {
    return (
      <CenterMessage icon={<Loader2 className="size-8 animate-spin text-[var(--color-ink-muted)]" />}>
        Abrindo chat...
      </CenterMessage>
    );
  }

  if (autoCreateMutation.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <MessageSquare className="mb-3 size-12 text-[var(--text-faint)]" />
        <p className="text-sm text-[var(--color-danger-text)]">
          {autoCreateMutation.error instanceof Error
            ? autoCreateMutation.error.message
            : "Erro ao abrir chat."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 rounded-full"
          onClick={() => {
            autoCreatedRef.current = false;
            autoCreateMutation.mutate();
          }}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-primary-soft)]">
      {conversations.length === 0 ? (
        <CenterMessage icon={<Send className="size-12 text-[var(--text-faint)]" />}>
          Abrindo conversa...
        </CenterMessage>
      ) : (
        <div className="scrollbar-thin flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-2">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-2xl border border-[var(--glass-border-subtle)] bg-white",
                  "px-4 py-3 text-left transition-all",
                  "hover:border-[var(--color-primary)]/30 hover:shadow-[var(--shadow-indigo-glow)] active:scale-[0.99]",
                )}
              >
                <ChannelBadge channel={c.channel} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {c.inboxName ? (
                      <span className="truncate text-[14px] font-bold tracking-tight text-[var(--text-primary)]">
                        {c.inboxName}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[12px] tracking-tight text-[var(--color-ink-muted)]">
                    {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
                    c.status === "OPEN"
                      ? "border-[var(--color-success)]/30 bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
                      : c.status === "RESOLVED"
                      ? "border-border bg-[var(--color-bg-subtle)] text-[var(--text-muted)]"
                      : "border-[var(--color-warn)]/40 bg-[var(--color-warn-bg)] text-[var(--color-warn)]",
                  )}
                >
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CenterMessage({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="mb-3">{icon}</div>
      <p className="text-[14px] font-medium tracking-tight text-[var(--text-muted)]">{children}</p>
    </div>
  );
}
