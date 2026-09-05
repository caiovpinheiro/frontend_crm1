"use client"

import { useEffect, useMemo, useState } from "react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { cn } from "@/lib/utils"
import { Row } from "@/components/crm/aside-row"
import { TooltipGlass } from "@/components/crm/tooltip-glass"
import { RequirePermission } from "@/components/auth/require-permission"
import { ChannelTypeIcon } from "@/components/inbox/channel-type-icon"
import { useCan } from "@/hooks/use-my-permissions"
import {
  IconBriefcase,
  IconBrandWhatsapp,
  IconCalendarEvent,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconGripVertical,
  IconId,
  IconLayoutList,
  IconMail,
  IconMapPin,
  IconPackage,
  IconPencil,
  IconPhone,
  IconSparkles,
  IconTag,
  IconSettings,
  IconUser,
  IconX,
  IconAffiliate,
  IconWorld,
} from "@tabler/icons-react"
import { useAsideViewMode, type AsideViewMode } from "@/hooks/use-aside-view-mode"
import {
  channelTypeLabel,
  formatConnectionShort,
  formatConnectionLabel,
} from "@/lib/connection-label"
import { resolveHighlight, SEVERITY_COLORS, type HighlightSeverity } from "@/lib/highlight"
import { InlineFieldEditor } from "@/components/crm/fields/inline-field-editor"
import { InlineNativeEditor } from "@/components/crm/fields/inline-native-editor"
import { useContactSources } from "@/hooks/use-contact-sources"
import { TrackedInfoSection } from "@/components/crm/tracked-info-section"
import { formatPhoneDisplay } from "@/lib/phone"
import { DealProductsSection } from "@/components/pipeline/deal-detail/sidebar"
import { useSectionOrder } from "@/hooks/use-section-order"
import { useFieldLayout } from "@/hooks/use-field-layout"
import { useIdleEnabled } from "@/hooks/use-idle-enabled"
import { resolveCustomFieldGroups, type CustomFieldDef } from "@/lib/field-layout"
import { CustomFieldGroupBlock } from "@/components/crm/fields/custom-field-group-block"

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface ContactDetails {
  name: string
  contactId: string
  /** Número sequencial do contato por organização (1, 2, 3…). */
  contactNumber?: number | null
  /**
   * Conexão (Channel) por onde o contato está conversando — qual conta do
   * canal (ex.: qual WhatsApp da empresa). Exibida na seção de contato para
   * distinguir quando a pessoa fala por fontes diferentes.
   */
  connection?: {
    id: string
    name: string
    type?: string | null
    phoneNumber?: string | null
  } | null
  assignee?: string
  statusBadge?: { variant: "lead" | "enterprise" | "success"; label: string }
  stageSegments?: number
  stageActiveIndex?: number
  course?: string
  formation?: string
  entry?: string
  phone?: string
  email?: string
  /** @ do WhatsApp (Contact.whatsappUsername), quando disponível. */
  whatsappUsername?: string
  /** Origem do lead (Contact.source). */
  source?: string | null
  /** UTM / ads — card Informação rastreada. */
  tracked?: import("@/components/crm/tracked-info-section").TrackedAttribution
  cpf?: string
  rg?: string
  cep?: string
  addressNumber?: string
  birthDate?: string
  note?: string
  deals?: {
    id: string
    /** N\u00famero sequencial do neg\u00f3cio por organiza\u00e7\u00e3o (1, 2, 3...). */
    number?: number | null
    title: string
    value: number | null
    stageName?: string | null
    stageId?: string | null
    pipelineId?: string | null
    pipelineName?: string | null
    productName?: string | null
    status?: string | null
    lostReason?: string | null
    origin?: string | null
    funnelSegments?: { id: string; name: string; color: string; position: number }[]
    stageDropdownSlot?: React.ReactNode
    /** Slot para renderizar o seletor de responsável abaixo das info do deal. */
    assigneeSlot?: React.ReactNode
    /** Slot para renderizar as tags do negócio (add/remove). */
    dealTagsNode?: React.ReactNode
    customFields?: { fieldId: string; label: string; value: string | null }[]
  }[]
  financialStatus?: "success" | "lead" | "enterprise"
  financialLabel?: string
  product?: string
  origin?: string
  createdAt?: string
  tag?: string
  initials?: string
  avatarColor?: string
  status?: string
  activities?: { text: string; time: string; color?: string }[]
  panelFields?: {
    fieldId: string
    label: string
    value: string
    type: string
    options?: string[]
    entityType?: "contact" | "deal"
    entityId?: string
    highlightRules?: unknown[] | null
    /** Highlight já resolvido pelo backend — use este para não re-resolver. */
    highlight?: { severity: string; label: string } | null
  }[]
}

interface ContactAsideProps {
  contact: ContactDetails
  className?: string
  headerActionsNode?: React.ReactNode
  /** Tags da CONVERSA atual (Conversation.tags). Renderiza com label
   *  "Tags da conversa" para diferenciar de Contact.tags. */
  tagsNode?: React.ReactNode
  /** DD9/IB7: Tags do CONTATO (Contact.tags). Renderiza num bloco
   *  separado abaixo de tagsNode, com label "Tags do contato". Quando
   *  ausente, o bloco nao aparece (compat com clientes legados). */
  contactTagsNode?: React.ReactNode
  collapsed?: boolean
  onToggleCollapse?: () => void
  /** Slot legado — mantido por compatibilidade. Preferir os dois abaixo. */
  contactEditNode?: React.ReactNode
  /**
   * Painel de configuração de campos de **contato** (FieldConfigPanel entity="contact").
   * Quando fornecido, exibe ⚙ engrenagem na seção "Campos de Contato".
   */
  contactFieldConfigSlot?: React.ReactNode
  /**
   * Painel de configuração de campos de **negócio** (FieldConfigPanel entity="deal").
   * Quando fornecido, exibe ⚙ engrenagem na seção "Campos de Negócio".
   */
  dealFieldConfigSlot?: React.ReactNode
  /** @deprecated Use contactFieldConfigSlot + dealFieldConfigSlot */
  fieldConfigSlot?: React.ReactNode
}

// ─────────────────────────────────────────────────────────────────
// Section ordering
// ─────────────────────────────────────────────────────────────────

type AsideSection = "negocios" | "contato" | "produtos" | "campos-negocio"
const ASIDE_DEFAULT_ORDER: AsideSection[] = [
  "negocios",
  "contato",
  "produtos",
  "campos-negocio",
]
// Bump da versao pra `v4` porque adicionamos a secao `produtos` na
// ordem default. Sem novo storage key, usuarios antigos ficariam com
// [negocios, contato, campos-negocio] persistido em localStorage e
// a nova secao nunca apareceria (`useSectionOrder` mantem o valor salvo).
const ASIDE_STORAGE_KEY = "crm:contact-aside:section-order-v4"

/** Container branco unificado de cada seção do aside — o título
 *  (SectionHeader) e o conteúdo ficam DENTRO do mesmo card. Antes o
 *  título flutuava sobre o fundo do painel, acima do card. */
const SECTION_CARD_CLASS =
  "mx-2 mb-2 min-w-0 max-w-full rounded-[var(--radius-xl)] border border-slate-100 bg-white p-2.5 shadow-sm"

