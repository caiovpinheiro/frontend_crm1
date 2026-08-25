"use client";

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { subscribeSSEEvents } from "@/hooks/use-sse";
import { isEventMessageType } from "@/components/crm/chat-timeline";
import { messagesKey } from "./use-messages";
import { playInboxPing } from "./use-inbox-sound";
import type { ConversationListRow } from "../api";

/**
 * SSE em /api/sse/messages — preserva exatamente o comportamento do
 * legado (`useSSE` + `scheduleInboxRefresh`):
 *
 *  - 1 EventSource só, compartilhado pela página.
 *  - Eventos new_message / conversation_updated invalidam list + counts.
 *  - message_status NÃO invalida lista/counts (só ticks da bolha) — evita
 *    refetch storm em cold-load / rajadas de delivery receipts.
 *  - new_message / whatsapp_call invalidam mensagens da conversa
 *    ativa quando o conversationId casa.
 *  - contact_updated passa pelo mesmo debounce da lista.
 *  - Throttle de 1000ms: rajadas de eventos não viram refetch×N.
 *  - message_status: update otimista do tick; refetch só em `failed`
 *    (delivered/read não disparam GET messages de novo).
 *  - Reconexão automática com backoff fixo de 5s em onerror.
 *    NÃO invalida lista no connect/reconnect (só em eventos reais).
 *
 * Aviso sonoro: só em inbound destinado a este operador (assignedToId),
 * para não tocar em quem tem a inbox vazia / não é responsável.
 */

type InfiniteInboxPage = {
  items?: Array<{ id: string; assignedToId?: string | null }>;
};

type NewMessagePayload = {
  conversationId?: string;
  direction?: string;
  assignedToId?: string | null;
  content?: string;
  timestamp?: string;
  messageType?: string;
};

/**
 * Patch in-place do card da conversa no cache da lista (P0-1): um
 * `new_message` atualiza preview/direção/unread do card JÁ carregado em
 * vez de invalidar a lista inteira (35KB) a cada evento da org.
 *
 * Retorna true quando a conversa foi encontrada em alguma página
 * cacheada. Quando não foi (conversa nova ou fora da página/filtro
 * atual), o chamador deve invalidar a lista — é uma mudança estrutural.
 *
 * Não reordena páginas (risco de quebrar o infinite scroll); a posição
 * do card se ajusta no próximo refetch (poll de 60s / troca de aba).
 */
function patchInboxConversationCard(
  qc: QueryClient,
  data: NewMessagePayload,
): boolean {
  if (!data.conversationId) return false;
  // Eventos de timeline (distribuição, etc.) não substituem o preview do card.
  if (isEventMessageType(data.messageType)) {
    const entries = qc.getQueriesData<{ pages?: Array<{ items?: ConversationListRow[] }> }>({
      queryKey: ["inbox-conversations"],
    });
    for (const [, cached] of entries) {
      if (!cached?.pages) continue;
      for (const page of cached.pages) {
        if (page?.items?.some((c) => c?.id === data.conversationId)) return true;
      }
    }
    return false;
  }
  const direction =
    data.direction === "in" || data.direction === "out" ? data.direction : null;
  const ts =
    typeof data.timestamp === "string" && data.timestamp
      ? data.timestamp
      : new Date().toISOString();
  const content = typeof data.content === "string" ? data.content : "";

  const entries = qc.getQueriesData<{ pages?: Array<{ items?: ConversationListRow[] }> }>({
    queryKey: ["inbox-conversations"],
  });
  let found = false;
  for (const [queryKey, cached] of entries) {
    if (!cached?.pages) continue;
    let touched = false;
    const pages = cached.pages.map((page) => {
      const items = page?.items;
      if (!items) return page;
      const idx = items.findIndex((c) => c?.id === data.conversationId);
      if (idx < 0) return page;
      found = true;
      touched = true;
      const conv = items[idx];
      const nextItems = items.slice();
      nextItems[idx] = {
        ...conv,
        lastMessageAt: ts,
        updatedAt: ts,
        ...(direction === "in"
          ? {
              lastInboundAt: ts,
              unreadCount: (conv.unreadCount ?? 0) + 1,
            }
          : {}),
        ...(data.assignedToId !== undefined
          ? { assignedToId: data.assignedToId }
          : {}),
        // messageType "" força o adapter a re-inferir o ícone pelo
        // placeholder do content ("[Áudio]", "📎 ...") da nova mensagem.
        lastMessagePreview: {
          content,
          messageType: "",
          mediaUrl: null,
          direction: direction ?? conv.lastMessagePreview?.direction ?? "",
          sendStatus: direction === "out" ? "sent" : null,
          sendError: null,
        },
        // Campo "futuro" tem precedência no adapter — se existir na row,
        // precisa acompanhar o patch pra não exibir preview velho.
        ...(conv.lastMessage
          ? {
              lastMessage: {
                ...conv.lastMessage,
                preview: content,
                direction: direction ?? conv.lastMessage.direction,
              },
            }
          : {}),
      };
      return { ...page, items: nextItems };
    });
    if (touched) qc.setQueryData(queryKey, { ...cached, pages });
  }
  return found;
}

