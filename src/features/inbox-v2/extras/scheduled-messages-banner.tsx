"use client";

/*
 * Banner de agendamentos pendentes — fica acima do Composer, em todo host
 * (inbox, Flow, Kanban). Mostra até 2 em detalhe e condensa o resto em
 * "+N", como o ChatWindow legado. Dados: `useScheduledMessages` (poll de
 * 60 s só com a aba visível e só com conversa aberta).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconClock, IconX } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import {
  cancelScheduledMessage,
  type ScheduledMessage,
} from "@/features/inbox-v2/api";
import {
  scheduledMessagesKey,
  useScheduledMessages,
} from "@/features/inbox-v2/hooks/use-scheduled-messages";

export const SCHEDULED_BANNER_MAX_ROWS = 2;

/** "dd/MM HH:mm" no fuso local. Data inválida → texto cru. */
export function formatScheduledAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Resumo de 1 linha: texto (80 chars) > template fallback > "[anexo]". */
export function scheduledMessageSummary(
  sm: Pick<ScheduledMessage, "content" | "fallbackTemplateName">,
): string {
  const text = (sm.content ?? "").trim();
  if (text) return text.slice(0, 80);
  if (sm.fallbackTemplateName) return `Template: ${sm.fallbackTemplateName}`;
  return "[anexo]";
}

export function ScheduledMessagesBanner({
  conversationId,
  className,
}: {
  conversationId: string | null;
  className?: string;
}) {
  const qc = useQueryClient();
  const { data } = useScheduledMessages(conversationId);
  const items = data?.items ?? [];

  const cancel = useMutation<void, Error, string>({
    mutationFn: (id) => cancelScheduledMessage(id),
    onSuccess: () => {
      toast.success("Agendamento cancelado");
      qc.invalidateQueries({ queryKey: scheduledMessagesKey(conversationId) });
    },
    onError: () => toast.error("Falha ao cancelar agendamento"),
  });

  if (!conversationId || items.length === 0) return null;

  const rest = items.length - SCHEDULED_BANNER_MAX_ROWS;

  return (
    <div
      role="status"
      aria-label="Mensagens agendadas"
      className={cn("mb-2 flex flex-col gap-1.5", className)}
    >
      {items.slice(0, SCHEDULED_BANNER_MAX_ROWS).map((sm) => {
        const when = formatScheduledAt(sm.scheduledAt);
        return (
          <div
            key={sm.id}
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md"
          >
            <IconClock size={14} className="shrink-0 text-[var(--brand-primary)]" />
            <span className="shrink-0 font-semibold text-[var(--text-primary)]">
              Agendada para {when}
            </span>
            <span className="hidden min-w-0 truncate sm:inline">
              — {scheduledMessageSummary(sm)}
            </span>
            <button
              type="button"
              onClick={() => cancel.mutate(sm.id)}
              disabled={cancel.isPending}
              aria-label={`Cancelar agendamento de ${when}`}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <IconX size={12} /> Cancelar
            </button>
          </div>
        );
      })}
      {rest > 0 && (
        <p className="px-1 text-[11px] font-medium text-[var(--text-muted)]">
          +{rest} outro(s) agendamento(s) pendente(s)
        </p>
      )}
    </div>
  );
}