// ── Abas Perfil / Produto ─────────────────────────────────────────
// O hero do negócio (secao `negocios`) fica FIXO no topo. As demais
// secoes sao distribuidas em duas abas: "Perfil" (dados de contato +
// campos de negocio) e "Produto" (produtos). O drag-and-drop continua
// funcionando DENTRO de cada aba (ex.: reordenar contato/campos).
type AsideTab = "perfil" | "produto"
const SECTION_TAB: Partial<Record<AsideSection, AsideTab>> = {
  contato: "perfil",
  "campos-negocio": "perfil",
  produtos: "produto",
}
const ASIDE_TAB_ITEMS = [
  {
    value: "perfil",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <IconUser size={13} />
        Perfil
      </span>
    ),
  },
  {
    value: "produto",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <IconPackage size={13} />
        Produto
      </span>
    ),
  },
] as const

// ─────────────────────────────────────────────────────────────────
// Constants / helpers
// ─────────────────────────────────────────────────────────────────

const PLACEHOLDER = "—"
const isFilled = (v: string | undefined | null): v is string => !!v && v !== PLACEHOLDER
const formatCurrency = (v: number) =>
  v ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : PLACEHOLDER

// ─────────────────────────────────────────────────────────────────
// SectionHeader — cabeçalho de seção com alça + ações
// ─────────────────────────────────────────────────────────────────

function SectionHeader({
  children,
  meta,
  dragHandleProps,
  actions,
  icon,
  open = true,
  onToggle,
}: {
  children: React.ReactNode
  /** Sufixo ao lado do título (ex.: #123 do contato/negócio). */
  meta?: React.ReactNode
  dragHandleProps?: React.HTMLAttributes<HTMLElement>
  actions?: React.ReactNode
  icon?: React.ReactNode
  open?: boolean
  onToggle?: () => void
}) {
  return (
    <div className="mb-1 mt-2 flex items-center gap-1">
      <span
        {...dragHandleProps}
        className="flex cursor-grab items-center rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity group-hover/section:opacity-60 hover:opacity-100 active:cursor-grabbing"
        aria-label="Arrastar seção"
      >
        <IconGripVertical size={12} />
      </span>
      <button
        type="button"
        onClick={onToggle}
        disabled={!onToggle}
        className={cn(
          // Header padronizado (ref. Stitch): ícone 16px + título bold 14px
          // + #meta opacity-60 + chevron. Sem caixa alta, sem tracking largo.
          "flex items-center gap-2 rounded font-display text-sm font-bold text-[var(--text-primary)]",
          onToggle && "cursor-pointer hover:opacity-80",
        )}
      >
        {icon && <span className="flex shrink-0 items-center text-slate-600">{icon}</span>}
        <span className="flex min-w-0 items-baseline gap-1.5">
          {children}
          {meta}
        </span>
        {onToggle && (
          <IconChevronDown
            size={12}
            className={cn("transition-transform", !open && "-rotate-90")}
          />
        )}
      </button>
      {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
    </div>
  )
}

/** Botão de ação no cabeçalho (lápis ou engrenagem) */
function HeaderBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <TooltipGlass label={label} side="left">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] transition-colors",
          active
            ? "bg-[var(--brand-primary)] text-white"
            : "text-slate-400 hover:text-blue-500",
        )}
      >
        {children}
      </button>
    </TooltipGlass>
  )
}

// ─────────────────────────────────────────────────────────────────
// Row — extraído para aside-row.tsx (compartilhado com o aside do
// Deal). Import no topo do arquivo; visual idêntico ao original.
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// ViewModeToggle — alterna entre visão foco (premium) e compacta
// ─────────────────────────────────────────────────────────────────
function ViewModeToggle({ mode, onChange }: { mode: AsideViewMode; onChange: (m: AsideViewMode) => void }) {
  return (
    <div className="flex shrink-0 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-0.5">
      <TooltipGlass label="Visão foco" side="top">
        <button
          type="button"
          onClick={() => onChange("focus")}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] transition-colors",
            mode === "focus"
              ? "bg-[var(--brand-primary)] text-white shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
          )}
          aria-label="Visão foco"
        >
          <IconSparkles size={12} />
        </button>
      </TooltipGlass>
      <TooltipGlass label="Visão compacta" side="top">
        <button
          type="button"
          onClick={() => onChange("compact")}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] transition-colors",
            mode === "compact"
              ? "bg-[var(--brand-primary)] text-white shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
          )}
          aria-label="Visão compacta"
        >
          <IconLayoutList size={12} />
        </button>
      </TooltipGlass>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// DealInline
// ─────────────────────────────────────────────────────────────────