function shouldPlayInboundPing(
  qc: QueryClient,
  currentUserId: string | null | undefined,
  data: {
    conversationId?: string;
    direction?: string;
    assignedToId?: string | null;
  },
): boolean {
  if (data.direction !== "in") return false;
  if (!currentUserId) return false;

  // Payload novo: responsável explícito no SSE.
  if (typeof data.assignedToId === "string" && data.assignedToId.length > 0) {
    return data.assignedToId === currentUserId;
  }
  // Sem responsável → fila livre; não é "mensagem deste operador".
  if (data.assignedToId === null) return false;

  // Payload legado (sem assignedToId): só toca se a conversa já está na
  // lista de inbox deste cliente (visibilidade já filtrada no GET).
  if (!data.conversationId) return false;
  const entries = qc.getQueriesData<{ pages?: InfiniteInboxPage[] }>({
    queryKey: ["inbox-conversations"],
  });
  for (const [, cached] of entries) {
    const pages = cached?.pages;
    if (!pages) continue;
    for (const page of pages) {
      const hit = page?.items?.find((c) => c.id === data.conversationId);
      if (!hit) continue;
      if (hit.assignedToId == null) return false;
      return hit.assignedToId === currentUserId;
    }
  }
  return false;
}

export function useInboxRealtime(options: {
  activeConversationId: string | null;
  /** Usuário logado — necessário para filtrar o bip por responsável. */
  currentUserId?: string | null;
  enabled?: boolean;
}) {
  const { activeConversationId, currentUserId = null, enabled = true } = options;
  const qc = useQueryClient();
  const activeRef = useRef(activeConversationId);
  activeRef.current = activeConversationId;
  const userIdRef = useRef(currentUserId);
  userIdRef.current = currentUserId;

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dailyStatsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }, [activeConversationId]);

  useEffect(() => {
    if (!enabled) return;

    function scheduleInboxRefresh() {
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
        qc.invalidateQueries({ queryKey: ["conversations", "tab-counts"] });
        qc.invalidateQueries({ queryKey: ["distribution-responsibles"] });
        qc.invalidateQueries({ queryKey: ["distribution-pending"] });
      }, 1000);
    }

    // Badges das abas: 1s (antes 5s). Cache Redis do backend acompanha.
    function scheduleCountsRefresh() {
      if (countsTimerRef.current) return;
      countsTimerRef.current = setTimeout(() => {
        countsTimerRef.current = null;
        qc.invalidateQueries({ queryKey: ["conversations", "tab-counts"] });
        qc.invalidateQueries({ queryKey: ["distribution-responsibles"] });
        qc.invalidateQueries({ queryKey: ["distribution-pending"] });
      }, 1000);
    }

    // Chips do painel do dia (P1-8): o poll longo (3min) é safety-net; a
    // atualização perceptível vem daqui, com o mesmo debounce dos counts.
    function scheduleDailyStatsRefresh() {
      if (dailyStatsTimerRef.current) return;
      dailyStatsTimerRef.current = setTimeout(() => {
        dailyStatsTimerRef.current = null;
        qc.invalidateQueries({ queryKey: ["inbox", "daily-stats"] });
      }, 5000);
    }

    const unsubscribe = subscribeSSEEvents("/api/sse/messages", {
      new_message: (raw: unknown) => {
        try {
          const data = raw as NewMessagePayload;
          if (shouldPlayInboundPing(qc, userIdRef.current, data)) {
            playInboxPing();
          }
          if (data.conversationId) {
            if (data.conversationId === activeRef.current) {
              // Conversa aberta: refetch imediato para exibir a mensagem.
              qc.invalidateQueries({ queryKey: messagesKey(activeRef.current) });
            } else {
              // Outra conversa: marca stale sem refetch imediato.
              // Quando o operador navegar até ela, verá dados frescos.
              qc.invalidateQueries({
                queryKey: messagesKey(data.conversationId),
                refetchType: "none",
              });
            }
          }
          // Patch in-place do card quando a conversa está na página
          // cacheada; invalidação da lista só quando ela NÃO está
          // (conversa nova/fora da página = mudança estrutural).
          if (patchInboxConversationCard(qc, data)) {
            scheduleCountsRefresh();
          } else {
            scheduleInboxRefresh();
          }
          scheduleDailyStatsRefresh();
        } catch {
          /* ignore */
        }
      },

      message_status: (raw: unknown) => {
        try {
          const data = raw as {
            conversationId?: string;
            /** Id da bolha (= externalId/wamid no Meta). */
            messageId?: string;
            /** UUID interno — fallback p/ payloads antigos. */
            internalId?: string;
            status?: string;
          };
          if (data.conversationId) {
            // Atualização otimista do tick (sent→delivered→read) sem
            // esperar o refetch — evita atraso perceptível nos ticks azuis.
            if (data.messageId && data.status) {
              const mapped = ({
                pending: "PENDING",
                sent: "SENT",
                delivered: "DELIVERED",
                read: "READ",
                failed: "FAILED",
              } as Record<string, string>)[data.status.toLowerCase()];
              if (mapped) {
                const bubbleId = data.messageId;
                const internalId = data.internalId;
                qc.setQueryData(
                  messagesKey(data.conversationId),
                  (old: { messages?: Array<{ id: string; status?: string; sendStatus?: string | null }> } | undefined) => {
                    if (!old?.messages) return old;
                    return {
                      ...old,
                      messages: old.messages.map((m) =>
                        m.id === bubbleId || (internalId != null && m.id === internalId)
                          ? { ...m, status: mapped, sendStatus: data.status!.toLowerCase() }
                          : m,
                      ),
                    };
                  },
                );
              }
            }
            // Tick já atualizado de forma otimista acima. Refetch só em
            // failed (precisa sendError completo); delivered/read não
            // disparam GET messages — evita spam na conversa aberta.
            const statusLc = (data.status ?? "").toLowerCase();
            if (statusLc === "failed") {
              if (data.conversationId === activeRef.current) {
                void qc.refetchQueries({
                  queryKey: messagesKey(data.conversationId),
                });
              } else {
                qc.invalidateQueries({
                  queryKey: messagesKey(data.conversationId),
                  refetchType: "none",
                });
              }
            } else if (data.conversationId !== activeRef.current) {
              qc.invalidateQueries({
                queryKey: messagesKey(data.conversationId),
                refetchType: "none",
              });
            }
            // Leitura (ticks azuis): atualiza timeline do deal e feed /logs.
            if (statusLc === "read") {
              qc.invalidateQueries({ queryKey: ["deal-timeline-v2"] });
              qc.invalidateQueries({ queryKey: ["deal-timeline"] });
              qc.invalidateQueries({ queryKey: ["activity-feed"] });
              qc.invalidateQueries({ queryKey: ["activity-feed-stats"] });
            }
          }
          // Delivery receipts não mudam a lista/counts — só ticks na bolha.
          // Evita cold-load storm quando o SSE despeja message_status em lote.
        } catch {
          /* ignore */
        }
      },

      conversation_updated: () => {
        scheduleInboxRefresh();
        scheduleDailyStatsRefresh();
      },

      // Timeline (chatter) da conversa — encerramento/reabertura empurrados
      // pelo backend. Invalida ["conversation-timeline", id] p/ o
      // ConversationTimelineTab exibir o evento na hora, mesmo quando a
      // acao veio de outro agente/automacao (sem mutation local).
      conversation_timeline_updated: (raw: unknown) => {
        try {
          const data = raw as {
            conversationId?: string;
          };
          if (data.conversationId) {
            qc.invalidateQueries({
              queryKey: ["conversation-timeline", data.conversationId],
            });
          }
        } catch {
          /* ignore */
        }
      },

      contact_updated: (raw: unknown) => {
        try {
          const data = raw as {
            contactId?: string;
          };
          scheduleInboxRefresh();
          if (data.contactId) {
            qc.invalidateQueries({ queryKey: ["contact-sidebar", data.contactId] });
          }
        } catch {
          /* ignore */
        }
      },

      whatsapp_call: (raw: unknown) => {
        try {
          const data = raw as {
            conversationId?: string;
          };
          if (data.conversationId && data.conversationId === activeRef.current) {
            qc.invalidateQueries({ queryKey: messagesKey(activeRef.current) });
          }
        } catch {
          /* ignore */
        }
      },

      presence_update: () => {
        qc.invalidateQueries({ queryKey: ["my-agent-status"] });
      },

      // Ciclo de vida de automações (robô iniciou/avançou/terminou) —
      // atualiza o chip "robô em execução" do chat aberto. O evento traz
      // contactId (contexto não referencia conversa), então invalidamos a
      // query da conversa ativa; se o contato não for o mesmo, o refetch
      // é barato e o resultado idêntico.
      automation_state: (raw: unknown) => {
        // Invalida o botão "Robôs ativos" (por contato) do evento e,
        // por compat, o chip antigo (por conversa ativa).
        try {
          const data = raw as {
            contactId?: string;
          };
          if (data.contactId) {
            qc.invalidateQueries({
              queryKey: ["active-automations-contact", data.contactId],
            });
            qc.invalidateQueries({
              queryKey: ["automation-history-contact", data.contactId],
            });
          }
        } catch {
          /* ignore */
        }
        if (activeRef.current) {
          qc.invalidateQueries({
            queryKey: ["active-automations", activeRef.current],
          });
        }
      },
    });

    return () => {
      unsubscribe();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
      if (countsTimerRef.current) clearTimeout(countsTimerRef.current);
      countsTimerRef.current = null;
      if (dailyStatsTimerRef.current) clearTimeout(dailyStatsTimerRef.current);
      dailyStatsTimerRef.current = null;
    };
  }, [enabled, qc]);
}
