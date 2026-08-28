"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  IconArrowLeft,
  IconChevronDown,
  IconDotsVertical,
  IconSearch,
  IconMessageCircle,
  IconChecklist,
  IconNote,
  IconClock,
  IconPaperclip,
  IconMoodSmile,
  IconMicrophone,
  IconSend,
  IconMessagePlus,
  IconPlus,
  IconPencil,
  IconCurrencyReal,
  IconCalendarEvent,
  IconChartFunnel,
  IconLayoutSidebarRightExpand,
} from "@tabler/icons-react"

// ─── Dados mock (fiéis à tela atual) ──────────────────────────────

const DEAL = {
  id: "dl-1",
  name: "Ana Beatriz Costa",
  initials: "AB",
  badge: "ENTERPRISE",
  phone: "+5511988880001",
  email: "ana@acme.com",
  value: "R$ 48.000,00",
  stage: "Novo lead",
  owner: "Marcelo Santos",
  forecast: "14/06/2026",
  source: "Adicionar",
  tag: "Quente",
}

const FUNNEL = [
  { id: "1", name: "Novo lead", color: "#5b6ff5" },
  { id: "2", name: "Qualificado", color: "#a78bfa" },
  { id: "3", name: "Proposta", color: "#f59e0b" },
  { id: "4", name: "Negociação", color: "#10b981" },
  { id: "5", name: "Fechamento", color: "#ec4899" },
  { id: "6", name: "Ganho", color: "#ef4444" },
]

const TABS = [
  { id: "conversa", label: "Conversa", icon: IconMessageCircle, count: 1 },
  { id: "atividades", label: "Tarefas", icon: IconChecklist, count: 3 },
  { id: "notas", label: "Notas", icon: IconNote, count: undefined },
  { id: "timeline", label: "Timeline", icon: IconClock, count: undefined },
] as const

type TabId = (typeof TABS)[number]["id"]

// ─── Primitivos compartilhados ─────────────────────────────────────

function Avatar({ size = 44 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border-2 border-[var(--glass-bg-overlay)] font-display font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        background: "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)",
      }}
    >
      {DEAL.initials}
    </span>
  )
}

function EnterpriseBadge() {
  return (
    <span className="rounded-full bg-[var(--color-enterprise-bg)] px-2 py-0.5 font-display text-[10px] font-bold tracking-wide text-[var(--brand-primary)]">
      {DEAL.badge}
    </span>
  )
}

function IconBtn({
  children,
  active,
}: {
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border transition-colors",
        active
          ? "border-[var(--brand-primary)]/30 bg-[var(--glass-bg-overlay)] text-[var(--brand-primary)]"
          : "border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-muted)] hover:border-[var(--brand-primary)]/30 hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]",
      )}
    >
      {children}
    </button>
  )
}

function EmptyConversation({ compact }: { compact?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]">
        <IconMessagePlus size={28} />
      </div>
      <h3 className="mt-4 font-display text-[15px] font-bold text-[var(--text-primary)]">
        Sem conversa vinculada
      </h3>
      <p className="mt-1.5 max-w-[340px] font-display text-[13px] leading-relaxed text-[var(--text-muted)]">
        Este negócio ainda não tem conversa associada. Abra a Caixa de Entrada e
        vincule um contato para conversar por aqui.
      </p>
      {!compact && (
        <button
          type="button"
          className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full bg-[var(--brand-primary)] px-5 py-2.5 font-display text-[13px] font-bold text-white shadow-[var(--glass-shadow-sm)] transition-opacity hover:opacity-90"
        >
          <IconMessagePlus size={16} />
          Vincular conversa
        </button>
      )}
    </div>
  )
}

