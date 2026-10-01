"use client"

/**
 * Preview visual das mudanças da inbox:
 * - cards de conversa mais compactos
 * - 2+ negócios retraídos no ContactAside (expandir o que for atender)
 *
 * Abrir: /showcase/inbox-preview
 */
import { useState } from "react"
import { ConversationCard, type Conversation } from "@/components/crm/conversation-card"
import { ContactAside, type ContactDetails } from "@/components/crm/contact-aside"

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    name: "CONTATO DEMO DA SILVA",
    initials: "CD",
    avatarColor: "dusk",
    time: "2min",
    preview: "Boa tarde! Gostaria de saber sobre a matrícula.",
    channel: "whatsapp",
    status: "online",
    number: 6780,
    sessionExpiresIn: "Expirada",
    sessionExpired: true,
    assignee: "Julia",
    tags: [
      { id: "t1", name: "Lead quente", color: "#6366f1" },
      { id: "t2", name: "Acadêmico", color: "#10b981" },
    ],
    active: true,
  },
  {
    id: "c2",
    name: "ANA PAULA SILVA",
    initials: "AP",
    avatarColor: "teal",
    time: "15min",
    preview: "Ok, obrigada!",
    channel: "whatsapp",
    status: "offline",
    number: 6779,
    sessionExpiresIn: "18h",
    assignee: "Gestor",
    lastMessageDirection: "out",
  },
  {
    id: "c3",
    name: "CARLOS EDUARDO",
    initials: "CE",
    avatarColor: "ocean",
    time: "1h",
    preview: "Áudio",
    channel: "instagram",
    status: "online",
    number: 6778,
    lastMessageType: "audio",
    urgent: true,
  },
  {
    id: "c4",
    name: "FERNANDA COSTA",
    initials: "FC",
    avatarColor: "sunset",
    time: "Ontem",
    preview: "Enviei o comprovante em anexo.",
    channel: "whatsapp",
    status: "offline",
    number: 6775,
    resolved: true,
    assignee: "Julia",
  },
]

const FUNNEL = [
  { id: "s1", name: "Novo", color: "#94a3b8", position: 0 },
  { id: "s2", name: "Acolhimento", color: "#3b82f6", position: 1 },
  { id: "s3", name: "Qualificação", color: "#8b5cf6", position: 2 },
  { id: "s4", name: "Proposta", color: "#f59e0b", position: 3 },
  { id: "s5", name: "Negociação", color: "#14b8a6", position: 4 },
  { id: "s6", name: "Fechamento", color: "#22c55e", position: 5 },
  { id: "s7", name: "Matrícula", color: "#06b6d4", position: 6 },
  { id: "s8", name: "Onboarding", color: "#a855f7", position: 7 },
  { id: "s9", name: "Ativo", color: "#10b981", position: 8 },
]

const MOCK_CONTACT: ContactDetails = {
  name: "CONTATO DEMO DA SILVA",
  contactId: "contact-demo-1",
  contactNumber: 18032,
  phone: "+55 11 99999-0026",
  email: "contato.demo@example.com",
  connection: {
    id: "ch1",
    name: "CSV Atendimento",
    type: "whatsapp",
    phoneNumber: "+55 11 99999-0055",
  },
  panelFields: [
    {
      fieldId: "cpf",
      label: "CPF",
      value: "123.456.789-00",
      type: "TEXT",
      entityType: "contact",
      entityId: "contact-demo-1",
    },
    {
      fieldId: "rgm",
      label: "RGM",
      value: "2024.001.778",
      type: "TEXT",
      entityType: "deal",
      entityId: "deal-77581",
    },
    {
      fieldId: "curso",
      label: "Curso",
      value: "Administração",
      type: "TEXT",
      entityType: "deal",
      entityId: "deal-77581",
    },
    {
      fieldId: "motivo_dup",
      label: "Obs. perda",
      value: "duplicata_cross_pipeline",
      type: "TEXT",
      entityType: "deal",
      entityId: "deal-93387",
    },
  ],
  deals: [
    {
      id: "deal-77581",
      number: 77581,
      title: "CONTATO DEMO DA SILVA",
      value: 1290,
      stageId: "s2",
      stageName: "ACOLHIMENTO",
      pipelineId: "p1",
      pipelineName: "ACADÊMICO",
      status: "OPEN",
      origin: "WhatsApp",
      funnelSegments: FUNNEL,
      customFields: [
        { fieldId: "rgm", label: "RGM", value: "2024.001.778" },
        { fieldId: "curso", label: "Curso", value: "Administração" },
      ],
    },
    {
      id: "deal-93387",
      number: 93387,
      title: "CONTATO DEMO DA SILVA",
      value: 890,
      stageId: "s9",
      stageName: "PERDIDO",
      pipelineId: "p2",
      pipelineName: "ATENDIMENTO",
      status: "LOST",
      lostReason: "duplicata_cross_pipeline",
      origin: "WhatsApp",
      funnelSegments: FUNNEL.slice(0, 4).map((s, i) =>
        i === 3 ? { ...s, name: "Perdido", color: "#f97316" } : s,
      ),
      customFields: [
        { fieldId: "motivo_dup", label: "Obs. perda", value: "duplicata_cross_pipeline" },
      ],
    },
  ],
}

export default function InboxPreviewShowcasePage() {
  const [activeId, setActiveId] = useState("c1")

  return (
    <div className="flex h-[calc(100dvh-0px)] min-h-0 flex-col bg-[var(--color-bg-subtle)]">
      <header className="shrink-0 border-b border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-3">
        <h1 className="font-display text-[15px] font-bold text-[var(--text-primary)]">
          Preview — Inbox (cards + negócios)
        </h1>
        <p className="text-[12px] text-[var(--text-muted)]">
          Cards compactos à esquerda · com 2+ negócios, lista retraída à direita (toque para expandir)
        </p>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {/* Lista de conversas */}
        <aside className="flex w-[320px] shrink-0 flex-col gap-1.5 overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] p-2">
          <p className="px-1 pb-1 font-display text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Caixa de entrada
          </p>
          {MOCK_CONVERSATIONS.map((c) => (
            <ConversationCard
              key={c.id}
              conversation={{ ...c, active: c.id === activeId }}
              onClick={() => setActiveId(c.id)}
            />
          ))}
        </aside>

        {/* Chat fake */}
        <main className="flex min-w-0 flex-1 flex-col rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-4">
          <p className="mb-3 font-display text-[14px] font-bold text-[var(--text-primary)]">
            {MOCK_CONVERSATIONS.find((c) => c.id === activeId)?.name ?? "Conversa"}
          </p>
          <div className="flex flex-1 flex-col justify-end gap-2">
            <div className="max-w-[70%] self-start rounded-2xl bg-slate-100 px-3 py-2 text-[13px] text-[var(--text-primary)]">
              Boa tarde! Gostaria de saber sobre a matrícula.
            </div>
            <div className="max-w-[70%] self-end rounded-2xl bg-[#2e3b6e] px-3 py-2 text-[13px] text-white">
              Olá! Posso te ajudar com o processo.
            </div>
          </div>
        </main>

        {/* Aside com 2 negócios */}
        <div className="w-[340px] shrink-0 overflow-hidden">
          <ContactAside contact={MOCK_CONTACT} className="h-full" />
        </div>
      </div>
    </div>
  )
}
