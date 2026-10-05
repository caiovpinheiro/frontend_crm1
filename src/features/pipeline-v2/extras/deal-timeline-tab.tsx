"use client";

/*
 * Tab "Timeline" do DealDetailPanel — historico de eventos do deal.
 * GET /api/deals/:id/timeline.
 */

import Link from "next/link";
import {
  IconBolt,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconEdit,
  IconMessage,
  IconMessagePlus,
  IconNote,
  IconPackage,
  IconPlus,
  IconRefresh,
  IconRobot,
  IconSend,
  IconTag,
  IconTagOff,
  IconTrendingUp,
  IconUser,
} from "@tabler/icons-react";

import { useDealTimeline } from "@/features/pipeline-v2/hooks";
import type { DealTimelineEvent } from "@/features/pipeline-v2/api";
import {
  EVENT_CONFIG,
  automationOrigin,
  eventDescription,
  type FeedEvent,
} from "@/components/crm/feed/event-config";

interface DealTimelineTabProps {
  dealId: string;
}

const TYPE_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ size?: number }>; color: string }
> = {
  CREATED: { label: "Negocio criado", icon: IconPlus, color: "var(--brand-primary)" },
  STAGE_CHANGED: { label: "Estagio alterado", icon: IconTrendingUp, color: "var(--brand-primary)" },
  STATUS_CHANGED: { label: "Status alterado", icon: IconRefresh, color: "var(--color-info)" },
  WON: { label: "Negocio ganho", icon: IconCircleCheck, color: "var(--color-success)" },
  LOST: { label: "Negocio perdido", icon: IconCircleX, color: "var(--color-danger)" },
  ASSIGNED: { label: "Responsavel alterado", icon: IconUser, color: "var(--brand-primary)" },
  FIELD_UPDATED: { label: "Campo atualizado", icon: IconEdit, color: "var(--text-muted)" },
  CUSTOM_FIELD_UPDATED: { label: "Campo custom alterado", icon: IconEdit, color: "var(--text-muted)" },

  // Eventos de conversa/mensagem — aparecem quando a timeline é exibida no
  // contexto do inbox (escopada ao negócio do contato).
  MESSAGE_RECEIVED: { label: "Mensagem recebida", icon: IconMessage, color: "var(--brand-primary)" },
  MESSAGE_SENT: { label: "Mensagem enviada", icon: IconSend, color: "var(--color-success)" },
  MESSAGE_READ: { label: "Mensagem lida", icon: IconCircleCheck, color: "#38bdf8" },
  MESSAGE_FAILED: { label: "Falha no envio", icon: IconCircleX, color: "var(--color-danger)" },
  CONVERSATION_CREATED: { label: "Conversa criada", icon: IconMessagePlus, color: "var(--brand-primary)" },
  CONVERSATION_CLOSED: { label: "Conversa encerrada", icon: IconCircleCheck, color: "var(--color-success)" },
  CONVERSATION_REOPENED: { label: "Conversa reaberta", icon: IconRefresh, color: "var(--color-warning)" },
  CONVERSATION_STATUS_CHANGED: { label: "Status da conversa", icon: IconRefresh, color: "var(--color-info)" },
  ASSIGNEE_CHANGED: { label: "Responsavel da conversa", icon: IconUser, color: "var(--brand-primary)" },
  NOTE_ADDED: { label: "Nota adicionada", icon: IconNote, color: "var(--color-warning)" },
  TAG_ADDED: { label: "Tag adicionada", icon: IconTag, color: "var(--color-info)" },
  TAG_REMOVED: { label: "Tag removida", icon: IconTagOff, color: "var(--color-danger)" },
  // Tags do CONTATO (logadas com contactId) — antes caíam no fallback com
  // ícone de relógio. Agora têm ícone/label/cor próprios.
  CONTACT_CREATED: { label: "Contato criado", icon: IconUser, color: "var(--brand-primary)" },
  CONTACT_TAG_ADDED: { label: "Tag adicionada ao contato", icon: IconTag, color: "var(--color-info)" },
  CONTACT_TAG_REMOVED: { label: "Tag removida do contato", icon: IconTagOff, color: "var(--color-danger)" },
  CONTACT_FIELD_CHANGED: { label: "Campo do contato alterado", icon: IconEdit, color: "var(--text-muted)" },
  // Produtos do negócio — antes caíam no fallback (relógio). Ícone de pacote.
  PRODUCT_ADDED: { label: "Produto adicionado", icon: IconPackage, color: "var(--color-success)" },
  PRODUCT_REMOVED: { label: "Produto removido", icon: IconPackage, color: "var(--color-warning)" },
  PRODUCT_UPDATED: { label: "Produto atualizado", icon: IconPackage, color: "var(--color-info)" },
  AUTOMATION_EXECUTED: { label: "Automacao executada", icon: IconBolt, color: "var(--color-info)" },
  AI_AGENT_ACTION: { label: "Acao do agente IA", icon: IconRobot, color: "var(--color-info)" },
};

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Descrição textual do evento. Delega ao `eventDescription` canônico
 * (`event-config.ts`), que cobre todos os tipos — incluindo eventos de
 * mensagem/conversa que só aparecem no contexto do inbox.
 */
