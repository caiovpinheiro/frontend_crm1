"use client"

import { useState } from "react"
import {
  IconPalette,
  IconClick,
  IconLayoutCards,
  IconBell,
  IconMessageCircle,
  IconUsers,
  IconSearch,
  IconFilter,
  IconPlus,
  IconDownload,
  IconInbox,
  IconStar,
  IconTrendingUp,
  IconCurrencyDollar,
  IconTargetArrow,
  IconClock,
  IconBolt,
  IconLayoutKanban,
  IconCircleCheck,
  IconCircleX,
  IconActivity,
} from "@tabler/icons-react"

import { AvatarGlass } from "@/components/crm/avatar-glass"
import { BadgeGlass } from "@/components/crm/badge-glass"
import { ButtonGlass } from "@/components/crm/button-glass"
import { CheckboxGlass } from "@/components/crm/checkbox-glass"
import { Chip } from "@/components/crm/chip"
import { ConversationCard, type Conversation } from "@/components/crm/conversation-card"
import { DaySeparator, MessageBubble, type Message } from "@/components/crm/message-bubble"
import { DealCard, type Deal } from "@/components/crm/deal-card"
import { DeltaPill } from "@/components/crm/delta-pill"
import { DropdownGlass } from "@/components/crm/dropdown-glass"
import { EmptyState } from "@/components/crm/empty-state"
import { GlassCard } from "@/components/crm/glass-card"
import { InputGlass } from "@/components/crm/input-glass"
import { PageHeader } from "@/components/crm/page-header"
import { PaginationGlass } from "@/components/crm/pagination-glass"
import { SearchInput } from "@/components/crm/search-input"
import { SessionAlert } from "@/components/crm/session-alert"
import { StagePills } from "@/components/crm/stage-pills"
import { StatCard } from "@/components/crm/stat-card"
import { StatTile } from "@/components/crm/stat-tile"
import { StatusPill } from "@/components/crm/status-pill"
import { SwitchGlass } from "@/components/crm/switch-glass"
import { TabsGlass } from "@/components/crm/tabs-glass"
import { TooltipGlass } from "@/components/crm/tooltip-glass"

// ---------------------------------------------------------------------------
// Helpers de layout
// ---------------------------------------------------------------------------

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="flex flex-col gap-6">
      <div className="flex items-center gap-3 border-b border-[var(--glass-border)] pb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-enterprise-bg)]">
          <Icon size={18} className="text-[var(--brand-primary)]" />
        </span>
        <h2 className="font-display text-[22px] font-bold text-[var(--text-primary)]">{title}</h2>
      </div>
      <div className="flex flex-col gap-8">{children}</div>
    </section>
  )
}

