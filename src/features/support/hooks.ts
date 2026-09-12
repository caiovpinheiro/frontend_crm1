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
import type { SupportScope } from "./types";

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
 * Realtime do suporte via SSE (mesma stream do inbox). Invalida as
 * queries de tickets/mensagens ao receber eventos. Throttle leve pra
 * evitar rajadas.
 */
export function useSupportRealtime(activeTicketId: string | null, enabled = true) {
  const qc = useQueryClient();
  const activeRef = useRef(activeTicketId);
  activeRef.current = activeTicketId;

  useEffect(() => {
    if (!enabled) return;
    let lastInvalidate = 0;

    const invalidateTickets = () => {
      const now = Date.now();
      if (now - lastInvalidate < 250) return;
      lastInvalidate = now;
      qc.invalidateQueries({ queryKey: [TICKETS_KEY] });
    };

    const onMessage = (raw: unknown) => {
      try {
        const data = raw as { ticketId?: string };
        invalidateTickets();
        if (data.ticketId) {
          qc.invalidateQueries({ queryKey: [MESSAGES_KEY, data.ticketId] });
        }
      } catch {
        /* ignore */
      }
    };

    return subscribeSSEEvents("/api/sse/messages", {
      support_ticket_new: () => invalidateTickets(),
      support_ticket_updated: () => invalidateTickets(),
      support_message: onMessage,
    });
  }, [qc, enabled]);
}