function Composer() {
  return (
    <div className="shrink-0 border-t border-[var(--glass-border-subtle)] px-5 py-3.5">
      <div className="flex items-center gap-2.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5">
        <IconPaperclip size={18} className="shrink-0 text-[var(--text-muted)]" />
        <span className="flex-1 truncate font-display text-[13px] italic text-[var(--text-muted)]">
          Sessão expirada. Envie um template…
        </span>
        <IconMoodSmile size={18} className="shrink-0 text-[var(--text-muted)]" />
        <IconMicrophone size={18} className="shrink-0 text-[var(--text-muted)]" />
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-white"
        >
          <IconSend size={15} />
        </button>
      </div>
    </div>
  )
}

function FunnelBar({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="flex gap-1">
      {FUNNEL.map((s, i) => (
        <span
          key={s.id}
          className="h-[6px] flex-1 rounded-full transition-opacity"
          style={{ background: s.color, opacity: i <= activeIndex ? 1 : 0.18 }}
        />
      ))}
    </div>
  )
}

function FieldRow({
  label,
  value,
  accent,
  placeholder,
  editable,
}: {
  label: string
  value?: string
  accent?: "money" | "brand"
  placeholder?: boolean
  editable?: boolean
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--glass-border-subtle)] py-2.5 last:border-0">
      <span className="font-display text-[12.5px] text-[var(--text-muted)]">{label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-display text-[13px] font-bold",
          accent === "money" && "text-[var(--color-online,#10b981)]",
          accent === "brand" && "text-[var(--brand-primary)]",
          placeholder && "italic text-[var(--text-muted)]",
          !accent && !placeholder && "text-[var(--text-primary)]",
        )}
      >
        {value}
        {editable && <IconPencil size={12} className="text-[var(--text-muted)]" />}
      </span>
    </div>
  )
}

function LeadFieldsCard() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4">
      <FieldRow label="Responsável" value={DEAL.owner} accent="brand" editable />
      <FieldRow label="Venda" value={DEAL.value} accent="money" />
      <FieldRow label="Origem" value="Adicionar" placeholder editable />
      <FieldRow label="Previsão" value={DEAL.forecast} />
      <div className="flex items-center justify-between py-2.5">
        <span className="font-display text-[12.5px] text-[var(--text-muted)]">Tags</span>
        <span className="flex items-center gap-1.5">
          <span className="rounded-full border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.1)] px-2 py-0.5 font-display text-[11px] font-bold text-[var(--color-destructive)]">
            {DEAL.tag}
          </span>
          <span className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-[var(--glass-border)] px-2 py-0.5 font-display text-[11px] font-semibold text-[var(--text-muted)]">
            <IconPlus size={10} /> Adicionar
          </span>
        </span>
      </div>
    </div>
  )
}

function ContactCard() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4">
      <FieldRow label="Telefone" value={DEAL.phone} accent="brand" />
      <FieldRow label="Email" value={DEAL.email} />
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-display text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  VARIAÇÃO A — "Conversa em foco"
//  Topbar slim · sidebar compacta à esquerda · abas como segmented
//  control dentro do header do container · estado vazio com CTA.
// ═══════════════════════════════════════════════════════════════════