function DealInline({
  deal,
  course,
  contact,
  collapsed = false,
  onToggle,
}: {
  deal: NonNullable<ContactDetails["deals"]>[number]
  course: string | undefined
  contact: ContactDetails
  /** Com 2+ negócios: card compacto até o atendente expandir. */
  collapsed?: boolean
  onToggle?: () => void
}) {
  const fields = deal.customFields ?? []
  const segments = deal.funnelSegments
  const sortedSegments = segments
    ? [...segments].sort((a, b) => a.position - b.position)
    : null
  const currentSegIdx = sortedSegments
    ? sortedSegments.findIndex((s) => s.id === deal.stageId)
    : -1
  const stageLabel =
    deal.stageName ??
    sortedSegments?.find((s) => s.id === deal.stageId)?.name ??
    "Sem estágio"
  const productName = deal.productName ?? course ?? null
  const status = deal.status ?? null
  const isLost = status === "LOST"
  const isWon = status === "WON"
  const lostReason = isLost ? (deal.lostReason ?? "").trim() : ""

  // Progresso do funil: usa currentSegIdx (0-based) + total de segmentos.
  const totalStages = sortedSegments?.length ?? 0
  const currentStage = currentSegIdx >= 0 ? currentSegIdx + 1 : 0
  // Cor da etapa atual — usada no anel de progresso e no dot da pill
  // (fallback laranja quando a etapa não tem cor cadastrada).
  const currentStageColor =
    (currentSegIdx >= 0 ? sortedSegments?.[currentSegIdx]?.color : null) || "#f59e0b"

  if (collapsed) {
    return (
      <div className="px-2 pt-1.5 pb-0">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-[#2e3b6e] px-3 py-2 text-left text-white shadow-[var(--glass-shadow-sm)] transition-colors hover:bg-[#35457a]"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: currentStageColor }}
          />
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
            {deal.number != null && (
              <span className="mr-1.5 font-mono text-[11px] font-normal text-slate-300">
                #{deal.number}
              </span>
            )}
            <span className="uppercase tracking-wide">{stageLabel}</span>
            {deal.pipelineName && (
              <span className="ml-1.5 font-normal normal-case text-slate-400">
                · {deal.pipelineName}
              </span>
            )}
          </span>
          {isLost && (
            <span className="shrink-0 rounded-full bg-orange-500/20 px-1.5 py-px text-[9px] font-bold uppercase text-orange-200">
              Perdido
            </span>
          )}
          {isWon && (
            <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-px text-[9px] font-bold uppercase text-emerald-200">
              Ganho
            </span>
          )}
          <IconChevronDown size={14} className="shrink-0 text-slate-300" />
        </button>
      </div>
    )
  }

  return (
    <div className="px-2 pt-2 pb-0">
      {/* ── Hero header (ref. Stitch): card escuro #2e3b6e como CARD interno,
          dentro do padding do container (não mais edge-to-edge). Mesma forma
          dos cards de contato/negócio: rounded-xl + borda sutil + shadow. ── */}
      <header className="relative isolate mb-2 rounded-xl border border-white/10 bg-[#2e3b6e] px-3 pb-2.5 pt-2.5 text-white shadow-[var(--glass-shadow-sm)]">
        {/* Linha topo: título (até 2 linhas, sem truncar o nome) + pill de etapa */}
        <div className="relative mb-2 flex items-start justify-between gap-2">
          <h1 className="min-w-0 text-[13px] font-bold leading-snug text-white">
            <span className="line-clamp-2">
              {deal.title}
              {deal.number != null && (
                <span className="ml-1.5 whitespace-nowrap text-[11px] font-normal text-slate-400">
                  #{deal.number}
                </span>
              )}
            </span>
          </h1>

          {/* Pill de etapa REMOVIDA do topo (jul/26): a fase virou o destaque
              da linha base e é ela quem abre o dropdown de troca de estágio.
              Com multi-deal, botão de recolher fica no canto. */}
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              className="shrink-0 rounded-md p-0.5 text-slate-300 hover:bg-white/10 hover:text-white"
              aria-label="Recolher negócio"
              title="Recolher"
            >
              <IconChevronDown size={14} className="rotate-180" />
            </button>
          )}
        </div>

        {/* Linha base: ETAPA em destaque + funil (secundário) + responsável.
            Anel de progresso removido (jul/26) — a posição no funil agora é
            comunicada apenas pela barra segmentada logo abaixo. Etapa e funil
            trocaram de lugar: a etapa atual passou a ser o dado em destaque. */}
        <div className="relative mb-2.5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {deal.stageDropdownSlot ? (
              /* Fase em destaque = gatilho do dropdown. O slot já renderiza
                 dot + nome + chevron; aqui só ampliamos pro tamanho do título. */
              <div className="min-w-0 [&_button]:!max-w-full [&_button]:!gap-2 [&_button]:!text-[17px] [&_button]:!font-bold [&_button]:!uppercase [&_button]:!leading-tight [&_button]:!tracking-tight [&_button]:!text-white [&_button:hover]:!text-white [&_button:hover]:!opacity-90 [&_svg]:!size-4">
                {deal.stageDropdownSlot}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: currentStageColor }}
                  aria-hidden
                />
                <p className="truncate text-[17px] font-bold uppercase leading-tight tracking-tight text-white">
                  {stageLabel}
                </p>
              </div>
            )}
            <p className="truncate text-xs text-slate-300">
              {deal.pipelineName ?? "Funil de vendas"}
              {totalStages > 0 ? ` · Etapa ${currentStage} de ${totalStages}` : ""}
            </p>
          </div>
          {deal.assigneeSlot && (
            <div className="shrink-0 [&_span]:!border-transparent [&_span]:!bg-white [&_span]:!text-[#2e3b6e] [&_span]:shadow-sm">
              {deal.assigneeSlot}
            </div>
          )}
        </div>

        {/* Barra de etapas segmentada — 2px, ativo na cor da etapa, inativo white/20 */}
        {sortedSegments && sortedSegments.length > 0 && (
          <div className="relative mb-2 flex items-center gap-1">
            {sortedSegments.map((seg, i) => (
              <TooltipGlass key={seg.id} label={seg.name} side="top">
                <span
                  className="h-[2px] flex-1 rounded-full transition-colors"
                  style={{
                    backgroundColor:
                      i <= currentSegIdx ? seg.color || "#f59e0b" : "rgba(255,255,255,0.2)",
                  }}
                />
              </TooltipGlass>
            ))}
          </div>
        )}

        {/* Grid 2 colunas de infos rápidas — Origem / Canal / Tags.
            Coluna do rótulo no tamanho do texto (`auto`): `grid-cols-2`
            dava metade da largura aos valores e espremia as tags em "e…". */}
        {(deal.origin || contact.connection || deal.dealTagsNode !== undefined) && (
          <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-t border-white/10 pt-2 text-[11px]">
            {deal.origin && (
              <>
                <span className="text-slate-400">Origem</span>
                <span className="truncate text-right font-medium">{deal.origin}</span>
              </>
            )}
            {contact.connection && (
              <>
                <span className="text-slate-400">Canal</span>
                <span className="truncate text-right font-medium">
                  {formatConnectionShort(contact.connection)}
                </span>
              </>
            )}
            {deal.dealTagsNode !== undefined && (
              <>
                <span className="text-slate-400">Tags</span>
                {/* Uma linha só: os chips truncam quando falta espaço e o
                    botão "+" fica ancorado no canto direito pelo próprio
                    DealTagsTray (w-full + ml-auto). */}
                <span className="flex w-full min-w-0 flex-nowrap items-center justify-start gap-1 overflow-hidden [&_.tag-chip]:!border-white/20 [&_.tag-chip]:!bg-white/15 [&_.tag-chip]:!text-white">
                  {deal.dealTagsNode}
                </span>
              </>
            )}
          </div>
        )}
      </header>

      {isLost && lostReason && (
        <div className="mt-2 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-danger,#dc2626)_24%,transparent)] bg-[color-mix(in_srgb,var(--color-danger,#dc2626)_6%,transparent)] px-3 py-2">
          <p className="mb-0.5 font-display text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-danger,#dc2626)]">
            Motivo da perda
          </p>
          <p className="font-display text-[12px] font-semibold text-[var(--text-primary)]">
            {lostReason}
          </p>
        </div>
      )}

      {/* IB5 do questionario: card legado "Produto" (`deal.productName`)
          removido. Antes existia em paralelo com a `DealProductsSection`
          (abaixo) e ao adicionar um produto novo, este card legado nao
          atualizava — o item aparecia so na secao moderna, dando a
          impressao de "produto duplicado abaixo do card". A fonte agora
          e unica: DealProductsSection com line items reais da API
          /api/deals/:id/products. */}

      {fields.length > 0 && (
        <div className="mt-2 mb-2">
          <div className="mb-1 flex items-center gap-1.5 font-display text-[12px] font-bold text-[var(--text-primary)]">
            <IconBriefcase size={12} className="text-[var(--brand-primary)]" />
            <span className="flex items-baseline gap-1.5">
              Negócio
              {deal.number != null && (
                <span className="font-mono text-[10px] font-normal text-[var(--text-muted)]">#{deal.number}</span>
              )}
            </span>
          </div>
          {/* Layout responsivo: grid 2-col; valores muito longos (>18 chars ou com espaco)
              ganham col-span-2 (ocupam linha inteira sozinhos) — layout compacto sem
              truncar e sem espaco vazio esquisito. */}
          <div className="grid min-w-0 grid-cols-2 gap-1.5">
            {fields.map((f) => {
              const isEmpty = !f.value || f.value === PLACEHOLDER
              const isLong = !isEmpty && (f.value!.length > 18 || f.value!.includes("@"))
              return (
                <div
                  key={f.fieldId}
                  className={cn(
                    "flex min-w-0 max-w-full flex-col items-start gap-0.5 rounded-xl border border-slate-100 bg-slate-50 p-2",
                    isLong && "col-span-2",
                  )}
                >
                  <span className="text-[11px] font-medium text-slate-500">
                    {f.label}
                  </span>
                  {isEmpty ? (
                    <span className="italic text-[12px] text-slate-400">
                      + Adicionar
                    </span>
                  ) : (
                    <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] font-display text-[12px] font-bold text-[var(--text-primary)]">
                      {f.value}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Produtos removido daqui — vira secao independente arrastavel
          (`produtos`) renderizada no loop de secoes da ContactAside.
          Assim o operador pode mover Produtos pra antes/depois dos
          outros blocos, ganhando o mesmo padrao de header (icone +
          titulo + chevron + acoes) das demais secoes. */}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ContactAside — componente principal
// ─────────────────────────────────────────────────────────────────

export function ContactAside({
  contact,
  className,
  collapsed = false,
  onToggleCollapse,
  contactEditNode,
  tagsNode,
  contactFieldConfigSlot,
  dealFieldConfigSlot,
  fieldConfigSlot, // legado
  headerActionsNode,
  contactTagsNode,
}: ContactAsideProps) {
  const course = contact.course ?? contact.product
  const deals = contact.deals ?? []

  // Campos personalizados separados por entidade
  const allPanelFields = contact.panelFields ?? []
  const contactPanelFields = allPanelFields.filter((f) => f.entityType === "contact")
  const dealPanelFields = allPanelFields.filter((f) => f.entityType === "deal")

  // Retrocompatibilidade: se ainda usar fieldConfigSlot (sem split), exibir em ambas seções
  const resolvedContactConfig = contactFieldConfigSlot ?? fieldConfigSlot
  const resolvedDealConfig = dealFieldConfigSlot ?? null

  // Updates otimísticos
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [nativeValues, setNativeValues] = useState<Record<string, string>>({})
  const [trackedOverrides, setTrackedOverrides] = useState<
    import("@/components/crm/tracked-info-section").TrackedAttribution
  >({})
  const native = (key: string, fallback: string | undefined) => nativeValues[key] ?? fallback

  // Chaves de invalidação de cache para este contato
  const contactInvalidateKeys: unknown[][] = [
    ["contact-sidebar", contact.contactId],
    ["inbox-conversations"],
  ]

  // Estados de modo edição
  const [contactEditMode, setContactEditMode] = useState(false)
  const [dealFieldsEditMode, setDealFieldsEditMode] = useState(false)
  const { data: contactSources = [] } = useContactSources(true)
  const canEditContact = useCan("contact:edit")
  const canEditDeal = useCan("deal:edit")

  // Sem permissão, não deixa o modo edição preso ligado.
  useEffect(() => {
    if (!canEditContact && contactEditMode) setContactEditMode(false)
  }, [canEditContact, contactEditMode])
  useEffect(() => {
    if (!canEditDeal && dealFieldsEditMode) setDealFieldsEditMode(false)
  }, [canEditDeal, dealFieldsEditMode])

  // Estados de configuração abertos
  const [contactConfigOpen, setContactConfigOpen] = useState(false)
  const [dealConfigOpen, setDealConfigOpen] = useState(false)

  // Estados de colapso de seção (variante Vívida)
  const [contactSectionOpen, setContactSectionOpen] = useState(true)
  // Com 2+ negócios: seção de campos começa recolhida; atendente abre ao atender.
  const [dealFieldsSectionOpen, setDealFieldsSectionOpen] = useState(() => deals.length < 2)
  const [productsSectionOpen, setProductsSectionOpen] = useState(true)

  // Qual negócio está expandido no hero. Com 1 deal: sempre aberto.
  // Com 2+: começa recolhido; clique expande um de cada vez.
  const [expandedDealId, setExpandedDealId] = useState<string | null>(
    () => (deals.length === 1 ? deals[0]?.id ?? null : null),
  )
  const dealIdsKey = deals.map((d) => d.id).join("|")

  useEffect(() => {
    setExpandedDealId(deals.length === 1 ? deals[0]?.id ?? null : null)
    setDealFieldsSectionOpen(deals.length < 2)
    setNativeValues({})
    setTrackedOverrides({})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset só quando muda o conjunto de deals
  }, [contact.contactId, dealIdsKey])

  const activeDealId = expandedDealId ?? deals[0]?.id ?? null
  const activeDeal = deals.find((d) => d.id === activeDealId) ?? deals[0]
  const multiDeal = deals.length >= 2

  const resolvedContactPanelFields = contactPanelFields.map((f) => ({
    ...f,
    value: fieldValues[f.fieldId] ?? f.value,
  }))
  const resolvedDealPanelFields = dealPanelFields
    .filter((f) => !activeDealId || !f.entityId || f.entityId === activeDealId)
    .map((f) => ({
      ...f,
      value: fieldValues[f.fieldId] ?? f.value,
    }))

  const [sectionOrder, reorder] = useSectionOrder<AsideSection>(
    ASIDE_STORAGE_KEY,
    ASIDE_DEFAULT_ORDER,
  )

  // Aba ativa (Perfil por padrão — é o conteúdo primário do operador).
  const [activeTab, setActiveTab] = useState<AsideTab>("perfil")

  // Toggle foco ↔ compacto (persiste em localStorage, compartilhado com deal-detail).
  const [viewMode, setViewMode] = useAsideViewMode()

  // IB6 do questionario: respeitar visibilidade configurada no
  // FieldConfigPanel admin (context=inbox_lead_v2). Antes o toggle do
  // "olho" no painel de config nao tinha efeito porque ContactAside
  // ignorava o layout. Mapeamento sectionId interno -> id taxonomia.
  const layoutIdle = useIdleEnabled(2000)
  const { sections: fieldLayoutSections } = useFieldLayout(
    "inbox_lead_v2",
    layoutIdle || contactConfigOpen || dealConfigOpen,
  )

  // Agrupamento visual dos campos personalizados (PRD Agrupamento de
  // Campos na Aside). Um memo por entidade — os dois grids (Contato /
  // Negócio) são independentes. Sem grupos configurados → 1 bucket flat
  // (fallback RN-05).
  type ResolvedContactField = typeof resolvedContactPanelFields[number]
  type ResolvedDealField = typeof resolvedDealPanelFields[number]
  const buildGroups = <T extends { fieldId: string; label: string; type: string }>(
    fields: T[],
    entity: "contact" | "deal",
  ): Array<{ id: string; title: string | null; collapsedDefault: boolean; fields: T[] }> => {
    if (fields.length === 0) return []
    const defs: CustomFieldDef[] = fields.map((f) => ({
      id: f.fieldId,
      name: f.fieldId,
      label: f.label,
      type: f.type,
    }))
    const groups = resolveCustomFieldGroups(fieldLayoutSections ?? [], defs, entity)
    const hasReal = groups.some((g) => g.group !== null)
    if (!hasReal) return [{ id: "__all__", title: null, collapsedDefault: false, fields }]
    const byId = new Map(fields.map((f) => [f.fieldId, f] as const))
    const out: Array<{ id: string; title: string | null; collapsedDefault: boolean; fields: T[] }> = []
    const orphans: T[] = []
    for (const g of groups) {
      const mapped = g.fields.map((d) => byId.get(d.id)).filter(Boolean) as T[]
      if (mapped.length === 0) continue
      if (g.group === null) orphans.push(...mapped)
      else out.push({ id: g.group.id, title: g.group.label, collapsedDefault: g.group.collapsedDefault, fields: mapped })
    }
    if (orphans.length > 0) {
      out.push({ id: "__orphans__", title: "Outros campos", collapsedDefault: false, fields: orphans })
    }
    return out
  }
  const contactFieldGroups = useMemo(
    () => buildGroups<ResolvedContactField>(resolvedContactPanelFields, "contact"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedContactPanelFields, fieldLayoutSections],
  )
  const dealFieldGroups = useMemo(
    () => buildGroups<ResolvedDealField>(resolvedDealPanelFields, "deal"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedDealPanelFields, fieldLayoutSections],
  )

  const sectionHiddenMap = useMemo(() => {
    const FIELD_LAYOUT_TO_INTERNAL: Record<string, AsideSection> = {
      negocios: "negocios",
      detalhes_contato: "contato",
      campos_personalizados: "campos-negocio",
    }
    const hidden: Partial<Record<AsideSection, boolean>> = {}
    for (const section of fieldLayoutSections ?? []) {
      const internal = FIELD_LAYOUT_TO_INTERNAL[section.id]
      if (internal && section.hidden) hidden[internal] = true
    }
    return hidden
  }, [fieldLayoutSections])

  // Seções visíveis na aba ativa (o hero `negocios` fica fora — é fixo).
  // Aplica os mesmos guards de dados que antes viviam no loop de render.
  const tabbedSections = useMemo(
    () =>
      sectionOrder.filter((s) => {
        if (s === "negocios") return false
        if (SECTION_TAB[s] !== activeTab) return false
        if (sectionHiddenMap[s]) return false
        if (s === "produtos" && deals.length === 0) return false
        if (
          s === "campos-negocio" &&
          resolvedDealPanelFields.length === 0 &&
          !resolvedDealConfig
        )
          return false
        return true
      }),
    [
      sectionOrder,
      activeTab,
      sectionHiddenMap,
      deals.length,
      resolvedDealPanelFields.length,
      resolvedDealConfig,
    ],
  )

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    // Os índices do resultado são relativos à lista da aba atual;
    // traduz de volta para a posição absoluta em `sectionOrder`.
    const from = tabbedSections[result.source.index]
    const to = tabbedSections[result.destination.index]
    if (!from || !to) return
    reorder(sectionOrder.indexOf(from), sectionOrder.indexOf(to))
  }

  /* ── Estado recolhido ──
     Kommo-style: o painel some por completo (a coluna vira 0px no grid do
     inbox) e deixamos só uma abinha flutuante grudada na borda direita para
     reabrir. Sem card, sem avatar, sem largura própria. */
  if (collapsed) {
    return (
      <TooltipGlass label={`Abrir painel · ${contact.name}`} side="left">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={`Abrir painel de ${contact.name}`}
          className="group absolute right-0 top-1/2 z-30 flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-l-[var(--radius-md)] border border-r-0 border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--brand-primary)] shadow-[var(--glass-shadow)] backdrop-blur-md transition-all hover:bg-[var(--brand-primary)] hover:text-white"
        >
          <IconChevronLeft size={14} strokeWidth={3} />
        </button>
      </TooltipGlass>
    )
  }

  return (
    <aside
      aria-label="Detalhes do contato"
      className={cn("relative flex h-full min-h-0 flex-col overflow-hidden", className)}
    >
      {/* Botao recolher — MESMA abinha do botao de abrir (estado recolhido),
          apenas espelhada: colada na borda esquerda do painel (border-l-0),
          chevron apontando para a direita (fecha empurrando pro lado). */}
      {onToggleCollapse && (
        <TooltipGlass label="Recolher painel de contato" side="left">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="group absolute left-0 top-1/2 z-30 -translate-x-full -translate-y-1/2 flex h-14 w-6 items-center justify-center rounded-l-[var(--radius-md)] border border-r-0 border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--brand-primary)] shadow-[var(--glass-shadow)] backdrop-blur-md transition-all hover:bg-[var(--brand-primary)] hover:text-white"
            aria-label="Recolher painel de contato"
          >
            <IconChevronRight size={14} strokeWidth={3} />
          </button>
        </TooltipGlass>
      )}
      <div
        data-tour="inbox-aside"
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] backdrop-blur-md shadow-[var(--glass-shadow)]"
      >

        {/* Header de acoes do contato (IB4 do questionario):
            DealCallButton entra aqui via `headerActionsNode`. Antes ficava
            no header do chat (chat-area.tsx headerActionsSlot), agora vive
            ao lado do botao de colapso pra paridade com o deal detail (que
            ja tinha o botao no header da sidebar). Mantemos absolute pra
            nao deslocar o topo das secoes existentes. */}
        {headerActionsNode && (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
            {headerActionsNode}
          </div>
        )}

        {/* ── Hero do negócio (FIXO no topo, fora das abas) ──
            Com 2+ negócios: lista retraída (# + etapa); atendente expande
            só o que for atender. Com 1 negócio: sempre expandido. */}
        {deals.length > 0 && !sectionHiddenMap["negocios"] && (
          <div data-tour="inbox-aside-deal" className="shrink-0 space-y-0.5 border-b border-[var(--glass-border-subtle)] pb-2">
            {multiDeal && (
              <p className="px-2 pt-2 font-display text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                {deals.length} negócios — toque para expandir
              </p>
            )}
            {deals.map((deal) => {
              const isExpanded = !multiDeal || expandedDealId === deal.id
              return (
                <DealInline
                  key={deal.id}
                  deal={deal}
                  course={course}
                  contact={contact}
                  collapsed={multiDeal && !isExpanded}
                  onToggle={
                    multiDeal
                      ? () =>
                          setExpandedDealId((cur) => (cur === deal.id ? null : deal.id))
                      : undefined
                  }
                />
              )
            })}
          </div>
        )}

        {/* ── Abas: Perfil / Produto + toggle de visão (ref. Stitch) ── */}
        <nav data-tour="inbox-aside-tabs" className="flex shrink-0 items-center gap-1.5 px-2.5 py-2" aria-label="Alternar entre Perfil e Produto">
          {ASIDE_TAB_ITEMS.map((item) => {
            const active = activeTab === item.value
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setActiveTab(item.value as AsideTab)}
                aria-pressed={active}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors",
                  active
                    ? "border border-slate-200 bg-white text-indigo-600 shadow-sm"
                    : "bg-slate-200/50 text-slate-600 hover:bg-slate-200",
                )}
              >
                {item.label}
              </button>
            )
          })}
          <div className="flex items-center gap-1">
            <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          </div>
        </nav>

        {/* Scroll só no conteúdo das abas — hero + nav ficam fixos acima. */}
        <div className="aside-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-8">
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="aside-sections">
            {(droppableProvided) => (
              <div
                ref={droppableProvided.innerRef}
                {...droppableProvided.droppableProps}
                className="flex flex-col"
              >
                {tabbedSections.map((sectionId, index) => {
                  return (
                    <Draggable key={sectionId} draggableId={sectionId} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(
                            "group/section",
                            snapshot.isDragging &&
                              "z-50 rounded-[var(--radius-xl)] opacity-90 shadow-2xl ring-2 ring-[var(--brand-primary)]/30",
                          )}
                        >
                          {/* ── Detalhes de Contato (campos nativos + personalizados) ── */}
                          {sectionId === "contato" && (
                            <div data-tour="inbox-aside-contact" className={SECTION_CARD_CLASS}>
                              <SectionHeader
                                dragHandleProps={provided.dragHandleProps ?? undefined}
                                icon={<IconUser size={16} className="text-orange-500" />}
                                open={contactSectionOpen}
                                onToggle={() => setContactSectionOpen((v) => !v)}
                                meta={
                                  contact.contactNumber != null ? (
                                    <span className="rounded-full bg-orange-500/15 px-1.5 py-px font-mono text-[10px] font-semibold tabular-nums text-orange-600">
                                      #{contact.contactNumber}
                                    </span>
                                  ) : undefined
                                }
                                actions={
                                  <>
                                    <RequirePermission permission="contact:edit">
                                      <HeaderBtn
                                        label={contactEditMode ? "Sair do modo edição" : "Editar dados de contato"}
                                        active={contactEditMode}
                                        onClick={() => setContactEditMode((v) => !v)}
                                      >
                                        {contactEditMode ? <IconX size={13} /> : <IconPencil size={13} />}
                                      </HeaderBtn>
                                    </RequirePermission>
                                    {resolvedContactConfig && (
                                      <HeaderBtn
                                        label={contactConfigOpen ? "Fechar configurações" : "Configurar campos de contato"}
                                        active={contactConfigOpen}
                                        onClick={() => setContactConfigOpen((v) => !v)}
                                      >
                                        {contactConfigOpen ? <IconX size={13} /> : <IconSettings size={13} />}
                                      </HeaderBtn>
                                    )}
                                  </>
                                }
                              >
                                Contato
                              </SectionHeader>

                              {contactSectionOpen && (
                              <>
                              {contactConfigOpen && resolvedContactConfig && (
                                <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--brand-primary)]/20 bg-[color-mix(in_srgb,var(--brand-primary)_4%,transparent)] p-3">
                                  {resolvedContactConfig}
                                </div>
                              )}

                              {/* Campos nativos */}
                              <div className="pt-1">
                                <Row label="Nome" isFirst icon={<IconUser size={12} />} compact={viewMode === "compact"}>
                                  <InlineNativeEditor
                                    value={native("name", contact.name)}
                                    entityType="contact"
                                    entityId={contact.contactId}
                                    fieldKey="name"
                                    editMode={contactEditMode}
                                    invalidateKeys={contactInvalidateKeys}
                                    onSaved={(v) => setNativeValues((p) => ({ ...p, name: v }))}
                                    textClassName="rounded bg-indigo-50 px-2 py-0.5 font-display text-[13px] font-bold text-indigo-600"
                                  />
                                </Row>
                                {/* Telefone (formatado). Campos basicos
                                    garantidos no aside: Nome, Telefone, Email
                                    e @ do WhatsApp. Edicao inline salva o valor
                                    cru; exibicao usa mascara BR. */}
                                <Row label="Telefone" icon={<IconPhone size={12} />} compact={viewMode === "compact"}>
                                  <InlineNativeEditor
                                    value={native("phone", contact.phone)}
                                    entityType="contact"
                                    entityId={contact.contactId}
                                    fieldKey="phone"
                                    inputType="tel"
                                    placeholder="Adicionar telefone"
                                    formatDisplay={(v) => formatPhoneDisplay(v)}
                                    editMode={contactEditMode}
                                    invalidateKeys={contactInvalidateKeys}
                                    onSaved={(v) => setNativeValues((p) => ({ ...p, phone: v }))}
                                    textClassName="text-right font-display text-[13px] font-semibold text-indigo-600"
                                  />
                                </Row>
                                <Row label="Email" icon={<IconMail size={12} />} compact={viewMode === "compact"}>
                                  <InlineNativeEditor
                                    value={native("email", contact.email)}
                                    entityType="contact"
                                    entityId={contact.contactId}
                                    fieldKey="email"
                                    inputType="email"
                                    placeholder="Adicionar e-mail"
                                    editMode={contactEditMode}
                                    invalidateKeys={contactInvalidateKeys}
                                    onSaved={(v) => setNativeValues((p) => ({ ...p, email: v }))}
                                    textClassName="text-right font-display text-[13px] font-semibold text-[var(--text-primary)]"
                                  />
                                </Row>
                                {/* Origem (Contact.source) — sempre visível no card Contato,
                                    logo após Email. Não usar contact.origin (fallback "—"). */}
                                <Row label="Origem" icon={<IconWorld size={12} />} compact={viewMode === "compact"}>
                                  <InlineNativeEditor
                                    value={native("source", contact.source?.trim() || "")}
                                    entityType="contact"
                                    entityId={contact.contactId}
                                    fieldKey="source"
                                    placeholder="Adicionar origem"
                                    editMode={contactEditMode}
                                    invalidateKeys={contactInvalidateKeys}
                                    suggestions={contactSources}
                                    onSaved={(v) => setNativeValues((p) => ({ ...p, source: v }))}
                                    textClassName="text-right font-display text-[13px] font-semibold text-[var(--text-primary)]"
                                  />
                                </Row>
                                {/* @ do WhatsApp — somente leitura (vem do
                                    webhook Meta, nao editavel). So aparece
                                    quando o contato tem username capturado. */}
                                {isFilled(contact.whatsappUsername) && (
                                  <Row
                                    label="@ WhatsApp"
                                    value={`@${contact.whatsappUsername!.replace(/^@/, "")}`}
                                    icon={<IconBrandWhatsapp size={12} />}
                                    compact={viewMode === "compact"}
                                  />
                                )}
                                {contact.connection && (
                                  <Row label="Canal" icon={<IconAffiliate size={12} />} compact={viewMode === "compact"}>
                                    <TooltipGlass
                                      label={`Conversando por ${formatConnectionLabel(contact.connection)}`}
                                      side="left"
                                    >
                                      <span className="inline-flex items-center gap-1.5 font-display text-[13px] font-bold text-[var(--text-primary)]">
                                        <ChannelTypeIcon type={contact.connection.type} size={14} />
                                        {channelTypeLabel(contact.connection.type)} · {formatConnectionShort(contact.connection)}
                                      </span>
                                    </TooltipGlass>
                                  </Row>
                                )}
                                {isFilled(contact.cpf) && <Row label="CPF" value={contact.cpf} icon={<IconId size={12} />} compact={viewMode === "compact"} />}
                                {isFilled(contact.rg) && <Row label="RG" value={contact.rg} icon={<IconId size={12} />} compact={viewMode === "compact"} />}
                                {isFilled(contact.cep) && <Row label="CEP" value={contact.cep} icon={<IconMapPin size={12} />} compact={viewMode === "compact"} />}
                                {isFilled(contact.addressNumber) && (
                                  <Row label="N Residencia" value={contact.addressNumber} icon={<IconMapPin size={12} />} compact={viewMode === "compact"} />
                                )}
                                {isFilled(contact.birthDate) && (
                                  <Row label="Data de Nascimento" value={contact.birthDate} icon={<IconCalendarEvent size={12} />} compact={viewMode === "compact"} />
                                )}
                              </div>

                              <TrackedInfoSection
                                values={{
                                  ...(contact.tracked ?? {}),
                                  ...trackedOverrides,
                                }}
                                contactId={contact.contactId}
                                editMode={contactEditMode}
                                invalidateKeys={contactInvalidateKeys}
                                compact={viewMode === "compact"}
                                onSaved={(key, v) =>
                                  setTrackedOverrides((p) => ({ ...p, [key]: v }))
                                }
                              />

                              {/* Campos personalizados de contato — com agrupamento visual (PRD) */}
                              {resolvedContactPanelFields.length > 0 && (() => {
                                const isCompact = viewMode === "compact"
                                const renderRow = (f: ResolvedContactField, i: number) => {
                                  const hl = f.highlight ?? resolveHighlight(f.value, f.highlightRules)
                                  const colors = hl ? SEVERITY_COLORS[hl.severity as HighlightSeverity] : null
                                  const canEdit = !!f.entityType && !!f.entityId
                                  return (
                                    <div
                                      key={f.fieldId}
                                      className={cn(
                                        "flex min-w-0 max-w-full items-center justify-between gap-2 text-sm",
                                        isCompact ? "py-1.5" : "py-2",
                                        i > 0 && "border-t border-slate-50",
                                      )}
                                    >
                                      <span className={cn(
                                        "shrink-0 font-medium text-slate-500",
                                        isCompact ? "w-[40%] text-[11px] leading-tight" : "w-[38%] text-[12px]"
                                      )}>
                                        {f.label}
                                      </span>
                                      <div className="min-w-0 max-w-full flex-1">
                                        {contactEditMode && canEdit ? (
                                          <InlineFieldEditor fieldId={f.fieldId} fieldType={f.type} fieldOptions={f.options ?? []} value={f.value || null} entityType={f.entityType!} entityId={f.entityId!} editMode={contactEditMode} invalidateKeys={contactInvalidateKeys} onSaved={(v) => setFieldValues((prev) => ({ ...prev, [f.fieldId]: v }))} textClassName={cn("font-display font-semibold text-[var(--text-primary)]", isCompact ? "text-[12px]" : "text-[13px]")} placeholder="+ Adicionar" />
                                        ) : hl && colors ? (
                                          <span style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }} className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold">{hl.label}</span>
                                        ) : canEdit ? (
                                          <InlineFieldEditor fieldId={f.fieldId} fieldType={f.type} fieldOptions={f.options ?? []} value={f.value || null} entityType={f.entityType!} entityId={f.entityId!} editMode={contactEditMode} invalidateKeys={contactInvalidateKeys} onSaved={(v) => setFieldValues((prev) => ({ ...prev, [f.fieldId]: v }))} textClassName={cn("font-display font-semibold text-[var(--text-primary)]", isCompact ? "text-[12px]" : "text-[13px]")} placeholder="+ Adicionar" />
                                        ) : (
                                          <span className={cn("block min-w-0 max-w-full break-words [overflow-wrap:anywhere] font-display font-semibold text-[var(--text-primary)]", isCompact ? "text-[12px]" : "text-[13px]")}>{f.value || PLACEHOLDER}</span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                }
                                return (
                                  <div className="mt-1 border-t border-slate-100 pt-2">
                                    {contactFieldGroups.map((g) => {
                                      const rows = g.fields.map((f, i) => renderRow(f, i))
                                      if (!g.title) return <div key={g.id}>{rows}</div>
                                      return (
                                        <CustomFieldGroupBlock
                                          key={g.id}
                                          storageKey={`aside_grupos:inbox_lead_v2:${g.id}`}
                                          title={g.title}
                                          collapsedInitial={g.collapsedDefault}
                                        >
                                          {rows}
                                        </CustomFieldGroupBlock>
                                      )
                                    })}
                                  </div>
                                )
                              })()}

                              {/* Tags do CONTATO removidas das asides por decisão de design */}
                              </>
                              )}
                            </div>
                          )}

                          {/* ── Produtos (secao independente, arrastavel) ──
                              Antes ficava fixo dentro do bloco Negocios; agora
                              e uma secao autonoma com header padronizado (icone
                              + titulo + chevron), permitindo drag-and-drop e
                              colapso. Usa o 1o negocio do contato (`deals[0]`)
                              como target — cenario dominante no inbox e um
                              contato com um deal ativo por vez. */}
                          {sectionId === "produtos" && activeDeal && (
                            <div className={SECTION_CARD_CLASS}>
                              <SectionHeader
                                dragHandleProps={provided.dragHandleProps ?? undefined}
                                icon={<IconPackage size={16} />}
                                open={productsSectionOpen}
                                onToggle={() => setProductsSectionOpen((v) => !v)}
                                meta={
                                  multiDeal && activeDeal.number != null ? (
                                    <span className="font-mono text-[10px] font-semibold text-[var(--text-muted)]">
                                      #{activeDeal.number}
                                    </span>
                                  ) : undefined
                                }
                              >
                                Produtos
                              </SectionHeader>
                              {productsSectionOpen && (
                                <div className="pt-1">
                                  {/* `hideTitle` evita duplicar o rotulo "Produtos"
                                      — quem provee o cabecalho e o SectionHeader
                                      acima; DealProductsSection so renderiza os
                                      items + botao adicionar + count. */}
                                  <DealProductsSection dealId={activeDeal.id} compact hideTitle />
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── Campos de Negócio (personalizados) ── */}
                          {sectionId === "campos-negocio" &&
                            (resolvedDealPanelFields.length > 0 || resolvedDealConfig) && (
                              <div data-tour="inbox-aside-fields" className={SECTION_CARD_CLASS}>
                                <SectionHeader
                                  dragHandleProps={provided.dragHandleProps ?? undefined}
                                  icon={<IconBriefcase size={16} className="text-[var(--brand-primary)]" />}
                                  open={dealFieldsSectionOpen}
                                  onToggle={() => setDealFieldsSectionOpen((v) => !v)}
                                  meta={
                                    <span className="flex flex-wrap items-center gap-1">
                                      {deals
                                        .filter((d) => d.number != null)
                                        .map((d) => (
                                          <button
                                            key={d.id}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              if (multiDeal) {
                                                setExpandedDealId(d.id)
                                                setDealFieldsSectionOpen(true)
                                              }
                                            }}
                                            className={cn(
                                              "rounded-full px-1.5 py-px font-mono text-[10px] font-semibold tabular-nums transition-colors",
                                              activeDeal?.id === d.id
                                                ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"
                                                : "text-[var(--text-muted)] hover:bg-slate-100",
                                            )}
                                            title={
                                              multiDeal
                                                ? `Ver campos do negócio #${d.number}`
                                                : undefined
                                            }
                                          >
                                            #{d.number}
                                          </button>
                                        ))}
                                    </span>
                                  }
                                  actions={
                                  <>
                                    <RequirePermission permission="deal:edit">
                                      <HeaderBtn
                                        label={dealFieldsEditMode ? "Sair do modo edição" : "Editar campos de negócio"}
                                        active={dealFieldsEditMode}
                                        onClick={() => setDealFieldsEditMode((v) => !v)}
                                      >
                                        {dealFieldsEditMode ? <IconX size={13} /> : <IconPencil size={13} />}
                                      </HeaderBtn>
                                    </RequirePermission>
                                      {resolvedDealConfig && (
                                        <HeaderBtn
                                          label={dealConfigOpen ? "Fechar configurações" : "Configurar campos de negócio"}
                                          active={dealConfigOpen}
                                          onClick={() => setDealConfigOpen((v) => !v)}
                                        >
                                          {dealConfigOpen ? <IconX size={13} /> : <IconSettings size={13} />}
                                        </HeaderBtn>
                                      )}
                                    </>
                                  }
                                >
                                  Negócio
                                </SectionHeader>

                                {dealFieldsSectionOpen && (
                                <>
                                {dealConfigOpen && resolvedDealConfig && (
                                  <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--brand-primary)]/20 bg-[color-mix(in_srgb,var(--brand-primary)_4%,transparent)] p-3">
                                    {resolvedDealConfig}
                                  </div>
                                )}

                                {resolvedDealPanelFields.length > 0 && (() => {
                                  const renderCompactRow = (f: ResolvedDealField, idx: number) => {
                                    const hl = f.highlight ?? resolveHighlight(f.value, f.highlightRules)
                                    const colors = hl ? SEVERITY_COLORS[hl.severity as HighlightSeverity] : null
                                    const canEdit = !!f.entityType && !!f.entityId
                                    return (
                                      <div
                                        key={f.fieldId}
                                        className={cn(
                                          "flex min-w-0 max-w-full items-center justify-between gap-2 py-2 text-sm",
                                          idx > 0 && "border-t border-slate-50",
                                        )}
                                      >
                                        <span className="w-[38%] shrink-0 text-[12px] font-medium leading-tight text-slate-500">{f.label}</span>
                                        <div className="min-w-0 max-w-full flex-1">
                                          {dealFieldsEditMode && canEdit ? (
                                            <InlineFieldEditor fieldId={f.fieldId} fieldType={f.type} fieldOptions={f.options ?? []} value={f.value || null} entityType={f.entityType!} entityId={f.entityId!} editMode={dealFieldsEditMode} invalidateKeys={[["deal-detail-v2", f.entityId!]]} onSaved={(v) => setFieldValues((prev) => ({ ...prev, [f.fieldId]: v }))} textClassName="font-display text-[12px] font-semibold text-[var(--text-primary)]" placeholder="+ Adicionar" />
                                          ) : hl && colors ? (
                                            <span style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }} className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold">{hl.label}</span>
                                          ) : canEdit ? (
                                            <InlineFieldEditor fieldId={f.fieldId} fieldType={f.type} fieldOptions={f.options ?? []} value={f.value || null} entityType={f.entityType!} entityId={f.entityId!} editMode={dealFieldsEditMode} invalidateKeys={[["deal-detail-v2", f.entityId!]]} onSaved={(v) => setFieldValues((prev) => ({ ...prev, [f.fieldId]: v }))} textClassName="font-display text-[12px] font-semibold text-[var(--text-primary)]" placeholder="+ Adicionar" />
                                          ) : (
                                            <span className="block min-w-0 max-w-full break-words [overflow-wrap:anywhere] font-display text-[12px] font-semibold text-[var(--text-primary)]">{f.value || PLACEHOLDER}</span>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  }
                                  return viewMode === "compact" ? (
                                    <div className="pt-1">
                                      {dealFieldGroups.map((g) => {
                                        const rows = g.fields.map((f, i) => renderCompactRow(f, i))
                                        if (!g.title) return <div key={g.id}>{rows}</div>
                                        return (
                                          <CustomFieldGroupBlock
                                            key={g.id}
                                            storageKey={`aside_grupos:inbox_lead_v2:${g.id}`}
                                            title={g.title}
                                            collapsedInitial={g.collapsedDefault}
                                          >
                                            {rows}
                                          </CustomFieldGroupBlock>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                  /* ── Focus (padrão): grid de cards agrupados ── */
                                  <div className="flex flex-col gap-3">
                                    {(() => { const _renderCard = (f: ResolvedDealField) => {
                                      const hl = f.highlight ?? resolveHighlight(f.value, f.highlightRules)
                                      const colors = hl ? SEVERITY_COLORS[hl.severity as HighlightSeverity] : null
                                      const canEdit = !!f.entityType && !!f.entityId
                                      const isEmptyDeal = !f.value || f.value === PLACEHOLDER
                                      const isLongDeal =
                                        !isEmptyDeal && ((f.value ?? "").length > 18 || (f.value ?? "").includes("@"))
                                      return (
                                        <div
                                          key={f.fieldId}
                                          className={cn(
                                            "flex min-w-0 max-w-full flex-col items-start gap-0.5 rounded-xl border border-slate-100 bg-slate-50 p-2.5",
                                            isLongDeal && "col-span-2",
                                          )}
                                        >
                                          <span className="text-[11px] font-medium text-slate-500">
                                            {f.label}
                                          </span>
                                          <div className="min-w-0 w-full max-w-full">
                                            {dealFieldsEditMode && canEdit ? (
                                              <InlineFieldEditor
                                                fieldId={f.fieldId}
                                                fieldType={f.type}
                                                fieldOptions={f.options ?? []}
                                                value={f.value || null}
                                                entityType={f.entityType!}
                                                entityId={f.entityId!}
                                                editMode={dealFieldsEditMode}
                                                invalidateKeys={[["deal-detail-v2", f.entityId!]]}
                                                onSaved={(v) =>
                                                  setFieldValues((prev) => ({ ...prev, [f.fieldId]: v }))
                                                }
                                                textClassName="font-display text-[13px] font-bold text-[var(--text-primary)]"
                                                placeholder="+ Adicionar"
                                              />
                                            ) : hl && colors ? (
                                              <span
                                                style={{
                                                  backgroundColor: colors.bg,
                                                  color: colors.text,
                                                  border: `1px solid ${colors.border}`,
                                                }}
                                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold"
                                              >
                                                {hl.label}
                                              </span>
                                            ) : canEdit ? (
                                              <InlineFieldEditor
                                                fieldId={f.fieldId}
                                                fieldType={f.type}
                                                fieldOptions={f.options ?? []}
                                                value={f.value || null}
                                                entityType={f.entityType!}
                                                entityId={f.entityId!}
                                                editMode={dealFieldsEditMode}
                                                invalidateKeys={[["deal-detail-v2", f.entityId!]]}
                                                onSaved={(v) =>
                                                  setFieldValues((prev) => ({ ...prev, [f.fieldId]: v }))
                                                }
                                                textClassName="font-display text-[13px] font-bold text-[var(--text-primary)]"
                                                placeholder="+ Adicionar"
                                              />
                                            ) : (
                                              <span className="block min-w-0 max-w-full break-words [overflow-wrap:anywhere] font-display font-bold text-[var(--text-primary)]">
                                                {f.value || PLACEHOLDER}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    }
                                    return dealFieldGroups.map((g) => {
                                      const grid = (
                                        <div className="grid min-w-0 grid-cols-2 gap-2">
                                          {g.fields.map(_renderCard)}
                                        </div>
                                      )
                                      if (!g.title) return <div key={g.id}>{grid}</div>
                                      return (
                                        <CustomFieldGroupBlock
                                          key={g.id}
                                          storageKey={`aside_grupos:inbox_lead_v2:${g.id}`}
                                          title={g.title}
                                          collapsedInitial={g.collapsedDefault}
                                        >
                                          {grid}
                                        </CustomFieldGroupBlock>
                                      )
                                    })
                                    })()}
                                  </div>
                                  )
                                })()}
                                </>
                                )}
                              </div>
                            )}
                        </div>
                      )}
                    </Draggable>
                  )
                })}
                {droppableProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {/* Estado vazio da aba (ex.: Produto sem negócio vinculado) */}
        {tabbedSections.length === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="font-display text-[12px] text-[var(--text-muted)]">
              {activeTab === "produto"
                ? "Nenhum produto — vincule um negócio para adicionar."
                : "Nenhum dado de perfil disponível."}
            </p>
          </div>
        )}
        </div>
      </div>
    </aside>
  )
}