function Block({
  title,
  usage,
  children,
  row = false,
}: {
  title: string
  usage?: string
  children: React.ReactNode
  row?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-display text-[15px] font-bold text-[var(--text-primary)]">{title}</h3>
        {usage && <p className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">{usage}</p>}
      </div>
      <div className={row ? "flex flex-wrap items-center gap-3" : "flex flex-col gap-3"}>
        {children}
      </div>
    </div>
  )
}

function Token({ name, value, swatch }: { name: string; value: string; swatch?: string }) {
  return (
    <div className="flex items-center gap-3">
      {swatch && (
        <span
          className="h-7 w-7 shrink-0 rounded-lg border border-[var(--glass-border)] shadow-sm"
          style={{ background: swatch }}
        />
      )}
      <div className="min-w-0">
        <p className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">{name}</p>
        <p className="font-mono text-[10.5px] text-[var(--text-muted)]">{value}</p>
      </div>
    </div>
  )
}

function GlassSurface({
  label,
  bg,
  blur,
}: {
  label: string
  bg: string
  blur: string
}) {
  return (
    <div
      className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-xl)] border border-[var(--glass-border)] shadow-[var(--glass-shadow)]"
      style={{ background: bg, backdropFilter: `blur(${blur})` }}
    >
      <span className="font-display text-[11px] font-bold text-[var(--text-primary)]">{label}</span>
      <span className="font-mono text-[10px] text-[var(--text-muted)]">{bg.slice(0, 28)}…</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const MOCK_CONV: Conversation = {
  id: "c1",
  name: "Maria Eduarda",
  initials: "ME",
  avatarColor: "pink",
  status: "online",
  time: "8min",
  preview: "Tenho sim! Disponível amanhã.",
  tag: "CLT",
  tags: [{ id: "t1", name: "CLT", color: "#5b6ff5" }],
  assignee: "Ana Flavia",
  unreadCount: 2,
  channel: "WHATSAPP",
  lastMessageType: "text",
}

const MOCK_DEAL: Deal = {
  id: "d1",
  name: "Ana Beatriz Ferreira",
  subtitle: "Plano Anual EAD",
  initials: "AB",
  avatarColor: "teal",
  online: true,
  dealNumber: "#2001",
  date: "há 2h",
  message: { text: "Pode me enviar a proposta?", time: "09:55" },
  timeAgo: "2h",
  tags: [{ label: "VIP", type: "vip" }],
  owner: { initials: "JC", name: "Juliana Costa", avatarColor: "purple" },
}

const MOCK_MESSAGES: Message[] = [
  {
    id: "m1",
    content: "Boa tarde! Tenho interesse na vaga.",
    time: "17:16",
    createdAt: "2026-06-03T17:16:00.000Z",
    type: "incoming",
  },
  {
    id: "m2",
    content: "Você tem quantos anos?",
    time: "18:15",
    createdAt: "2026-06-03T18:15:00.000Z",
    type: "outgoing",
    senderInitials: "AF",
    status: "read",
  },
  {
    id: "m3",
    content: "Bem-vindo(a)! Clique em uma das opções: [Vagas CLT, Vagas Estágio]",
    time: "08:12",
    createdAt: "2026-06-04T08:12:00.000Z",
    type: "outgoing",
    isBot: true,
    senderInitials: "AF",
    status: "delivered",
  },
  {
    id: "m4",
    content: "Vagas CLT",
    time: "08:14",
    createdAt: "2026-06-04T08:14:00.000Z",
    type: "incoming",
  },
  {
    id: "m5",
    content: "Ótimo! Vamos agendar uma entrevista amanhã às 15h?",
    time: "08:20",
    createdAt: "2026-06-04T08:20:00.000Z",
    type: "outgoing",
    senderInitials: "MS",
    status: "sent",
  },
]

const STAGES = [
  { label: "Novo lead", status: "done" as const },
  { label: "Qualificado", status: "done" as const },
  { label: "Proposta", status: "active" as const },
  { label: "Negociação", status: "pending" as const },
  { label: "Ganho", status: "pending" as const },
]

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ShowcaseClient() {
  const [activeTab, setActiveTab] = useState(0)
  const [checked, setChecked] = useState(false)
  const [toggled, setToggled] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [dropdown, setDropdown] = useState<string | null>(null)

  const navItems = [
    { id: "foundations", label: "Foundations" },
    { id: "primitivos", label: "Primitivos" },
    { id: "superficies", label: "Superfícies" },
    { id: "feedback", label: "Feedback" },
    { id: "dominio", label: "Domínio" },
  ]

  return (
    <div className="flex min-h-screen flex-col gap-0 bg-[var(--bg-mesh)]">
      {/* Top header fixo */}
      <header className="sticky top-0 z-50 border-b border-[var(--glass-border)] bg-[var(--glass-bg-base)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">
          <div>
            <h1 className="font-display text-[20px] font-bold text-[var(--text-primary)]">
              Design System v2
            </h1>
            <p className="text-[12px] text-[var(--text-muted)]">
              Showcase de componentes e tokens — fonte de verdade do produto
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BadgeGlass variant="enterprise">DS v2</BadgeGlass>
            <Chip variant="ghost">Ao vivo</Chip>
          </div>
        </div>

        {/* Nav secundária */}
        <nav className="mx-auto flex max-w-7xl gap-0 overflow-x-auto px-8">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="shrink-0 border-b-2 border-transparent px-4 py-2.5 font-display text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] [&.active]:border-[var(--brand-primary)] [&.active]:text-[var(--brand-primary)]"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-8 py-12">

        {/* ================================================================
            1. FOUNDATIONS
        ================================================================ */}
        <Section id="foundations" icon={IconPalette} title="Foundations">

          {/* Paleta de marca */}
          <Block title="Marca" usage="Gradiente primário: brand-primary → brand-secondary. Accent apenas em destaques visuais pontuais.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { name: "--brand-primary", value: "#5b6ff5", label: "Primary" },
                { name: "--brand-primary-light", value: "#7b8df7", label: "Primary Light" },
                { name: "--brand-primary-dark", value: "#3d52e8", label: "Primary Dark" },
                { name: "--brand-secondary", value: "#a78bfa", label: "Secondary" },
                { name: "--brand-accent", value: "#f472b6", label: "Accent" },
              ].map((t) => (
                <div key={t.name} className="flex flex-col gap-2">
                  <div
                    className="h-16 w-full rounded-[var(--radius-lg)] border border-[var(--glass-border)] shadow-sm"
                    style={{ background: t.value }}
                  />
                  <div>
                    <p className="font-display text-[11px] font-bold text-[var(--text-primary)]">{t.label}</p>
                    <p className="font-mono text-[10px] text-[var(--text-muted)]">{t.value}</p>
                    <p className="font-mono text-[9.5px] text-[var(--text-muted)]">{t.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </Block>

          {/* Neutros */}
          <Block title="Neutros / Texto" usage="Hierarquia de legibilidade: primary → secondary → muted. Nunca use cores fora dessa escala para texto.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { name: "--text-primary", value: "#0f172a", label: "Primary" },
                { name: "--text-secondary", value: "#374151", label: "Secondary" },
                { name: "--text-muted", value: "#4b5563", label: "Muted" },
                { name: "--bg-base", value: "#f4f6fb", label: "BG Base" },
              ].map((t) => (
                <div key={t.name} className="flex flex-col gap-2">
                  <div
                    className="h-12 w-full rounded-[var(--radius-lg)] border border-[var(--glass-border)] shadow-sm"
                    style={{ background: t.value }}
                  />
                  <Token name={t.name} value={t.value} />
                </div>
              ))}
            </div>
          </Block>

          {/* Semânticos */}
          <Block title="Semânticos" usage="Sucesso, perigo, alerta e info. Nunca usar diretamente via hex — sempre via token.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { name: "--color-success", value: "#10b981", label: "Sucesso" },
                { name: "--color-danger", value: "#ef4444", label: "Perigo" },
                { name: "--color-warning", value: "#f59e0b", label: "Alerta" },
                { name: "--color-info", value: "#3b82f6", label: "Info" },
              ].map((t) => (
                <div key={t.name} className="flex flex-col gap-2">
                  <div
                    className="h-12 w-full rounded-[var(--radius-lg)] border border-[var(--glass-border)] shadow-sm"
                    style={{ background: t.value }}
                  />
                  <Token name={t.name} value={t.value} />
                </div>
              ))}
            </div>
          </Block>

          {/* Cores de estágio */}
          <Block title="Cores de estágio (Kanban)" usage="Mapeamento visual dos estágios do funil de vendas.">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {[
                { name: "--col-novo", value: "#94a3b8", label: "Novo lead" },
                { name: "--col-quali", value: "#5b6ff5", label: "Qualificado" },
                { name: "--col-proposta", value: "#a78bfa", label: "Proposta" },
                { name: "--col-nego", value: "#f59e0b", label: "Negociação" },
                { name: "--col-fecha", value: "#10b981", label: "Fechamento" },
              ].map((t) => (
                <div key={t.name} className="flex flex-col gap-2">
                  <div
                    className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] shadow-sm"
                    style={{ background: t.value }}
                  />
                  <p className="font-display text-[11px] font-semibold text-[var(--text-primary)]">{t.label}</p>
                  <p className="font-mono text-[9.5px] text-[var(--text-muted)]">{t.value}</p>
                </div>
              ))}
            </div>
          </Block>

          {/* Tipografia */}
          <Block title="Tipografia" usage="font-display (Plus Jakarta Sans) para títulos e dados numéricos. font-sans (Inter) para corpo de texto.">
            <div className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-6">
              <div className="flex flex-col gap-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Display / Heading — Plus Jakarta Sans</p>
                <p className="font-display text-[32px] font-bold leading-tight text-[var(--text-primary)]">Aa — Design System v2</p>
                <p className="font-display text-[20px] font-bold text-[var(--text-primary)]">Heading 2 — Componentes de interface</p>
                <p className="font-display text-[15px] font-bold text-[var(--text-primary)]">Heading 3 — Seções e blocos de conteúdo</p>
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Body — Inter</p>
                <p className="text-[14px] leading-relaxed text-[var(--text-primary)]">Texto corrido de leitura confortável. Ideal para descrições, mensagens e detalhes de contato.</p>
                <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">Texto auxiliar e metadados secundários em tamanho reduzido.</p>
                <p className="font-mono text-[11px] text-[var(--text-muted)]">font-mono — tokens, referências de código e IDs</p>
              </div>
            </div>
          </Block>

          {/* Raios e sombras */}
          <Block title="Raios de borda" usage="Escala crescente de sm (6px) a full (9999px). Use radius-2xl apenas em wrappers maiores como NavRail e DealDetailPanel.">
            <div className="flex flex-wrap items-end gap-4">
              {[
                { name: "--radius-sm", px: "6px", tw: "rounded-[6px]" },
                { name: "--radius-md", px: "8px", tw: "rounded-[8px]" },
                { name: "--radius-lg", px: "12px", tw: "rounded-[12px]" },
                { name: "--radius-xl", px: "16px", tw: "rounded-[16px]" },
                { name: "--radius-2xl", px: "32px", tw: "rounded-[32px]" },
                { name: "--radius-full", px: "∞", tw: "rounded-full" },
              ].map((r) => (
                <div key={r.name} className="flex flex-col items-center gap-2">
                  <div
                    className="h-12 w-12 bg-[var(--brand-primary)] shadow-[var(--glass-shadow)]"
                    style={{ borderRadius: r.px === "∞" ? "9999px" : r.px }}
                  />
                  <p className="font-mono text-[9.5px] text-[var(--text-muted)]">{r.px}</p>
                </div>
              ))}
            </div>
          </Block>
        </Section>

        {/* ================================================================
            2. PRIMITIVOS
        ================================================================ */}
        <Section id="primitivos" icon={IconClick} title="Primitivos">

          {/* Botões */}
          <Block title="ButtonGlass" usage="variant: primary | glass | icon. size: default | sm | icon." row>
            <ButtonGlass variant="primary">Enviar proposta</ButtonGlass>
            <ButtonGlass variant="primary" size="sm">Confirmar</ButtonGlass>
            <ButtonGlass variant="glass">
              <IconFilter size={14} />
              Filtrar
            </ButtonGlass>
            <ButtonGlass variant="glass" size="sm">
              <IconPlus size={13} />
              Adicionar
            </ButtonGlass>
            <ButtonGlass variant="icon" size="icon" aria-label="Download">
              <IconDownload size={16} />
            </ButtonGlass>
            <ButtonGlass variant="primary" disabled>Desabilitado</ButtonGlass>
          </Block>

          {/* Badges */}
          <Block title="BadgeGlass" usage="variant: enterprise | lead | success. Tags de contexto de contato/conversa." row>
            <BadgeGlass variant="enterprise">ENTERPRISE</BadgeGlass>
            <BadgeGlass variant="lead">LEAD</BadgeGlass>
            <BadgeGlass variant="success">ATIVO</BadgeGlass>
          </Block>

          {/* Chips */}
          <Block title="Chip" usage="variant: brand | ghost. Usado em tags de conversa, filtros e categorias rápidas." row>
            <Chip variant="brand">CLT</Chip>
            <Chip variant="brand">Estágio</Chip>
            <Chip variant="ghost">Sem tag</Chip>
            <Chip variant="ghost">Filtro ativo</Chip>
          </Block>

          {/* StatusPill */}
          <Block title="StatusPill" usage="variant: enterprise | lead | success. showDot adiciona o ponto de status." row>
            <StatusPill variant="enterprise">Enterprise</StatusPill>
            <StatusPill variant="lead">Lead</StatusPill>
            <StatusPill variant="success">Ganho</StatusPill>
            <StatusPill variant="success" showDot>Online</StatusPill>
          </Block>

          {/* DeltaPill */}
          <Block title="DeltaPill" usage="value numérico positivo/negativo. suffix padrão %. invert inverte a semântica de cor." row>
            <DeltaPill value={12.4} />
            <DeltaPill value={-3.7} />
            <DeltaPill value={0} />
            <DeltaPill value={28.5} suffix="k" />
            <DeltaPill value={-8.1} size="sm" />
          </Block>

          {/* Avatares */}
          <Block title="AvatarGlass" usage="size: sm | md | lg. color: blue | teal | orange | purple | pink | coral. status: online | offline | none." row>
            {(["blue", "teal", "orange", "purple", "pink", "coral"] as const).map((c) => (
              <div key={c} className="flex flex-col items-center gap-1.5">
                <AvatarGlass initials="AB" color={c} size="md" status={c === "teal" ? "online" : "none"} />
                <span className="font-mono text-[9.5px] text-[var(--text-muted)]">{c}</span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-1.5">
              <AvatarGlass initials="LG" color="purple" size="lg" status="online" />
              <span className="font-mono text-[9.5px] text-[var(--text-muted)]">lg</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <AvatarGlass initials="SM" color="blue" size="sm" />
              <span className="font-mono text-[9.5px] text-[var(--text-muted)]">sm</span>
            </div>
          </Block>

          {/* Inputs */}
          <Block title="InputGlass" usage="Herda HTMLInputElement. Borda translúcida, focus ring brand-primary. Suporta label, placeholder, disabled.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InputGlass placeholder="Nome completo" />
              <InputGlass placeholder="Email" type="email" />
              <InputGlass placeholder="CEP" defaultValue="06243010" />
              <InputGlass placeholder="Desabilitado" disabled />
            </div>
          </Block>

          {/* SearchInput */}
          <Block title="SearchInput" usage="Campo de busca com ícone embutido. Suporta value/onChange controlado e placeholder.">
            <div className="max-w-sm">
              <SearchInput
                value={search}
                onChange={(v) => setSearch(v)}
                placeholder="Buscar conversa, contato..."
              />
            </div>
          </Block>

          {/* Tabs */}
          <Block title="TabsGlass" usage="tabs: string[] | TabItem[]. activeTab é o índice da aba selecionada. onChange recebe o índice clicado.">
            <TabsGlass
              tabs={[
                { label: "Tokens" },
                { label: "Componentes", count: 12 },
                { label: "Exemplos" },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
            />
          </Block>

          {/* Switch e Checkbox */}
          <Block title="SwitchGlass + CheckboxGlass" usage="Controles de estado binário. Ambos usam onChange e suportam disabled. CheckboxGlass também aceita indeterminate." row>
            <div className="flex items-center gap-2">
              <SwitchGlass
                aria-label="Notificações ativas"
                checked={toggled}
                onChange={setToggled}
              />
              <span className="text-[13px] text-[var(--text-primary)]">Notificações ativas</span>
            </div>
            <div className="flex items-center gap-2">
              <SwitchGlass aria-label="Modo silencioso" checked={false} onChange={() => {}} disabled />
              <span className="text-[13px] text-[var(--text-muted)]">Modo silencioso (disabled)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckboxGlass
                aria-label="Aceitar termos"
                checked={checked}
                onChange={setChecked}
              />
              <span className="text-[13px] text-[var(--text-primary)]">Aceitar termos</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckboxGlass aria-label="Indeterminado" indeterminate onChange={() => {}} />
              <span className="text-[13px] text-[var(--text-muted)]">Indeterminado</span>
            </div>
          </Block>

          {/* DropdownGlass */}
          <Block title="DropdownGlass" usage="options: DropdownOption[]. value controlado via onValueChange. Suporta placeholder, menuLabel e gatilho customizado." row>
            <DropdownGlass
              options={[
                { value: "st-1", label: "Novo lead" },
                { value: "st-2", label: "Qualificado" },
                { value: "st-3", label: "Proposta" },
                { value: "st-4", label: "Negociação" },
              ]}
              value={dropdown ?? undefined}
              onValueChange={setDropdown}
              placeholder="Selecionar estágio"
            />
          </Block>

          {/* TooltipGlass */}
          <Block title="TooltipGlass" usage="label: texto ou ReactNode. side: top | right | bottom | left. Usa Radix UI internamente." row>
            <TooltipGlass label="Este é um tooltip informativo" side="top">
              <ButtonGlass variant="glass" size="sm">Passe o mouse</ButtonGlass>
            </TooltipGlass>
            <TooltipGlass label="Deletar conversa — ação irreversível" side="right">
              <ButtonGlass variant="icon" size="icon" aria-label="Info">
                <IconBell size={16} />
              </ButtonGlass>
            </TooltipGlass>
          </Block>

          {/* Paginação */}
          <Block title="PaginationGlass" usage="Badge + entidade · página X de Y à esquerda; Por página (25|50|100) e Anterior/Próxima à direita. showNav={false} esconde a navegação (ex. Logs).">
            <PaginationGlass
              total={287}
              entityLabel="contatos"
              page={page}
              lastPage={12}
              canPrev={page > 1}
              canNext={page < 12}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(12, p + 1))}
              perPage={perPage}
              onPerPageChange={(value) => { setPerPage(value); setPage(1) }}
            />
          </Block>

          {/* StagePills */}
          <Block title="StagePills" usage="stages: Stage[]. Barra de progresso visual horizontal usada no DealDetailPanel e ContactAside.">
            <StagePills stages={STAGES} onStageClick={() => {}} />
          </Block>
        </Section>

        {/* ================================================================
            3. SUPERFICIES DE VIDRO
        ================================================================ */}
        <Section id="superficies" icon={IconLayoutCards} title="Superfícies de vidro">

          <Block title="GlassCard variants" usage="variant: default | base | subtle | overlay | panel | strong. Backdrop-blur cresce com o nível de elevação.">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {(["default", "base", "subtle", "overlay", "panel", "strong"] as const).map((v) => (
                <GlassCard key={v} variant={v} className="flex flex-col items-center justify-center gap-2 p-6">
                  <span className="font-display text-[12px] font-bold text-[var(--text-primary)]">{v}</span>
                </GlassCard>
              ))}
            </div>
          </Block>

          <Block title="Backgrounds de elevação" usage="Quatro níveis de translucidez com backdrop-blur crescente. Definidos em globals-v2.css.">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <GlassSurface label="glass-bg-base" bg="rgba(255,255,255,0.82)" blur="16px" />
              <GlassSurface label="glass-bg-overlay" bg="rgba(255,255,255,0.58)" blur="12px" />
              <GlassSurface label="glass-bg-panel" bg="rgba(255,255,255,0.32)" blur="20px" />
              <GlassSurface label="glass-bg-modal" bg="rgba(255,255,255,0.97)" blur="0px" />
            </div>
          </Block>

          <Block title="Sombras" usage="glass-shadow-sm para inline, glass-shadow para cards, glass-shadow-lg para modais e painéis elevados.">
            <div className="flex flex-wrap gap-6 p-4">
              {[
                { name: "shadow-sm", css: "0 1px 6px rgba(100,130,180,0.10)" },
                { name: "shadow", css: "0 4px 24px rgba(100,130,180,0.18)" },
                { name: "shadow-lg", css: "0 8px 40px rgba(100,130,180,0.22)" },
              ].map((s) => (
                <div
                  key={s.name}
                  className="flex h-20 w-32 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--glass-bg-base)]"
                  style={{ boxShadow: s.css }}
                >
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">{s.name}</span>
                </div>
              ))}
            </div>
          </Block>
        </Section>

        {/* ================================================================
            4. FEEDBACK
        ================================================================ */}
        <Section id="feedback" icon={IconBell} title="Feedback">

          {/* PageHeader */}
          <Block title="PageHeader" usage="icon: ReactNode (passe o elemento JSX já instanciado). actions: slot de botões à direita. center: slot central (busca etc).">
            <PageHeader
              icon={<IconInbox size={20} />}
              title="Caixa de entrada"
              description="Atenda e acompanhe as conversas com seus leads."
              actions={
                <ButtonGlass variant="primary" size="sm">
                  <IconPlus size={14} />
                  Nova conversa
                </ButtonGlass>
              }
            />
          </Block>

          {/* StatCard */}
          <Block title="StatCard" usage="accent: brand | success | warning | danger | purple | teal. Exibe valor principal com delta, ícone e rótulo.">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                accent="brand"
                icon={<IconInbox size={18} />}
                label="Conversas ativas"
                value="1.284"
                delta={12.4}
                caption="vs. semana passada"
              />
              <StatCard
                accent="success"
                icon={<IconStar size={18} />}
                label="Leads ganhos"
                value="312"
                delta={8.7}
                caption="vs. mês passado"
              />
              <StatCard
                accent="warning"
                icon={<IconClock size={18} />}
                label="Aguardando resp."
                value="47"
                delta={-3.2}
                caption="vs. ontem"
              />
              <StatCard
                accent="danger"
                icon={<IconTargetArrow size={18} />}
                label="Leads perdidos"
                value="18"
                delta={-22.5}
                caption="vs. semana passada"
              />
            </div>
          </Block>

          {/* StatTile */}
          <Block title="StatTile" usage="tone: brand | success | neutral | violet. Versão compacta inline para dashboards e barras de resumo.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Receita" value="R$ 128k" icon={<IconCurrencyDollar size={16} />} tone="success" hint="+12% mês" />
              <StatTile label="Oportunidades" value="74" icon={<IconTrendingUp size={16} />} tone="brand" hint="no funil" />
              <StatTile label="Taxa fechamento" value="34%" icon={<IconTargetArrow size={16} />} tone="violet" />
              <StatTile label="Tempo médio resp." value="4m 22s" icon={<IconClock size={16} />} tone="neutral" />
            </div>
          </Block>

          {/* EmptyState */}
          <Block title="EmptyState" usage="icon (Tabler), title, description e action (slot de botão opcional).">
            <div className="max-w-sm">
              <EmptyState
                icon={<IconSearch size={28} />}
                title="Nenhum resultado encontrado"
                description="Tente ajustar os filtros ou buscar por outro termo."
                action={
                  <ButtonGlass variant="glass" size="sm">
                    <IconFilter size={14} />
                    Limpar filtros
                  </ButtonGlass>
                }
              />
            </div>
          </Block>

          {/* SessionAlert */}
          <Block title="SessionAlert" usage="Exibido quando a sessão de WhatsApp está inativa. title/body/actionLabel são customizáveis; onUseTemplate é o callback da ação.">
            <div className="max-w-md">
              <SessionAlert
                onUseTemplate={() => {}}
              />
            </div>
          </Block>
        </Section>

        {/* ================================================================
            5. DOMINIO
        ================================================================ */}
        <Section id="dominio" icon={IconUsers} title="Domínio">

          {/* ConversationCard */}
          <Block title="ConversationCard" usage="Usado na lista da Caixa de Entrada. avatarColor, status, unreadCount, channel e tags são os campos visuais mais relevantes.">
            <div className="max-w-sm overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow)]">
              <ConversationCard conversation={MOCK_CONV} />
              <ConversationCard
                conversation={{
                  ...MOCK_CONV,
                  id: "c2",
                  name: "Alan Martins",
                  initials: "AM",
                  avatarColor: "teal",
                  status: "offline",
                  time: "5min",
                  preview: "Vagas CLT",
                  tag: "ESTÁGIO",
                  tags: [{ id: "t2", name: "ESTÁGIO", color: "#f59e0b" }],
                  urgent: true,
                  unreadCount: 0,
                  channel: "EMAIL",
                }}
              />
              <ConversationCard
                conversation={{
                  ...MOCK_CONV,
                  id: "c3",
                  name: "Andreia Silva",
                  initials: "AS",
                  avatarColor: "orange",
                  status: "none",
                  active: true,
                  time: "agora",
                  preview: "Pode ser para amanhã!",
                  tag: null,
                  tags: [],
                  unreadCount: 5,
                  channel: "WHATSAPP",
                }}
              />
            </div>
          </Block>

          {/* DealCard */}
          <Block title="DealCard" usage="Cartão do kanban de pipeline. Exibe nome, número, produto, data, última mensagem, owner e tags.">
            <div className="w-[280px]">
              <DealCard deal={MOCK_DEAL} />
            </div>
          </Block>

          {/* MessageBubble + DaySeparator */}
          <Block title="MessageBubble + DaySeparator" usage="type: incoming | outgoing. isBot exibe badge de Automação. status exibe ticks WhatsApp. DaySeparator agrupa mensagens por dia.">
            <div className="flex max-w-2xl flex-col gap-3.5 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-6 shadow-[var(--glass-shadow)]">
              {(() => {
                let lastDay: string | null = null
                return MOCK_MESSAGES.map((m) => {
                  const day = m.createdAt
                    ? new Date(m.createdAt).toLocaleDateString("pt-BR")
                    : null
                  const showSep = day && day !== lastDay
                  if (showSep) lastDay = day
                  return (
                    <div key={m.id} className="contents">
                      {showSep && <DaySeparator date={day!} />}
                      <MessageBubble message={m} agentInitials="AF" />
                    </div>
                  )
                })
              })()}
            </div>
          </Block>

          {/* Automações */}
          <Block title="AutomationCard" usage="Exibe nome, status ativo/inativo, gatilho, mini-flow visual e contagem de execuções. Acesse /automations para ver ao vivo.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { name: "Boas-vindas CLT", desc: "Dispara ao entrar no funil Vagas CLT", active: true, runs: 1284, steps: 4, accent: "#5b6ff5" },
                { name: "Follow-up 48h", desc: "Envia mensagem se lead não responder em 48h", active: false, runs: 342, steps: 2, accent: "#a78bfa" },
              ].map((a) => (
                <div key={a.name} className="flex flex-col gap-4 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)]">
                  <span className="h-1 w-full" style={{ background: a.accent }} />
                  <div className="flex flex-col gap-3 px-5 pb-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${a.accent}22` }}>
                          <IconBolt size={15} style={{ color: a.accent }} />
                        </span>
                        <div>
                          <p className="font-display text-[13px] font-bold text-[var(--text-primary)]">{a.name}</p>
                          <p className="text-[11px] text-[var(--text-muted)]">{a.desc}</p>
                        </div>
                      </div>
                      {a.active
                        ? <IconCircleCheck size={18} className="shrink-0 text-[var(--color-success)]" />
                        : <IconCircleX size={18} className="shrink-0 text-[var(--text-muted)]" />}
                    </div>
                    <div className="flex items-center gap-4 rounded-[var(--radius-md)] bg-[var(--glass-bg-overlay)] px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                        <IconActivity size={13} />
                        <span>{a.runs.toLocaleString("pt-BR")} execuções</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                        <IconBolt size={12} />
                        <span>{a.steps} ações</span>
                      </div>
                      <StatusPill variant={a.active ? "success" : "lead"} showDot>
                        {a.active ? "Ativo" : "Inativo"}
                      </StatusPill>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Block>

          {/* Nav Rail reference */}
          <Block title="Nav Rail (referência visual)" usage="Barra lateral de navegação principal. Gradiente de marca no logo EL e no avatar do usuário. Ativa por rota via usePathname.">
            <div className="flex items-start gap-6">
              <div className="flex h-[420px] w-[56px] flex-col items-center justify-between rounded-[var(--radius-2xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] py-4 shadow-[var(--glass-shadow)]">
                {/* Logo */}
                <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)]">
                  <span className="font-display text-[12px] font-bold text-white">EL</span>
                </div>
                {/* Nav items simulados */}
                <div className="flex flex-col items-center gap-2">
                  {[IconLayoutKanban, IconInbox, IconUsers, IconBolt, IconMessageCircle].map((Icon, i) => (
                    <div
                      key={i}
                      className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] transition-all ${i === 1 ? "bg-[var(--brand-primary)] text-white shadow-[var(--glass-shadow-sm)]" : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)]"}`}
                    >
                      <Icon size={18} />
                    </div>
                  ))}
                </div>
                {/* Avatar */}
                <div className="relative flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)] font-display text-[10px] font-bold text-white">
                  MS
                  <span className="absolute bottom-0 right-0 h-[9px] w-[9px] rounded-full border-[1.5px] border-[var(--glass-bg-strong)] bg-[var(--color-online)]" />
                </div>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-4 text-[12.5px] text-[var(--text-muted)]">
                <p className="mb-2 font-display font-bold text-[var(--text-primary)]">Tokens utilizados</p>
                <ul className="flex flex-col gap-1 font-mono">
                  <li>--glass-bg-panel (fundo da rail)</li>
                  <li>--brand-primary → --brand-secondary (logo + avatar)</li>
                  <li>--radius-2xl (wrapper externo)</li>
                  <li>--radius-md (botões nav)</li>
                  <li>--color-online (dot de presença)</li>
                </ul>
              </div>
            </div>
          </Block>
        </Section>

        {/* Rodapé */}
        <footer className="border-t border-[var(--glass-border)] py-8 text-center">
          <p className="font-display text-[12px] font-semibold text-[var(--text-muted)]">
            Design System v2 — Bwipo · Fonte de verdade: <span className="font-mono">src/styles/globals-v2.css</span> + <span className="font-mono">src/components/crm/</span>
          </p>
        </footer>
      </main>
    </div>
  )
}
