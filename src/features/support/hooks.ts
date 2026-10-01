"use client";

import { useEffect, useRef } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";

import {
  claimSupportTicket,
  createSupportTicket,
  getSupportMeta,
  listSupportMessages,
  listSupportTickets,
  resolveSupportTicket,
  sendSupportMessage,
} from "./api";
import { subscribeSSEEvents } from "@/hooks/use-sse";
import {
  applySupportTicketPatch,
  createLeadingTrailingThrottle,
  readSupportTicketPatch,
  SUPPORT_INVALIDATE_THROTTLE_MS,
} from "./ticket-patch";
import type { SupportScope, SupportTicket } from "./types";

const TICKETS_KEY = "support-tickets";
const MESSAGES_KEY = "support-messages";
const META_KEY = "support-meta";

export function useSupportMeta() {
  return useQuery({
    queryKey: [META_KEY],
    queryFn: getSupportMeta,
    staleTime: 60_000,
  });
}

export function useSupportTickets(scope: SupportScope, enabled = true) {
  const visible = useDocumentVisible();
  return useQuery({
    queryKey: [TICKETS_KEY, scope],
    queryFn: () => listSupportTickets(scope),
    enabled,
    // Realtime vem do SSE (useSupportRealtime). O interval é só safety-net
    // para queda silenciosa da stream.
    refetchInterval: visible ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useSupportMessages(ticketId: string | null) {
  const visible = useDocumentVisible();
  return useQuery({
    queryKey: [MESSAGES_KEY, ticketId],
    queryFn: () => listSupportMessages(ticketId as string),
    enabled: !!ticketId,
    // Idem: SSE `support_message` invalida esta key; interval é safety-net.
    refetchInterval: visible ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useCreateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSupportTicket,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TICKETS_KEY] });
    },
  });
}

export function useSendSupportMessage(ticketId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      sendSupportMessage(ticketId as string, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [MESSAGES_KEY, ticketId] });
      qc.invalidateQueries({ queryKey: [TICKETS_KEY] });
    },
  });
}

export function useClaimSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: claimSupportTicket,
    onSuccess: () => qc.invalidateQueries({ queryKey: [TICKETS_KEY] }),
  });
}

export function useResolveSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resolveSupportTicket,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TICKETS_KEY] });
    },
  });
}

/**
 * Realtime do suporte via SSE (mesma stream do inbox).
 *
 * Evento com `ticketId` patcheia o ticket in-place em todas as listas
 * `[support-tickets, scope]` em cache (status, responsável, última
 * mensagem) — a tela reage na hora, sem GET. A invalidação da lista
 * continua (um ticket pode entrar/sair de um escopo, e os contadores de
 * não lidas são por visualizador), mas com throttle de 2 s com borda
 * final: rajada vira 2 GETs no máximo, e a última mudança nunca se perde
 * (o throttle antigo de 250 ms descartava o que chegava dentro da janela).
 * Mensagem nova invalida só `[support-messages, ticketId]`.
 */
export function useSupportRealtime(activeTicketId: string | null, enabled = true) {
  const qc = useQueryClient();
  const activeRef = useRef(activeTicketId);
  activeRef.current = activeTicketId;

  useEffect(() => {
    if (!enabled) return;

    const invalidateTickets = createLeadingTrailingThrottle(() => {
      void qc.invalidateQueries({ queryKey: [TICKETS_KEY] });
    }, SUPPORT_INVALIDATE_THROTTLE_MS);

    const patchTicket = (raw: unknown) => {
      const patch = readSupportTicketPatch(raw);
      if (!patch) return null;
      qc.setQueriesData<SupportTicket[]>({ queryKey: [TICKETS_KEY] }, (prev) =>
        applySupportTicketPatch(prev, patch),
      );
      return patch;
    };

    const onTicketUpdated = (raw: unknown) => {
      try {
        patchTicket(raw);
      } catch {
        /* ignore */
      }
      invalidateTickets.call();
    };

    const onMessage = (raw: unknown) => {
      let ticketId: string | undefined;
      try {
        ticketId = patchTicket(raw)?.ticketId;
      } catch {
        /* ignore */
      }
      if (ticketId) {
        void qc.invalidateQueries({ queryKey: [MESSAGES_KEY, ticketId] });
      }
      invalidateTickets.call();
    };

    const unsubscribe = subscribeSSEEvents("/api/sse/messages", {
      // Ticket novo não existe no cache: só o refetch traz.
      support_ticket_new: () => invalidateTickets.call(),
      support_ticket_updated: onTicketUpdated,
      support_message: onMessage,
    });
    return () => {
      unsubscribe();
      invalidateTickets.cancel();
    };
  }, [qc, enabled]);
}