function VariationA() {
  const [tab, setTab] = useState<TabId>("conversa")
  return (
    <ScreenFrame>
      {/* Topbar */}
      <header className="flex items-center gap-4 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-5 py-3 shadow-[var(--glass-shadow)] backdrop-blur-md">
        <IconBtn>
          <IconArrowLeft size={18} />
        </IconBtn>
        <Avatar size={42} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-[17px] font-bold text-[var(--text-primary)]">
              {DEAL.name}
            </h2>
            <EnterpriseBadge />
          </div>
          <p className="font-display text-[12px] text-[var(--text-muted)]">
            #{DEAL.id} · {DEAL.phone}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <IconBtn>
            <IconSearch size={16} />
          </IconBtn>
          <IconBtn>
            <IconDotsVertical size={16} />
          </IconBtn>
        </div>
      </header>

      {/* Corpo */}
      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr] gap-3.5 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow)] backdrop-blur-md">
          <div className="shrink-0 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] px-4 pb-3.5 pt-4">
            <h3 className="font-display text-[15px] font-bold text-[var(--text-primary)]">
              Lead #{DEAL.id.toUpperCase()}
            </h3>
            <SubLabel>
              <span className="mt-3 block">Funil de vendas</span>
            </SubLabel>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 font-display text-[14px] font-bold text-[var(--text-primary)]"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: FUNNEL[0].color }} />
              {DEAL.stage}
              <IconChevronDown size={13} className="text-[var(--text-muted)]" />
            </button>
            <div className="mt-2.5">
              <FunnelBar activeIndex={0} />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <LeadFieldsCard />
            <div>
              <SubLabel>Dados de contato</SubLabel>
              <ContactCard />
            </div>
          </div>
        </aside>

        {/* Conteúdo */}
        <main className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow)] backdrop-blur-md">
          <header className="flex shrink-0 items-center gap-3 border-b border-[var(--glass-border-subtle)] px-4 py-3">
            <div className="inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-1">
              {TABS.map((t) => {
                const Icon = t.icon
                const isActive = tab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-[12px] font-bold transition-all",
                      isActive
                        ? "bg-[var(--brand-primary)] text-white shadow-[var(--glass-shadow-sm)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                    )}
                  >
                    <Icon size={14} />
                    {t.label}
                    {t.count !== undefined && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[10px]",
                          isActive ? "bg-white/25" : "bg-[var(--glass-bg-overlay)]",
                        )}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </header>
          <EmptyConversation />
          <Composer />
        </main>
      </div>
    </ScreenFrame>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  VARIAÇÃO B — "Workspace com métricas"
//  Topbar exibe métricas-chave (valor, previsão, etapa) · conversa
//  dominante à esquerda · painel do lead à direita · abas underline.
// ═══════════════════════════════════════════════════════════════════

function MetricChip({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3.5 py-2">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ background: accent ? `${accent}1f` : "var(--glass-bg-overlay)", color: accent ?? "var(--text-muted)" }}
      >
        <Icon size={16} />
      </span>
      <div>
        <p className="font-display text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </p>
        <p className="font-display text-[13px] font-bold text-[var(--text-primary)]">{value}</p>
      </div>
    </div>
  )
}

function VariationB() {
  const [tab, setTab] = useState<TabId>("conversa")
  return (
    <ScreenFrame>
      {/* Topbar com métricas */}
      <header className="flex items-center gap-4 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-5 py-3 shadow-[var(--glass-shadow)] backdrop-blur-md">
        <IconBtn>
          <IconArrowLeft size={18} />
        </IconBtn>
        <Avatar size={42} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-[17px] font-bold text-[var(--text-primary)]">
              {DEAL.name}
            </h2>
            <EnterpriseBadge />
          </div>
          <p className="font-display text-[12px] text-[var(--text-muted)]">
            #{DEAL.id} · {DEAL.phone}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <MetricChip icon={IconCurrencyReal} label="Venda" value={DEAL.value} accent="#10b981" />
          <MetricChip icon={IconCalendarEvent} label="Previsão" value={DEAL.forecast} accent="#5b6ff5" />
          <IconBtn>
            <IconDotsVertical size={16} />
          </IconBtn>
        </div>
      </header>

      {/* Corpo: conversa dominante + painel direita */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px] gap-3.5 overflow-hidden">
        {/* Conversa */}
        <main className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow)] backdrop-blur-md">
          <header className="flex shrink-0 items-center gap-1 border-b border-[var(--glass-border-subtle)] px-4">
            {TABS.map((t) => {
              const Icon = t.icon
              const isActive = tab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 px-3.5 py-3.5 font-display text-[12px] font-bold tracking-wide transition-all",
                    isActive
                      ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                  )}
                >
                  <Icon size={14} />
                  {t.label.toUpperCase()}
                  {t.count !== undefined && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px]",
                        isActive
                          ? "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]"
                          : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
                      )}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              )
            })}
          </header>
          <EmptyConversation />
          <Composer />
        </main>

        {/* Painel do lead à direita */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow)] backdrop-blur-md">
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] px-4 py-3">
            <IconLayoutSidebarRightExpand size={16} className="text-[var(--text-muted)]" />
            <h3 className="font-display text-[13px] font-bold text-[var(--text-primary)]">
              Detalhes do negócio
            </h3>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-display text-[13px] font-bold text-[var(--text-primary)]">
                  <span className="h-2 w-2 rounded-full" style={{ background: FUNNEL[0].color }} />
                  {DEAL.stage}
                </span>
                <IconChevronDown size={13} className="text-[var(--text-muted)]" />
              </div>
              <div className="mt-3">
                <FunnelBar activeIndex={0} />
              </div>
            </div>
            <LeadFieldsCard />
            <div>
              <SubLabel>Dados de contato</SubLabel>
              <ContactCard />
            </div>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  VARIAÇÃO C — "Cockpit denso"
