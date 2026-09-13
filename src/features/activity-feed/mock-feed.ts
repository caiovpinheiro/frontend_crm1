/**
 * Dados de mockup do Activity Feed — um evento representativo de cada tipo
 * mapeado em EVENT_CONFIG. Usado como "modo demonstração" na página /logs
 * quando ainda não há eventos reais, para visualizar todas as variações
 * visuais (ícones, cores, descrições e badges de ator).
 *
 * NÃO é usado quando existem eventos reais ou filtros ativos.
 */

import type { FeedEvent } from "@/components/crm/feed";

type ActorType = NonNullable<FeedEvent["actorType"]>;

type MockDef = {
  type: string;
  entityType?: string;
  entityLabel?: string;
  meta?: Record<string, unknown>;
  field?: string;
  oldValue?: string;
  newValue?: string;
  actorType: ActorType;
  actorLabel: string;
};

/// Definições (uma por tipo). A ordem aqui vira a ordem cronológica:
/// os primeiros itens ficam "Hoje", os demais "Ontem" / dias anteriores.
const DEFS: MockDef[] = [
  // ── Negócio ──────────────────────────────────────────────
  {
    type: "CREATED",
    entityType: "DEAL",
    entityLabel: "Plano Pro — Acme Ltda",
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "STAGE_CHANGED",
    entityType: "DEAL",
    entityLabel: "Plano Pro — Acme Ltda",
    meta: { from: { name: "Novo lead" }, to: { name: "Qualificação" } },
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "STATUS_CHANGED",
    entityType: "DEAL",
    entityLabel: "Implantação — Beta Corp",
    meta: { from: "OPEN", to: "WON" },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "OWNER_CHANGED",
    entityType: "DEAL",
    entityLabel: "Renovação — Gamma SA",
    meta: { from: { name: "Ana Souza" }, to: { name: "Bruno Lima" } },
    actorType: "HUMAN",
    actorLabel: "Gestor",
  },
  {
    type: "FIELD_UPDATED",
    entityType: "DEAL",
    entityLabel: "Plano Pro — Acme Ltda",
    meta: { field: "value", from: "R$ 1.000", to: "R$ 2.500" },
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "CUSTOM_FIELD_UPDATED",
    entityType: "DEAL",
    entityLabel: "Implantação — Beta Corp",
    meta: { fieldLabel: "Origem", from: "Site", to: "Indicação" },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "DEAL_DELETED",
    entityType: "DEAL",
    entityLabel: "Teste — Lead duplicado",
    actorType: "HUMAN",
    actorLabel: "Gestor",
  },

  // ── Tags / Produtos ──────────────────────────────────────
  {
    type: "TAG_ADDED",
    entityType: "DEAL",
    entityLabel: "Plano Pro — Acme Ltda",
    meta: { tagName: "VIP" },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "TAG_REMOVED",
    entityType: "DEAL",
    entityLabel: "Renovação — Gamma SA",
    meta: { tagName: "Frio" },
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "PRODUCT_ADDED",
    entityType: "DEAL",
    entityLabel: "Plano Pro — Acme Ltda",
    meta: { productName: "Plano Anual + Onboarding" },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "PRODUCT_REMOVED",
    entityType: "DEAL",
    entityLabel: "Implantação — Beta Corp",
    meta: { productName: "Suporte Premium" },
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "PRODUCT_UPDATED",
    entityType: "DEAL",
    entityLabel: "Plano Pro — Acme Ltda",
    meta: { productName: "Plano Anual (qtd. 1 → 3)" },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },

  // ── Notas / Tarefas ──────────────────────────────────────
  {
    type: "NOTE_ADDED",
    entityType: "NOTE",
    entityLabel: "Acme Ltda",
    meta: { preview: "Cliente pediu proposta revisada até sexta." },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "NOTE_UPDATED",
    entityType: "NOTE",
    entityLabel: "Beta Corp",
    meta: { preview: "Ajustado prazo de entrega para 15/07." },
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "NOTE_DELETED",
    entityType: "NOTE",
    entityLabel: "Gamma SA",
    meta: { preview: "Anotação obsoleta removida." },
    actorType: "HUMAN",
    actorLabel: "Gestor",
  },
  {
    type: "ACTIVITY_ADDED",
    entityType: "ACTIVITY",
    entityLabel: "Acme Ltda",
    meta: { title: "Ligar para apresentar proposta" },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "ACTIVITY_COMPLETED",
    entityType: "ACTIVITY",
    entityLabel: "Acme Ltda",
    meta: { title: "Enviar contrato", result: "Assinado" },
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "ACTIVITY_UPDATED",
    entityType: "ACTIVITY",
    entityLabel: "Beta Corp",
    meta: { title: "Reunião de kickoff", fields: ["prazo", "responsável"] },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "ACTIVITY_DUE_CHANGED",
    entityType: "ACTIVITY",
    entityLabel: "Gamma SA",
    meta: { title: "Follow-up comercial" },
    oldValue: "2026-06-05T14:00:00.000Z",
    newValue: "2026-06-09T16:30:00.000Z",
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "ACTIVITY_DESCRIPTION_CHANGED",
    entityType: "ACTIVITY",
    entityLabel: "Acme Ltda",
    meta: { title: "Revisar escopo do projeto" },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "ACTIVITY_RENAMED",
    entityType: "ACTIVITY",
    entityLabel: "Beta Corp",
    meta: { title: "Demo técnica (renomeada)" },
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "ACTIVITY_DELETED",
    entityType: "ACTIVITY",
    entityLabel: "Gamma SA",
    meta: { title: "Tarefa cancelada" },
    actorType: "HUMAN",
    actorLabel: "Gestor",
  },

  // ── Contato ──────────────────────────────────────────────
  {
    type: "CONTACT_CREATED",
    entityType: "CONTACT",
    entityLabel: "Carla Mendes",
    meta: { source: "Formulário do site" },
    actorType: "INTEGRATION",
    actorLabel: "Landing Page",
  },
  {
    type: "CONTACT_LINKED",
    entityType: "CONTACT",
    entityLabel: "Carla Mendes",
    meta: { to: { name: "Plano Pro — Acme Ltda" } },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "CONTACT_UNLINKED",
    entityType: "CONTACT",
    entityLabel: "Diego Reis",
    meta: { from: { name: "Renovação — Gamma SA" } },
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "CONTACT_FIELD_CHANGED",
    entityType: "CONTACT",
    entityLabel: "Carla Mendes",
    meta: { field: "Telefone", from: "(11) 9000-0000", to: "(11) 98888-7777" },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "CONTACT_TAG_ADDED",
    entityType: "CONTACT",
    entityLabel: "Carla Mendes",
    meta: { tagName: "Decisor" },
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "CONTACT_TAG_REMOVED",
    entityType: "CONTACT",
    entityLabel: "Diego Reis",
    meta: { tagName: "Newsletter" },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "CONTACT_OWNER_CHANGED",
    entityType: "CONTACT",
    entityLabel: "Carla Mendes",
    meta: { from: { name: "Ana Souza" }, to: { name: "Bruno Lima" } },
    actorType: "HUMAN",
    actorLabel: "Gestor",
  },
  {
    type: "CONTACT_DELETED",
    entityType: "CONTACT",
    entityLabel: "Contato spam",
    actorType: "SYSTEM",
    actorLabel: "Sistema",
  },

  // ── Conversa / Mensagem ──────────────────────────────────
  {
    type: "CONVERSATION_CREATED",
    entityType: "CONVERSATION",
    entityLabel: "WhatsApp — Carla Mendes",
    meta: { channel: "WhatsApp" },
    actorType: "INTEGRATION",
    actorLabel: "WhatsApp Cloud",
  },
  {
    type: "CONVERSATION_STATUS_CHANGED",
    entityType: "CONVERSATION",
    entityLabel: "WhatsApp — Carla Mendes",
    meta: { from: "OPEN", to: "PENDING" },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "CONVERSATION_CLOSED",
    entityType: "CONVERSATION",
    entityLabel: "WhatsApp — Diego Reis",
    meta: { from: "OPEN", to: "RESOLVED" },
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "CONVERSATION_TABULATED",
    entityType: "CONVERSATION",
    entityLabel: "WhatsApp — Diego Reis",
    meta: { tabulationName: "Dúvida acadêmica", tabulationNumber: 12 },
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "CONVERSATION_REOPENED",
    entityType: "CONVERSATION",
    entityLabel: "WhatsApp — Diego Reis",
    meta: { from: "RESOLVED", to: "OPEN" },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "ASSIGNEE_CHANGED",
    entityType: "CONVERSATION",
    entityLabel: "WhatsApp — Carla Mendes",
    meta: { from: { name: "Nenhum" }, to: { name: "Ana Souza" } },
    actorType: "HUMAN",
    actorLabel: "Gestor",
  },
  {
    type: "MESSAGE_RECEIVED",
    entityType: "MESSAGE",
    entityLabel: "WhatsApp — Carla Mendes",
    meta: { preview: "Oi! Gostaria de saber mais sobre o plano anual." },
    actorType: "INTEGRATION",
    actorLabel: "WhatsApp Cloud",
  },
  {
    type: "MESSAGE_SENT",
    entityType: "MESSAGE",
    entityLabel: "WhatsApp — Carla Mendes",
    meta: { preview: "Claro! Acabei de te enviar a proposta por e-mail." },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },

  // ── Chamadas ─────────────────────────────────────────────
  {
    type: "CALL_COMPLETED",
    entityType: "CONVERSATION",
    entityLabel: "Ligação — Carla Mendes",
    meta: { initiatedBy: "agent", durationSec: 184, recordingUrl: "https://x" },
    actorType: "HUMAN",
    actorLabel: "Bruno Lima",
  },
  {
    type: "CALL_MISSED",
    entityType: "CONVERSATION",
    entityLabel: "Ligação — Diego Reis",
    meta: { initiatedBy: "contact", durationSec: 0 },
    actorType: "INTEGRATION",
    actorLabel: "Telefonia",
  },

  // ── Mensagens agendadas ──────────────────────────────────
  {
    type: "SCHEDULED_MESSAGE_CREATED",
    entityType: "MESSAGE",
    entityLabel: "WhatsApp — Carla Mendes",
    meta: {
      preview: "Lembrete: nossa reunião é amanhã às 10h.",
      scheduledAt: "2026-06-08T13:00:00.000Z",
      hasFallbackTemplate: true,
    },
    actorType: "HUMAN",
    actorLabel: "Ana Souza",
  },
  {
    type: "SCHEDULED_MESSAGE_SENT",
    entityType: "MESSAGE",
    entityLabel: "WhatsApp — Carla Mendes",
    meta: { viaFallbackTemplate: false },
    actorType: "AUTOMATION",
    actorLabel: "Agendador",
  },
  {
    type: "SCHEDULED_MESSAGE_CANCELLED",
    entityType: "MESSAGE",
    entityLabel: "WhatsApp — Diego Reis",
    meta: { reason: "client_reply" },
    actorType: "AUTOMATION",
    actorLabel: "Agendador",
  },
  {
    type: "SCHEDULED_MESSAGE_FAILED",
    entityType: "MESSAGE",
    entityLabel: "WhatsApp — Lead inválido",
    meta: { reason: "Número fora do WhatsApp" },
    actorType: "AUTOMATION",
    actorLabel: "Agendador",
  },

  // ── Automação / IA ───────────────────────────────────────
  {
    type: "AUTOMATION_EXECUTED",
    entityType: "DEAL",
    entityLabel: "Plano Pro — Acme Ltda",
    meta: {
      automationName: "Boas-vindas novo lead",
      event: "lead.created",
      status: "COMPLETED",
    },
    actorType: "AUTOMATION",
    actorLabel: "Fluxo de automação",
  },
  {
    type: "AI_AGENT_ACTION",
    entityType: "CONVERSATION",
    entityLabel: "WhatsApp — Carla Mendes",
    meta: { action: "moved_stage", stageName: "Qualificação" },
    actorType: "AI",
    actorLabel: "Agente IA",
  },
];

function buildMockFeed(): FeedEvent[] {
  const now = Date.now();
  // Distribui ao longo dos últimos dias para exercitar o agrupamento por dia.
  const STEP_MIN = 23; // intervalo entre eventos
  return DEFS.map((d, i) => {
    const occurredAt = new Date(now - i * STEP_MIN * 60_000).toISOString();
    return {
      id: `mock-${i}-${d.type}`,
      type: d.type,
      occurredAt,
      meta: d.meta ?? {},
      entityType: d.entityType,
      entityId: `mock-entity-${i}`,
      entityLabel: d.entityLabel ?? null,
      field: d.field ?? null,
      oldValue: d.oldValue ?? null,
      newValue: d.newValue ?? null,
      actorType: d.actorType,
      actorLabel: d.actorLabel,
      actorSublabel: null,
    } satisfies FeedEvent;
  });
}

export const MOCK_FEED: FeedEvent[] = buildMockFeed();