function describe(ev: DealTimelineEvent): string {
  return eventDescription({
    id: ev.id,
    type: ev.type,
    occurredAt: ev.createdAt,
    newValue: ev.newValue,
    entityLabel: ev.entityLabel,
    meta: ev.meta ?? {},
  } as FeedEvent);
}

/** Converte um tipo desconhecido (SNAKE_CASE) em texto legível. */
function prettifyType(type: string): string {
  const lower = type.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function DealTimelineTab({ dealId }: DealTimelineTabProps) {
  const { data: events = [], isLoading, isError } = useDealTimeline(dealId);

  if (isLoading) {
    return (
      <div className="p-5.5 text-[12.5px] text-[var(--text-muted)]">
        Carregando timeline...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-5.5 text-[12.5px] text-[var(--color-danger)]">
        Erro ao carregar timeline.
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--text-muted)]">
        <IconClock size={36} className="opacity-40" />
        <div className="font-display text-[13px] font-semibold">
          Sem eventos ainda
        </div>
        <p className="max-w-xs text-[12px]">
          Mudancas de estagio, status e atribuicoes apareceram aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-5.5">
      {events.map((ev) => {
        const meta = TYPE_META[ev.type] ?? {
          // Fallback: tipos não mapeados localmente herdam rótulo E ícone
          // canônicos do EVENT_CONFIG; só caem em prettify + relógio quando
          // realmente desconhecidos. (Antes o ícone era sempre relógio, o
          // que fazia "Produto adicionado" aparecer com ícone errado.)
          label: EVENT_CONFIG[ev.type]?.label ?? prettifyType(ev.type),
          icon: EVENT_CONFIG[ev.type]?.Icon ?? IconClock,
          color: "var(--text-muted)",
        };
        const Icon = meta.icon;
        const desc = describe(ev);
        // "Por que essa pessoa foi distribuída?" — origem da ação
        // automática (automação + nº do card do editor). Ausente em
        // eventos antigos e em ações manuais: a linha simplesmente não
        // é renderizada.
        const origin = automationOrigin(ev.meta);
        return (
          <div
            key={ev.id}
            className="flex items-start gap-3 rounded-[var(--radius-lg)] border p-3"
            style={{
              background: "var(--glass-bg-overlay, rgba(255,255,255,0.6))",
              borderColor: "var(--glass-border, rgba(0,0,0,0.08))",
            }}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                color: meta.color,
              }}
            >
              <Icon size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-[12.5px] font-semibold text-[var(--text-primary)]">
                  {meta.label}
                </span>
                <span className="text-[10.5px] text-[var(--text-muted)]">
                  {fmtDate(ev.createdAt)}
                </span>
              </div>
              {desc ? (
                <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
                  {desc}
                </div>
              ) : null}
              {ev.user?.name ? (
                <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  por {ev.user.name}
                </div>
              ) : null}
              {origin ? (
                <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  {origin.automationId ? (
                    <Link
                      href={`/automations/${origin.automationId}`}
                      className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-secondary)]"
                    >
                      {origin.text}
                    </Link>
                  ) : (
                    origin.text
                  )}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