//  Rail vertical de abas (ícones) · funil em destaque no topo do
//  conteúdo · 3 zonas: rail · conversa · painel lead compacto.
// ═══════════════════════════════════════════════════════════════════

function VariationC() {
  const [tab, setTab] = useState<TabId>("conversa")
  return (
    <ScreenFrame>
      {/* Topbar */}
      <header className="flex items-center gap-4 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-5 py-3 shadow-[var(--glass-shadow)] backdrop-blur-md">
        <IconBtn>
          <IconArrowLeft size={18} />
        </IconBtn>
        <Avatar size={42} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-[17px] font-bold text-[var(--text-primary)]">
              {DEAL.name}
            </h2>
            <EnterpriseBadge />
          </div>
          <p className="font-display text-[12px] text-[var(--text-muted)]">
            #{DEAL.id} · {DEAL.phone}
          </p>
        </div>
        {/* Funil em destaque na topbar */}
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-1.5 lg:flex">
            <IconChartFunnel size={15} className="text-[var(--brand-primary)]" />
            <span className="font-display text-[12px] font-bold text-[var(--text-primary)]">
              {DEAL.stage}
            </span>
            <span className="h-3 w-px bg-[var(--glass-border)]" />
            <span className="font-display text-[12px] font-bold text-[var(--color-online,#10b981)]">
              {DEAL.value}
            </span>
          </div>
          <IconBtn>
            <IconSearch size={16} />
          </IconBtn>
          <IconBtn>
            <IconDotsVertical size={16} />
          </IconBtn>
        </div>
      </header>

      {/* Corpo: rail · conversa · painel */}
      <div className="grid min-h-0 flex-1 grid-cols-[64px_1fr_280px] gap-3.5 overflow-hidden">
        {/* Rail vertical de abas */}
        <nav className="flex min-h-0 flex-col items-center gap-1.5 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] py-3 shadow-[var(--glass-shadow)] backdrop-blur-md">
          {TABS.map((t) => {
            const Icon = t.icon
            const isActive = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                title={t.label}
                className={cn(
                  "relative flex h-12 w-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--radius-lg)] transition-all",
                  isActive
                    ? "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-secondary)]",
                )}
              >
                <Icon size={18} />
                <span className="font-display text-[8px] font-bold uppercase tracking-wide">
                  {t.label.slice(0, 4)}
                </span>
                {t.count !== undefined && (
                  <span className="absolute right-1.5 top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 font-display text-[9px] font-bold text-white">
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Conversa */}
        <main className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow)] backdrop-blur-md">
          <header className="shrink-0 border-b border-[var(--glass-border-subtle)] px-5 py-3">
            <div className="flex items-center gap-2">
              <IconMessageCircle size={16} className="text-[var(--brand-primary)]" />
              <h3 className="font-display text-[14px] font-bold text-[var(--text-primary)]">
                Conversa
              </h3>
            </div>
          </header>
          <EmptyConversation />
          <Composer />
        </main>

        {/* Painel lead compacto */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow)] backdrop-blur-md">
          <div className="shrink-0 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] px-4 py-3">
            <h3 className="font-display text-[13px] font-bold text-[var(--text-primary)]">
              Lead #{DEAL.id.toUpperCase()}
            </h3>
            <div className="mt-2.5">
              <FunnelBar activeIndex={0} />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <LeadFieldsCard />
            <div>
              <SubLabel>Dados de contato</SubLabel>
              <ContactCard />
            </div>
          </div>
        </aside>
      </div>
    </ScreenFrame>
  )
}

// ─── Moldura de tela compartilhada ─────────────────────────────────

function ScreenFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-[680px] flex-col gap-3.5 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] p-3.5 shadow-[var(--glass-shadow)]"
      style={{
        background:
          "linear-gradient(135deg, var(--bg-base) 0%, var(--bg-mesh-1) 40%, var(--bg-mesh-2) 70%, var(--bg-base) 100%)",
      }}
    >
      {children}
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────

const VARIATIONS = [
  {
    id: "A" as const,
    label: "Conversa em foco",
    description:
      "Topbar enxuta, sidebar compacta à esquerda e abas como segmented control no header do container. Estado vazio com CTA de ação.",
    render: () => <VariationA />,
  },
  {
    id: "B" as const,
    label: "Workspace com métricas",
    description:
      "Métricas-chave (venda e previsão) na topbar, conversa dominante à esquerda e painel do lead à direita com abas underline.",
    render: () => <VariationB />,
  },
  {
    id: "C" as const,
    label: "Cockpit denso",
    description:
      "Rail vertical de abas com ícones, funil + valor em destaque na topbar e três zonas: navegação, conversa e painel compacto.",
    render: () => <VariationC />,
  },
]

export function DealDetailVariations() {
  const [selected, setSelected] = useState<"A" | "B" | "C">("A")
  const current = VARIATIONS.find((v) => v.id === selected)!

  return (
    <div className="min-h-screen p-6 lg:p-10">
      <div className="mx-auto max-w-[1500px]">
        {/* Título */}
        <div className="mb-6">
          <h1 className="font-display text-[28px] font-bold tracking-tight text-[var(--text-primary)]">
            Detalhe do Negócio — 3 Variações
          </h1>
          <p className="mt-1 font-display text-[14px] text-[var(--text-muted)]">
            Propostas de refatoração da tela atual dentro do DS v2 (glassmorphism + tokens).
          </p>
        </div>

        {/* Seletor de variação */}
        <div className="mb-5 flex flex-wrap gap-2.5">
          {VARIATIONS.map((v) => {
            const isActive = selected === v.id
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelected(v.id)}
                className={cn(
                  "flex max-w-[360px] items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-all",
                  isActive
                    ? "border-[var(--brand-primary)] bg-[var(--glass-bg-strong)] shadow-[var(--glass-shadow)]"
                    : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] hover:border-[var(--brand-primary)]/40",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-[12px] font-bold",
                    isActive
                      ? "bg-[var(--brand-primary)] text-white"
                      : "bg-[var(--glass-bg)] text-[var(--text-muted)]",
                  )}
                >
                  {v.id}
                </span>
                <div>
                  <p className="font-display text-[13px] font-bold text-[var(--text-primary)]">
                    {v.label}
                  </p>
                  <p className="mt-0.5 font-display text-[11.5px] leading-snug text-[var(--text-muted)]">
                    {v.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Preview da variação selecionada */}
        <div key={current.id}>{current.render()}</div>

        {/* Nota */}
        <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-5 py-4 backdrop-blur-md">
          <p className="font-display text-[12px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Nota
          </p>
          <p className="mt-1 font-display text-[13px] text-[var(--text-secondary)]">
            Todas as variações usam exclusivamente tokens do DS v2 e dados mock. Nenhuma
            alteração foi feita na tela real do detalhe do negócio — esta é uma rota de
            showcase para escolha da direção.
          </p>
        </div>
      </div>
    </div>
  )
}
