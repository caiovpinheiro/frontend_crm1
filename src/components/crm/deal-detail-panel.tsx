"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { cn } from "@/lib/utils"
import { Row } from "@/components/crm/aside-row"
import { TooltipGlass } from "@/components/crm/tooltip-glass"
import { ChannelTypeIcon } from "@/components/inbox/channel-type-icon"
import {
  IconArrowLeft,
  IconBriefcase,
  IconChevronDown,
  IconChevronUp,
  IconCircleX,
  IconDotsVertical,
  IconGripVertical,
  IconLayoutList,
  IconSearch,
  IconPencil,
  IconMessageCircle,
  IconChecklist,
  IconNote,
  IconClock,
  IconPhone,
  IconPaperclip,
  IconMoodSmile,
  IconMicrophone,
  IconSend,
  IconSettings,
  IconSparkles,
  IconX,
  IconCircleCheck,
  IconCircleDashed,
  IconAffiliate,
  IconBrandWhatsapp,
  IconMail,
  IconPackage,
  IconUser,
  IconStarFilled,
  IconLock,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react"
import { useAsideViewMode, type AsideViewMode } from "@/hooks/use-aside-view-mode"
import {
  channelTypeLabel,
  formatConnectionLabel,
  formatConnectionShort,
  type ConnectionRef,
} from "@/lib/connection-label"
import { useResolveConversationFlow } from "@/features/inbox-v2/extras/use-resolve-conversation-flow"
import { RequirePermission } from "@/components/auth/require-permission"
import { FavoritesPanel } from "@/components/crm/favorites-panel"
import { useSectionOrder } from "@/hooks/use-section-order"
import { useFieldLayout } from "@/hooks/use-field-layout"
import { resolveCustomFieldGroups, type CustomFieldDef } from "@/lib/field-layout"
import { CustomFieldGroupBlock } from "@/components/crm/fields/custom-field-group-block"
import { useContactSources } from "@/hooks/use-contact-sources"
import { formatPhoneDisplay } from "@/lib/phone"
import { useIsMobile } from "@/hooks/use-media-query"
import { useMobileChatChrome } from "@/hooks/use-mobile-chat-chrome"
import { COMPOSER_FOCUS_CHAT_EVENT } from "@/lib/composer-insert"
import { ConversationThreadSkeleton } from "@/components/crm/conversation-skeleton"
import { useHideChatEvents } from "@/components/crm/chat-timeline"

// ─── Ordem das seções da sidebar ──────────────────────────────────
// Mudancas (DD4 + DD5 do questionario):
//   - "principal" removido (so tinha Origem, que foi pro cabecalho fixo
//     como Contact.source). Mantido no union pra absorver localStorage
//     antigo — o render trata "principal" como `null`.
//   - "produtos" adicionado: antes ficava abaixo da lista, fora do DnD;
//     agora vira bloco arrastavel como os demais (paridade com inbox
//     ContactAside).
// A chave foi bumpada pra v3 pra invalidar a ordem antiga.
type SidebarSection = "principal" | "contato" | "campos" | "produtos"
// Ordem alinhada ao mockup (hero → Origem/Tags → Produtos → Campos de
// Negócio → Detalhes de Contato). Bump v4 pra invalidar a ordem antiga
// persistida em localStorage.
const SIDEBAR_DEFAULT_ORDER: SidebarSection[] = ["produtos", "campos", "contato"]
const SIDEBAR_STORAGE_KEY = "crm:deal-detail:sidebar-order:v4"

// ── Abas Perfil / Produto ─────────────────────────────────────────
// Origem + Tags continuam FIXOS acima das pills. As seções vão para
// duas abas: "Perfil" (contato + campos de negócio) e "Produto"
// (produtos). `principal` não pertence a nenhuma aba (render null).
type SidebarTab = "perfil" | "produto"
const SIDEBAR_SECTION_TAB: Partial<Record<SidebarSection, SidebarTab>> = {
  contato: "perfil",
  campos: "perfil",
  produtos: "produto",
}
const SIDEBAR_TAB_ITEMS = [
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
import { ChatArea } from "./chat-area"
import { type Message } from "./message-bubble"
import { resolveHighlight, SEVERITY_COLORS } from "@/lib/highlight"
import { InlineFieldEditor } from "@/components/crm/fields/inline-field-editor"
import { InlineNativeEditor } from "@/components/crm/fields/inline-native-editor"
import { DealLostReasonField } from "@/components/crm/deal-lost-reason-field"
import {
  TrackedInfoSection,
  type TrackedAttribution,
} from "@/components/crm/tracked-info-section"

interface DealOwner {
  initials: string
  name: string
  avatarColor: string
}

export interface DealDetail {
  id: string
  /** Número sequencial do deal por organização (1, 2, 3…). */
  number?: number | null
  /** ID do contato vinculado ao deal (necessário para editar campos do contato inline). */
  contactId?: string | null
  /** Número sequencial do contato por organização. */
  contactNumber?: number | null
  name: string
  initials: string
  avatarColor: string
  phone?: string
  email?: string | null
  /** @ do WhatsApp (Contact.whatsappUsername), quando disponível. Só leitura. */
  whatsappUsername?: string | null
  /** Valor do negócio (campo "Venda" no painel Kommo). */
  value?: number | string | null
  online?: boolean
  stage?: string
  /** Nome do funil (pipeline) ao qual o deal pertence. Exibido no header. */
  pipelineName?: string | null
  owner?: DealOwner
  /** Status do deal — quando "LOST", o painel exibe o motivo da perda. */
  status?: "OPEN" | "WON" | "LOST" | null
  /** Origem do contato (nativo). Antes vivia em `Deal.source` (campo
   *  fantasma — backend nao persistia), agora puxado de Contact.source via
   *  InlineNativeEditor. Editavel inline no cabecalho fixo da sidebar. */
  contactSource?: string | null
  /** Motivo registrado ao marcar o deal como perdido (texto livre OU label
   *  cadastrado). Exibido em destaque no cabeçalho da sidebar. */
  lostReason?: string | null
  /** Informação rastreada do contato (UTM / click IDs / Meta) — seção Contato. */
  tracked?: TrackedAttribution | null
}

type TabId = "conversa" | "atividades" | "notas" | "timeline" | "chamadas"

interface DealDetailPanelProps {
  isOpen: boolean
  onClose: () => void
  deal?: DealDetail | null
  /**
   * SalesHub / gaveta: renderiza só a coluna CRM (Perfil/Produto), sem
   * chat e sem overlay fullscreen. Default `false` preserva o painel
   * duas-colunas do kanban.
   */
  crmOnly?: boolean
  // Slots opcionais — quando ausentes, mantém o visual default do v0.
  stageRibbonSlot?: React.ReactNode
  /** Presença "quem está vendo" — pilha de avatares no header (estilo Kommo). */
  viewersSlot?: React.ReactNode
  winButtonSlot?: React.ReactNode
  /** Botão "Ligar" do softphone — posicionado no header, antes do moreActions. */
  callButtonSlot?: React.ReactNode
  moreActionsSlot?: React.ReactNode
  /**
   * Controles extras no hero azul (ex.: pin/fechar do SalesHub Flow).
   * Renderizado à direita da linha Voltar — não afeta o kanban se omitido.
   */
  headerActionsSlot?: React.ReactNode
  /** Botão dedicado de excluir negócio (atalho visível no header). */
  deleteSlot?: React.ReactNode
  /** Botão de edição do contato (ex.: ContactEditDialog), ao lado do nome. */
  contactEditSlot?: React.ReactNode
  ownerSlot?: React.ReactNode
  sourceSlot?: React.ReactNode
  tagsSlot?: React.ReactNode
  /** DD9: popover/slot de tags do CONTATO (Contact.tags), separado do
   *  `tagsSlot` (que sao tags do Deal). Renderizado no FieldCard
   *  "Dados de Contato" ao lado do label "Tags". */
  contactTagsSlot?: React.ReactNode
  /**
   * Slots para conteudo dinamico do painel de chat. Quando passados,
   * substituem o bloco hardcoded do v0 e permitem plugar mensagens
   * reais via useMessages, composer real via Composer e alerta de
   * sessao via SessionAlert.
   */
  messagesSlot?: React.ReactNode
  composerSlot?: React.ReactNode
  sessionAlertSlot?: React.ReactNode
  /** Banner de mensagem fixada (estilo WhatsApp) — renderizado entre o
   *  header de tabs e a lista de mensagens, na tab "Conversa". */
  pinnedMessageSlot?: React.ReactNode
  /**
   * Override por tab. Quando definido para a tab atual, substitui o
   * painel <main> inteiro pelo node. Util para Atividades/Notas/
   * Timeline conectarem em endpoints reais sem reescrever o panel.
   */
  tabContentOverride?: Partial<Record<TabId, React.ReactNode>>
  /**
   * Campos personalizados reais do negócio.
   * Quando fornecido, substitui os rótulos hardcoded (FIELD_GROUPS).
   * Cada item: { fieldId, label, value } — value nulo exibe "—".
   * `highlightRules` opcional: regras de formatação condicional (JSON cru).
   * `entityType` + `entityId`: entidade dona do valor (para edição inline).
   * `options`: opções de um campo SELECT.
   */
  customFieldsSlot?: {
    fieldId: string;
    label: string;
    value: string | null;
    type?: string;
    options?: string[];
    entityType?: "contact" | "deal";
    entityId?: string;
    highlightRules?: unknown[] | null;
    /** Highlight já resolvido pelo backend — preferir sobre re-resolver. */
    highlight?: { severity: string; label: string } | null;
  }[]
  /**
   * Seção de produtos do negócio (line items). Renderizada no fim da
   * sidebar, abaixo das seções reordenáveis. Permite adicionar/editar/
   * remover produtos vinculados ao deal.
   */
  productsSlot?: React.ReactNode
  /**
   * Callback para negócio SEM contato vinculado: ao inserir telefone/email
   * nos "Dados de contato", cria um contato novo e vincula ao deal.
   * Quando ausente, os campos ficam só-leitura (comportamento legado).
   */
  onCreateContactForField?: (field: "phone" | "email", value: string) => Promise<void>
  /**
   * Painel de configuração de campos (FieldConfigPanel).
   * Quando fornecido, exibe um botão de engrenagem na sidebar que
   * alterna para o modo de configuração. Visível apenas para admin/manager.
   */
  fieldConfigSlot?: React.ReactNode
  /** Slot de configuração de campos de contato (split do fieldConfigSlot). */
  contactFieldConfigSlot?: React.ReactNode
  /** Slot de configuração de campos de negócio (split do fieldConfigSlot). */
  dealFieldConfigSlot?: React.ReactNode
  /**
   * Dropdown de troca de fase montado externamente (ex.: StagePicker glass).
   * Quando fornecido, substitui o bloco "Funil de vendas / nome da fase" da sidebar.
   */
  stageDropdownSlot?: React.ReactNode
  /**
   * Segmentos reais do funil para a barra de progresso da sidebar.
   * Cada item: { id, name, color, position } — renderizados em ordem de position.
   * Se ausente, cai nos STAGES/FUNNEL_PALETTE hardcoded.
   */
  funnelSegments?: { id: string; name: string; color: string; position: number }[]
  /** ID da conversa ativa vinculada ao deal — permite encerrar/reabrir pelo kebab da TabsBar. */
  conversationId?: string | null
  /** Estado de resolução da conversa — para mostrar "Encerrar" ou "Reabrir". */
  isResolved?: boolean
  /**
   * ID amigavel sequencial da conversa (#N por organizacao). Quando
   * presente, renderiza um chip mono minimalista no TabsBar da conversa,
   * dentro do proprio container do chat — sem card lateral. Mesma
   * filosofia do `conversationNumber` do `ChatArea` (inbox). Opcional
   * pra manter compat com callers sem conversa ativa.
   */
  conversationNumber?: number | null
  /** ISO do `closedAt` da conversa — usado no chip "Encerrada" do TabsBar. */
  conversationClosedAt?: string | null
  /** Departamento da conversa — modal de tabulação no Encerrar (TabsBar). */
  conversationDepartmentId?: string | null
  conversationRequiresTabulation?: boolean
  /**
   * Conexão (Channel) por onde o contato está conversando (qual WhatsApp).
   * Exibida como chip no header do contato — distingue quando a pessoa fala
   * por contas/fontes diferentes.
   */
  connection?: ConnectionRef | null
}

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ size?: number }>; count?: number }[] = [
  { id: "conversa", label: "Conversa", icon: IconMessageCircle },
  { id: "atividades", label: "Tarefas", icon: IconChecklist },
  { id: "notas", label: "Notas", icon: IconNote },
  { id: "timeline", label: "Timeline", icon: IconClock },
  { id: "chamadas", label: "Chamadas", icon: IconPhone },
]

// ─────────────────────────────────────────────────────────────────
// ViewModeToggle — alterna entre visão foco (premium) e compacta
// ─────────────────────────────────────────────────────────────────
function ViewModeToggle({ mode, onChange }: { mode: AsideViewMode; onChange: (m: AsideViewMode) => void }) {
  return (
    <div className="flex shrink-0 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-0.5">
      <TooltipGlass label="Visão foco" side="top">
        <button type="button" onClick={() => onChange("focus")} aria-label="Visão foco"
          className={cn("flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] transition-colors",
            mode === "focus" ? "bg-[var(--brand-primary)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          )}>
          <IconSparkles size={12} />
        </button>
      </TooltipGlass>
      <TooltipGlass label="Visão compacta" side="top">
        <button type="button" onClick={() => onChange("compact")} aria-label="Visão compacta"
          className={cn("flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] transition-colors",
            mode === "compact" ? "bg-[var(--brand-primary)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          )}>
          <IconLayoutList size={12} />
        </button>
      </TooltipGlass>
    </div>
  )
}

export function DealDetailPanel({
  isOpen,
  onClose,
  deal,
  crmOnly = false,
  viewersSlot,
  callButtonSlot,
  contactTagsSlot,
  moreActionsSlot,
  headerActionsSlot,
  deleteSlot: _deleteSlot,
  contactEditSlot,
  ownerSlot,
  sourceSlot,
  tagsSlot,
  productsSlot,
  onCreateContactForField,
  messagesSlot,
  composerSlot,
  sessionAlertSlot,
  pinnedMessageSlot,
  tabContentOverride,
  customFieldsSlot,
  fieldConfigSlot,
  contactFieldConfigSlot,
  dealFieldConfigSlot,
  stageDropdownSlot,
  funnelSegments,
  conversationId,
  isResolved,
  conversationNumber,
  conversationClosedAt,
  conversationDepartmentId,
  conversationRequiresTabulation,
  connection,
}: DealDetailPanelProps) {
  // Retrocompatibilidade: split slots sobrepõem o legado fieldConfigSlot
  const resolvedContactConfig = contactFieldConfigSlot ?? fieldConfigSlot ?? null;
  const resolvedDealConfig = dealFieldConfigSlot ?? null;
  const [activeTab, setActiveTab] = useState<TabId>("conversa")
  // Config de visibilidade dos campos personalizados: um toggle por entidade
  // (contato/negócio), aberto inline dentro do card "Informações do Negócio"
  // — paridade com o aside do Inbox (contact-aside.tsx), que usa engrenagens
  // por seção em vez de uma única engrenagem global no hero.
  const [contactConfigOpen, setContactConfigOpen] = useState(false)
  const [dealConfigOpen, setDealConfigOpen] = useState(false)
  const { data: contactSources = [] } = useContactSources(isOpen)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  // Optimistic updates para campos nativos do deal
  const [dealNative, setDealNative] = useState<Record<string, string>>({})
  const [trackedOverrides, setTrackedOverrides] = useState<TrackedAttribution>({})
  // Modo edição para campos personalizados do negócio
  const [dealCustomEditMode, setDealCustomEditMode] = useState(false)

  // Ao trocar de lead, limpa os overrides locais (fieldValues/dealNative).
  // Esses estados são keyed pelo ID da DEFINIÇÃO do campo (o mesmo em todos
  // os leads), então sem este reset o valor editado num lead "vazava" para
  // o próximo até um F5 remontar o componente.
  useEffect(() => {
    setFieldValues({})
    setDealNative({})
    setTrackedOverrides({})
  }, [deal?.id])
  const [sectionOrder, reorderSections] = useSectionOrder<SidebarSection>(
    SIDEBAR_STORAGE_KEY,
    SIDEBAR_DEFAULT_ORDER,
  )

  // Aba ativa da sidebar (Perfil por padrão — conteúdo primário do operador).
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>("perfil")

  // Toggle foco ↔ compacto (compartilhado com contact-aside via localStorage).
  const [viewMode, setViewMode] = useAsideViewMode()

  // Hero recolhido: esconde anel/barra/grid pra ampliar a área de campos.
  const [heroCollapsed, setHeroCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    try {
      return window.localStorage.getItem("deal-aside-hero-collapsed") === "1"
    } catch {
      return false
    }
  })
  const toggleHeroCollapsed = useCallback(() => {
    setHeroCollapsed((v) => {
      try {
        window.localStorage.setItem("deal-aside-hero-collapsed", v ? "0" : "1")
      } catch {
        /* fail-silent */
      }
      return !v
    })
  }, [])

  // Detecção de viewport: < 768px (phone) usa switcher Chat | Negócio (só um
  // painel por vez, paridade com o Inbox) — empilhar aside + chat cortava as
  // mensagens. Desktop/tablet mantém o grid 2-colunas com resize.
  const isMobile = useIsMobile()
  // Mobile: esconde bottom nav global enquanto o chat do deal estiver aberto.
  useMobileChatChrome(
    Boolean(!crmOnly && isOpen && (messagesSlot || composerSlot || sessionAlertSlot)),
  )

  // Switcher mobile Chat/Negócio — default Chat, resetado a cada novo deal
  // ou reabertura do painel.
  const [mobilePaneTab, setMobilePaneTab] = useState<"chat" | "negocio">("chat")
  useEffect(() => {
    if (isOpen) setMobilePaneTab("chat")
  }, [deal?.id, isOpen])
  // "Enviar produto" (e similares) pedem foco no Chat — no mobile o composer
  // só existe nessa aba; sem isso o texto ficava pendente e a box vazia.
  useEffect(() => {
    function onFocusChat() {
      setMobilePaneTab("chat")
    }
    window.addEventListener(COMPOSER_FOCUS_CHAT_EVENT, onFocusChat)
    return () => window.removeEventListener(COMPOSER_FOCUS_CHAT_EVENT, onFocusChat)
  }, [])

  // DD8 do questionario: respeitar visibilidade de blocos configurada via
  // FieldConfigPanel admin (PUT /api/field-layout, context=deal_panel_v2).
  // Antes o painel era estatico e ignorava qualquer toggle de "olho" feito
  // na config — o operador clicava "esconder Produtos" e nada acontecia.
  // Mapeamento sectionId interno -> id da taxonomia field-layout.
  const { sections: fieldLayoutSections } = useFieldLayout("deal_panel_v2", isOpen)
  const sectionHiddenMap = useMemo(() => {
    const FIELD_LAYOUT_TO_INTERNAL: Record<string, SidebarSection> = {
      dados_contato: "contato",
      campos_negocio: "campos",
      produtos: "produtos",
    }
    const hidden: Partial<Record<SidebarSection, boolean>> = {}
    for (const section of fieldLayoutSections ?? []) {
      const internal = FIELD_LAYOUT_TO_INTERNAL[section.id]
      if (internal && section.hidden) hidden[internal] = true
    }
    return hidden
  }, [fieldLayoutSections])

  // ── Agrupamento visual dos campos personalizados (PRD Agrupamento de
  //    Campos na Aside). Resolve os grupos configurados em
  //    field_layout_configs (context=deal_panel_v2) considerando as duas
  //    entidades (deal/contact) presentes no customFieldsSlot. Sem
  //    grupos → devolve um único bucket com todos os campos (fallback
  //    flat = RN-05/CA-01), preservando o layout atual em grade.
  type SlotItem = NonNullable<typeof customFieldsSlot>[number]
  const customFieldGroups = useMemo<
    Array<{ id: string; title: string | null; collapsedDefault: boolean; fields: SlotItem[] }>
  >(() => {
    const slot = customFieldsSlot ?? []
    if (slot.length === 0) return []
    const dealDefs: CustomFieldDef[] = []
    const contactDefs: CustomFieldDef[] = []
    const bySlotId = new Map<string, SlotItem>()
    for (const f of slot) {
      bySlotId.set(f.fieldId, f)
      const def: CustomFieldDef = { id: f.fieldId, name: f.fieldId, label: f.label, type: f.type ?? "TEXT" }
      if (f.entityType === "deal") dealDefs.push(def)
      else contactDefs.push(def)
    }
    const dealGroups = resolveCustomFieldGroups(fieldLayoutSections ?? [], dealDefs, "deal")
    const contactGroups = resolveCustomFieldGroups(fieldLayoutSections ?? [], contactDefs, "contact")
    const hasRealDeal = dealGroups.some((g) => g.group !== null)
    const hasRealContact = contactGroups.some((g) => g.group !== null)
    if (!hasRealDeal && !hasRealContact) {
      // Fallback flat: 1 bucket com todos os campos, sem header (mantém
      // o card único "Informações do Negócio" como estava).
      return [{ id: "__all__", title: null, collapsedDefault: false, fields: slot }]
    }
    const out: Array<{ id: string; title: string | null; collapsedDefault: boolean; fields: SlotItem[] }> = []
    const orphans: SlotItem[] = []
    const emit = (groups: typeof dealGroups) => {
      for (const g of groups) {
        const fields = g.fields.map((d) => bySlotId.get(d.id)).filter(Boolean) as SlotItem[]
        if (fields.length === 0) continue
        if (g.group === null) orphans.push(...fields)
        else out.push({ id: g.group.id, title: g.group.label, collapsedDefault: g.group.collapsedDefault, fields })
      }
    }
    emit(dealGroups)
    emit(contactGroups)
    if (orphans.length > 0) {
      out.push({ id: "__orphans__", title: "Outros campos", collapsedDefault: false, fields: orphans })
    }
    return out
  }, [customFieldsSlot, fieldLayoutSections])

  // ── Resize da sidebar do detalhe (drag horizontal) ───────────────
  // Largura persistida em localStorage por operador. Min 280 evita
  // truncar o nome do estágio/dropdown; max 560 garante que o chat
  // (coluna direita) mantenha legibilidade mesmo em telas pequenas.
  // Default 340 mantém o tamanho histórico do v0 pra quem nunca
  // arrastou ficar igual ao que já conhecia.
  const SIDEBAR_WIDTH_STORAGE_KEY = "crm:deal-detail.sidebarWidth"
  const SIDEBAR_WIDTH_MIN = 280
  const SIDEBAR_WIDTH_MAX = 560
  const SIDEBAR_WIDTH_DEFAULT = 340
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return SIDEBAR_WIDTH_DEFAULT
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    const parsed = raw ? Number(raw) : NaN
    if (!Number.isFinite(parsed)) return SIDEBAR_WIDTH_DEFAULT
    return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, parsed))
  })
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const onResizeMove = useCallback((e: MouseEvent) => {
    const start = resizeRef.current
    if (!start) return
    const delta = e.clientX - start.startX
    const next = Math.min(
      SIDEBAR_WIDTH_MAX,
      Math.max(SIDEBAR_WIDTH_MIN, start.startWidth + delta),
    )
    setSidebarWidth(next)
  }, [])

  const onResizeEnd = useCallback(() => {
    resizeRef.current = null
    window.removeEventListener("mousemove", onResizeMove)
    window.removeEventListener("mouseup", onResizeEnd)
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    // Persiste a última largura conhecida (lê do DOM via state via closure
    // do React — atualizamos imediatamente em onResizeMove acima).
    setSidebarWidth((current) => {
      try {
        window.localStorage.setItem(
          SIDEBAR_WIDTH_STORAGE_KEY,
          String(current),
        )
      } catch {
        // localStorage pode estar bloqueado (private mode / quota); fail-silent
      }
      return current
    })
  }, [onResizeMove])

  const onResizeStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth }
      // Visual hint enquanto arrasta — cursor global e bloqueio de seleção
      // de texto evitam "fantasmas" de highlight ao puxar rápido.
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      window.addEventListener("mousemove", onResizeMove)
      window.addEventListener("mouseup", onResizeEnd)
    },
    [sidebarWidth, onResizeMove, onResizeEnd],
  )

  // Seções visíveis na aba ativa (Origem/Tags são fixos, fora daqui).
  const tabbedSections = useMemo(
    () =>
      sectionOrder.filter((s) => {
        if (SIDEBAR_SECTION_TAB[s] !== activeSidebarTab) return false
        if (sectionHiddenMap[s]) return false
        if (s === "campos" && (!customFieldsSlot || customFieldsSlot.length === 0))
          return false
        if (s === "produtos" && !productsSlot) return false
        return true
      }),
    [sectionOrder, activeSidebarTab, sectionHiddenMap, customFieldsSlot, productsSlot],
  )

  function handleSidebarDragEnd(result: DropResult) {
    if (!result.destination) return
    // Índices relativos à aba atual → traduz p/ posição absoluta.
    const from = tabbedSections[result.source.index]
    const to = tabbedSections[result.destination.index]
    if (!from || !to) return
    reorderSections(sectionOrder.indexOf(from), sectionOrder.indexOf(to))
  }

  // ESC fecha o painel quando esta aberto. Ignora se algum input/
  // textarea/contenteditable estiver focado para nao atrapalhar
  // edicao (composer, notas, inline edits).
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  // Cleanup defensivo: se o componente desmontar (painel fechado) durante
  // um drag em andamento, removemos listeners pra evitar memory leak e
  // restauramos o cursor/seleção globais.
  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onResizeMove)
      window.removeEventListener("mouseup", onResizeEnd)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [onResizeMove, onResizeEnd])

  // Enquanto isOpen=true mas o detail ainda está carregando (API assíncrona),
  // mostra o MESMO frame do painel carregado (hero na sidebar + área de
  // conversa) — o skeleton antigo (barra de topo glass) gerava flash de
  // "layout legado" a cada clique.
  if (!deal) {
    if (!isOpen) return null;
    const loadingAside = (
      <aside
        aria-label="Carregando detalhes do negócio"
        aria-busy="true"
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow)] backdrop-blur-md",
          !crmOnly && isMobile && "max-h-[42vh] h-auto shrink-0",
          crmOnly && "rounded-none border-0 shadow-none",
        )}
      >
        <div className={cn("shrink-0 px-3", crmOnly ? "pt-1.5" : "pt-2")}>
          <header className="relative isolate mb-2 rounded-xl border border-white/10 bg-[#2e3b6e] px-4 pb-3 pt-3 text-white shadow-[var(--glass-shadow-sm)]">
            <div className="relative flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClose}
                aria-label="Voltar"
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-white backdrop-blur-sm transition-all hover:bg-white/25 hover:border-white/40"
              >
                <IconArrowLeft size={13} strokeWidth={2.5} />
                <span className="font-display text-[11px] font-semibold leading-none">Voltar</span>
              </button>
              <div className="flex-1" />
              {headerActionsSlot ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  {headerActionsSlot}
                </div>
              ) : null}
            </div>
            <div className="relative mt-3 flex items-center gap-3">
              <div className="size-11 animate-pulse rounded-full bg-white/20" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-36 animate-pulse rounded bg-white/25" />
                <div className="h-3 w-20 animate-pulse rounded bg-white/15" />
              </div>
            </div>
          </header>
        </div>
        <div className="aside-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 pb-4 pt-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2.5 w-16 animate-pulse rounded bg-[var(--glass-bg-strong)]" />
              <div className="h-8 w-full animate-pulse rounded-lg bg-[var(--glass-bg-strong)]" />
            </div>
          ))}
        </div>
      </aside>
    );
    if (crmOnly) {
      return <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">{loadingAside}</div>;
    }
    return (
      <div
        className="fixed inset-0 z-50 translate-x-0 transition-transform duration-300 ease-out"
        style={{
          background:
            "linear-gradient(135deg, var(--bg-base) 0%, var(--bg-mesh-1) 40%, var(--bg-mesh-2) 70%, var(--bg-base) 100%)",
          backgroundAttachment: "fixed",
        }}
      >
        <div className="flex h-full flex-col gap-3.5 overflow-hidden p-4">
          <div
            className={cn(
              "min-h-0 flex-1 overflow-hidden",
              isMobile ? "flex flex-col gap-2" : "grid gap-1",
            )}
            style={
              !isMobile
                ? {
                    gridTemplateColumns: `${sidebarWidth}px 8px minmax(0, 1fr)`,
                    gridTemplateRows: "minmax(0, 1fr)",
                  }
                : undefined
            }
          >
            {loadingAside}
            {!isMobile && <div aria-hidden className="w-2" />}
            <main
              aria-label="Carregando conversa"
              aria-busy="true"
              className={cn(
                "flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow)] backdrop-blur-md",
                isMobile && "flex-1",
              )}
            >
              <TabsBar activeTab="conversa" onChange={() => undefined} />
              <ConversationThreadSkeleton />
            </main>
          </div>
        </div>
      </div>
    );
  }

  // Funil (hero): deriva o índice da etapa atual casando o NOME da etapa
  // (deal.stage) com os segmentos reais. Alimenta o anel de progresso e a
  // barra segmentada — mesma fonte usada pelo contact-aside do inbox.
  const sortedFunnel =
    funnelSegments && funnelSegments.length > 0
      ? [...funnelSegments].sort((a, b) => a.position - b.position)
      : null
  const currentSegIdx = sortedFunnel
    ? sortedFunnel.findIndex((s) => s.name === deal.stage)
    : -1
  const funnelTotal = sortedFunnel?.length ?? 0
  const funnelCurrent = currentSegIdx >= 0 ? currentSegIdx + 1 : 0

  // Mensagens default (mock alinhado ao DS) — usadas quando nao ha messagesSlot.
  const fallbackMessages: Message[] = [
    {
      id: "1",
      content: "Olá! Aqui está meu currículo conforme combinado.",
      time: "15:24",
      type: "incoming",
    },
    {
      id: "2",
      content: `Olá, ${deal.name.split(" ")[0]}! Recebi seu currículo. Vou analisar e retorno até amanhã com os próximos passos.`,
      time: "15:32",
      type: "outgoing",
      senderInitials: "AS",
    },
    {
      id: "3",
      content: "Perfeito! Fico no aguardo. Se precisar de mais documentação, me avise.",
      time: "15:35",
      type: "incoming",
    },
  ]

  // Em crmOnly o pai (SalesHub aside) anima abertura/fechamento — não
  // desmontar no close, senão o recheio some no 1º frame e sobra o
  // container vazio deslizando.

  return (
    <div
      className={cn(
        crmOnly
          ? "relative flex h-full min-h-0 w-full flex-col overflow-hidden"
          : "fixed inset-0 z-50 transition-transform duration-300 ease-out",
        !crmOnly && (isOpen ? "translate-x-0" : "translate-x-full"),
      )}
      style={
        crmOnly
          ? undefined
          : {
              background:
                "linear-gradient(135deg, var(--bg-base) 0%, var(--bg-mesh-1) 40%, var(--bg-mesh-2) 70%, var(--bg-base) 100%)",
              backgroundAttachment: "fixed",
            }
      }
    >
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden",
          crmOnly ? "gap-0 p-0" : "gap-3.5 p-4",
        )}
      >
        {/* Barra de topo REMOVIDA (jul/26): duplicava nome/#id/telefone que já
            aparecem no hero roxo e em "Detalhes de contato", além de um badge
            "ENTERPRISE" hardcoded (dado falso). Os controles essenciais (voltar,
            editar contato, chip de conexão) foram realocados para o hero. */}

        {/* 2 COLS (desktop/tablet ≥768px): SIDEBAR + CONTENT com resize
            horizontal. Phone (< 768px): switcher Chat | Negócio — só um
            painel por vez (paridade com o Inbox), já que empilhar aside +
            chat cortava as mensagens em telas pequenas. */}
        {!crmOnly && isMobile && (
          <div className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b border-[var(--glass-border)] bg-[var(--glass-bg)] px-2 py-1.5">
            <button
              type="button"
              onClick={onClose}
              className="flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] px-1.5 py-1 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
            >
              <IconArrowLeft size={14} stroke={2} />
              Voltar
            </button>
            <div className="min-w-0 flex-1" />
            <div className="flex shrink-0 items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-0.5">
              <button
                type="button"
                onClick={() => setMobilePaneTab("chat")}
                className={cn(
                  "flex items-center gap-1 rounded-[calc(var(--radius-md)-2px)] px-2 py-1 text-[11px] font-semibold transition-colors",
                  mobilePaneTab === "chat"
                    ? "bg-[var(--brand-primary)] text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                )}
              >
                <IconMessageCircle size={13} stroke={2} />
                Chat
              </button>
              <button
                type="button"
                onClick={() => setMobilePaneTab("negocio")}
                className={cn(
                  "flex items-center gap-1 rounded-[calc(var(--radius-md)-2px)] px-2 py-1 text-[11px] font-semibold transition-colors",
                  mobilePaneTab === "negocio"
                    ? "bg-[var(--brand-primary)] text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                )}
              >
                <IconBriefcase size={13} stroke={2} />
                Negócio
              </button>
            </div>
          </div>
        )}
        <div
          className={cn(
            "min-h-0 flex-1 overflow-hidden",
            crmOnly ? "flex" : isMobile ? "flex flex-col gap-2" : "grid gap-1",
          )}
          style={
            !crmOnly && !isMobile
              ? {
                  gridTemplateColumns: `${sidebarWidth}px 8px minmax(0, 1fr)`,
                  gridTemplateRows: "minmax(0, 1fr)",
                }
              : undefined
          }
        >
          {(crmOnly || !isMobile || mobilePaneTab === "negocio") && (
          <aside
            aria-label="Detalhes do negócio"
            className={cn(
              "flex h-full min-h-0 flex-col overflow-hidden bg-[var(--glass-bg-overlay)] backdrop-blur-md",
              crmOnly
                ? "w-full rounded-none border-0 shadow-none"
                : "rounded-[var(--radius-xl)] border border-[var(--glass-border)] shadow-[var(--glass-shadow)]",
              !crmOnly && isMobile && "flex-1",
            )}
          >
            {/* Cabeçalho fixo: hero do negócio — paridade visual com o
                contact-aside do inbox (fundo brand + anel de progresso).
                Pill "Negócio" removida (redundante, pedido do operador). */}
            <div className={cn("shrink-0 px-3", crmOnly ? "pt-1.5" : "pt-2")}>
              {/* ── Hero header (ref. Stitch): card escuro #2e3b6e, edge-to-edge
                  no topo do container via margens negativas, cantos inferiores
                  grandes (rounded-b-3xl) e sombra. ── */}
              <header className="relative isolate mb-2 rounded-xl border border-white/10 bg-[#2e3b6e] px-4 pb-3 pt-3 text-white shadow-[var(--glass-shadow-sm)]">
                {/* Linha de controles: Voltar (esq) + spacer + actions/kebab. */}
                <div className="relative flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Voltar"
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-white backdrop-blur-sm transition-all hover:bg-white/20 hover:border-white/40"
                  >
                    <IconArrowLeft size={13} strokeWidth={2.5} />
                    <span className="font-display text-[11px] font-semibold leading-none">Voltar</span>
                  </button>
                  <div className="flex-1" />
                  {/* Pill de etapa REMOVIDA do topo (jul/26): a fase virou o
                      destaque da linha base e é ela quem abre o dropdown. */}
                  {headerActionsSlot ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      {headerActionsSlot}
                    </div>
                  ) : null}
                  {moreActionsSlot && (
                    <div className="[&_button]:!text-white [&_button:hover]:!bg-white/15 [&_button]:!rounded-[var(--radius-sm)]">
                      {moreActionsSlot}
                    </div>
                  )}
                </div>

                {/* Linha topo: título (até 2 linhas) + #num */}
                <div className="relative mt-2 flex items-center gap-2">
                  <h2 className="min-w-0 text-[15px] font-bold leading-snug text-white">
                    <span className="line-clamp-2">
                      {deal.name}
                      <span className="ml-1.5 whitespace-nowrap text-[12px] font-normal text-slate-400">
                        #{deal.number ?? deal.id.slice(-6).toUpperCase()}
                      </span>
                    </span>
                  </h2>
                </div>

                {!heroCollapsed && (
                <>
                {/* Linha base: ETAPA em destaque + funil (secundário) + responsável.
                    Anel de progresso removido (jul/26) — a posição no funil agora é
                    comunicada apenas pela barra segmentada logo abaixo. Etapa e funil
                    trocaram de lugar: a etapa atual passou a ser o dado em destaque. */}
                <div className="relative mt-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    {stageDropdownSlot ? (
                      /* Fase em destaque = gatilho do dropdown. O slot já traz
                         dot + nome + chevron; só ampliamos pro tamanho do título. */
                      <div className="min-w-0 [&_button]:!max-w-full [&_button]:!gap-2 [&_button]:!text-[17px] [&_button]:!font-bold [&_button]:!uppercase [&_button]:!leading-tight [&_button]:!tracking-tight [&_button]:!text-white [&_button:hover]:!text-white [&_button:hover]:!opacity-90 [&_svg]:!size-4">
                        {stageDropdownSlot}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              (currentSegIdx >= 0 ? sortedFunnel?.[currentSegIdx]?.color : null) ||
                              "#fb923c",
                          }}
                          aria-hidden
                        />
                        <p className="truncate text-[17px] font-bold uppercase leading-tight tracking-tight text-white">
                          {deal.stage ?? "Em processo"}
                        </p>
                      </div>
                    )}
                    <p className="truncate text-xs text-slate-300">
                      {deal.pipelineName ?? "Funil de vendas"}
                      {funnelTotal > 0 ? ` · Etapa ${funnelCurrent} de ${funnelTotal}` : ""}
                    </p>
                  </div>
                  {ownerSlot && (
                    <div className="shrink-0 [&_button]:!rounded-md [&_button]:!border-transparent [&_button]:!bg-white [&_button]:!text-[#2e3b6e] [&_button]:shadow-sm [&_span]:!rounded-md [&_span]:!border-transparent [&_span]:!bg-white [&_span]:!text-[#2e3b6e] [&_span]:shadow-sm">
                      {ownerSlot}
                    </div>
                  )}
                </div>

                {/* Barra de etapas: 2px, ativo na cor da etapa, inativo white/20 */}
                {sortedFunnel && sortedFunnel.length > 0 && (
                  <div className="relative mt-2.5 flex items-center gap-1">
                    {sortedFunnel.map((seg, i) => (
                      <TooltipGlass key={seg.id} label={seg.name} side="top">
                        <span
                          className="h-[2px] flex-1 rounded-full transition-colors"
                          style={{
                            background: i <= currentSegIdx
                              ? seg.color || "#f59e0b"
                              : "rgba(255,255,255,0.2)",
                          }}
                        />
                      </TooltipGlass>
                    ))}
                  </div>
                )}

                {/* Grid 2 colunas de infos rápidas — Origem / Canal / Tags
                    (espelho exato do hero do contact-aside/Inbox). */}
                <div className="relative mt-2.5 grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 border-t border-white/10 pt-2.5 text-xs">
                  <span className="text-slate-400">Origem</span>
                  <div className="flex min-w-0 justify-start text-left font-medium [&_input]:!bg-white [&_input]:!text-[var(--text-primary)] [&_input]:!rounded [&_input]:!px-1">
                    {deal.contactId ? (
                      <InlineNativeEditor
                        value={deal.contactSource ?? undefined}
                        entityType="contact"
                        entityId={deal.contactId}
                        fieldKey="source"
                        placeholder="Adicionar origem"
                        suggestions={contactSources}
                        invalidateKeys={[
                          ["contact-sidebar", deal.contactId],
                          ["deal-detail-v2", deal.id],
                        ]}
                        textClassName="text-xs font-medium text-white"
                        emptyClassName="text-xs italic text-white/55"
                      />
                    ) : (
                      <span className="text-xs italic text-white/60">
                        Vincule um contato
                      </span>
                    )}
                  </div>
                  {connection && (
                    <>
                      <span className="text-slate-400">Canal</span>
                      <TooltipGlass
                        label={`Conversando por ${formatConnectionLabel(connection)}`}
                        side="left"
                      >
                        <span className="inline-flex min-w-0 items-center gap-1 truncate font-medium text-white">
                          <IconAffiliate size={11} className="shrink-0" />
                          {formatConnectionShort(connection)}
                        </span>
                      </TooltipGlass>
                    </>
                  )}
                  <span className="text-slate-400">Tags</span>
                  {/* Uma linha: chips truncam; "+" fica à direita no tray. */}
                  <span className="flex w-full min-w-0 flex-nowrap items-center justify-start gap-1 overflow-hidden [&_.tag-chip]:!border-white/20 [&_.tag-chip]:!bg-white/15 [&_.tag-chip]:!text-white [&_.tag-chip]:shrink [&_.tag-chip]:truncate">
                    {tagsSlot ?? (
                      <span className="text-xs text-white/60">Nenhuma tag</span>
                    )}
                  </span>
                </div>
                </>
                )}

                {/* Split: recolhe anel/barra/grid pra ampliar a área de campos. */}
                <button
                  type="button"
                  onClick={toggleHeroCollapsed}
                  aria-label={heroCollapsed ? "Expandir cabeçalho" : "Recolher cabeçalho"}
                  aria-expanded={!heroCollapsed}
                  className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-[#2e3b6e] shadow-md transition-colors hover:bg-slate-100"
                >
                  {heroCollapsed ? (
                    <IconChevronDown size={14} strokeWidth={2.5} />
                  ) : (
                    <IconChevronUp size={14} strokeWidth={2.5} />
                  )}
                </button>
              </header>

              {/* Motivo da perda — destaque vermelho quando deal está LOST. */}
              {deal.status === "LOST" && deal.lostReason?.trim() ? (
                <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-[rgba(239,68,68,0.22)] bg-[rgba(239,68,68,0.08)] px-2.5 py-2">
                  <span className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--color-danger-dark)]">
                    <IconCircleX size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--color-danger-dark)]">
                      Motivo da perda
                    </div>
                    <div className="mt-px text-[12px] leading-snug text-[var(--color-danger-text)]">
                      {deal.lostReason.trim()}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Conteúdo rolável: lista densa de campos */}
            <div className="aside-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
                <div className="flex min-w-0 flex-col gap-5">
                  {/* Origem + Tags migraram para dentro do hero (paridade com o
                      aside do inbox). */}

                  {/* ── Abas: Perfil / Produto + toggle de visão (ref. Stitch) ── */}
                  <nav className="flex items-center gap-2" aria-label="Alternar entre Perfil e Produto">
                    {SIDEBAR_TAB_ITEMS.map((item) => {
                      const active = activeSidebarTab === item.value
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setActiveSidebarTab(item.value as SidebarTab)}
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
                    <ViewModeToggle mode={viewMode} onChange={setViewMode} />
                  </nav>

                <DragDropContext onDragEnd={handleSidebarDragEnd}>
                  <Droppable droppableId="sidebar-sections">
                    {(droppableProvided) => (
                      <div
                        ref={droppableProvided.innerRef}
                        {...droppableProvided.droppableProps}
                        className="flex min-w-0 flex-col gap-5"
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
                                    snapshot.isDragging && "z-50 opacity-90",
                                  )}
                                >
                                  {/* sectionId === "principal" intencionalmente
                                      NAO renderiza nada: a unica row que existia
                                      aqui (Origem) migrou pro cabecalho fixo
                                      como Contact.source (DD5). Mantemos o
                                      branch vazio porque clientes com a ordem
                                      antiga em localStorage ainda passam por
                                      este id antes da chave v2 substituir. */}
                                  {sectionId === "principal" && null}

                                  {sectionId === "contato" && (
                                    <FieldCard
                                      title="Contato"
                                      compactTitle={crmOnly}
                                      titleMeta={
                                        deal.contactNumber != null ? (
                                          <span className="rounded-full bg-orange-500/15 px-1.5 py-px font-mono text-[10px] font-semibold tabular-nums text-orange-600">
                                            #{deal.contactNumber}
                                          </span>
                                        ) : undefined
                                      }
                                      dragHandleProps={provided.dragHandleProps ?? undefined}
                                      titleActions={
                                        (contactEditSlot || resolvedContactConfig) && (
                                          <div className="flex items-center gap-0.5">
                                            {/* Lápis de edição do contato — movido do header
                                                pra ficar ao lado da engrenagem do contato. */}
                                            {contactEditSlot && (
                                              <span className="[&_button]:h-6 [&_button]:w-6 [&_span]:h-6 [&_span]:w-6">
                                                {contactEditSlot}
                                              </span>
                                            )}
                                            {resolvedContactConfig && (
                                              <TooltipGlass
                                                label={contactConfigOpen ? "Fechar configurações" : "Configurar campos de contato"}
                                                side="top"
                                              >
                                                <button
                                                  type="button"
                                                  onClick={() => setContactConfigOpen((v) => !v)}
                                                  aria-label={contactConfigOpen ? "Fechar configurações" : "Configurar campos de contato"}
                                                  className={cn(
                                                    "flex h-6 w-6 items-center justify-center rounded transition-colors",
                                                    contactConfigOpen
                                                      ? "bg-[var(--brand-primary)] text-white"
                                                      : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]",
                                                  )}
                                                >
                                                  {contactConfigOpen ? <IconX size={12} /> : <IconSettings size={12} />}
                                                </button>
                                              </TooltipGlass>
                                            )}
                                          </div>
                                        )
                                      }
                                    >
                                        {contactConfigOpen && resolvedContactConfig && (
                                          <div className="mb-2 rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] p-3">
                                            {resolvedContactConfig}
                                          </div>
                                        )}
                                        {/* ── Rows compartilhadas (aside-row) — espelho exato do
                                            aside do inbox: mesmo Row, mesmas classes de valor;
                                            foco × compacto = prop `compact` (py-2 vs py-1.5). ── */}
                                        <div className="px-3.5 py-1">
                                          <Row label="Nome" isFirst icon={<IconUser size={12} />} compact={viewMode === "compact"}>
                                            {deal.contactId ? (
                                              <InlineNativeEditor value={dealNative["name"] ?? deal.name} entityType="contact" entityId={deal.contactId} fieldKey="name" placeholder="+ Adicionar" invalidateKeys={[["contact-sidebar", deal.contactId]]} onSaved={(v) => setDealNative((p) => ({ ...p, name: v }))} textClassName="rounded bg-indigo-50 px-2 py-0.5 font-display text-[13px] font-bold text-indigo-600" />
                                            ) : (
                                              <span className="min-w-0 truncate rounded bg-indigo-50 px-2 py-0.5 text-right font-display text-[13px] font-bold text-indigo-600" title={deal.name}>{deal.name || <span className="italic text-slate-400">+ Adicionar</span>}</span>
                                            )}
                                          </Row>
                                          <Row label="Telefone" icon={<IconPhone size={12} />} compact={viewMode === "compact"}>
                                            {deal.contactId ? (
                                              <InlineNativeEditor value={dealNative["phone"] ?? deal.phone} entityType="contact" entityId={deal.contactId} fieldKey="phone" inputType="tel" placeholder="+ Adicionar" formatDisplay={(v) => formatPhoneDisplay(v)} invalidateKeys={[["contact-sidebar", deal.contactId]]} onSaved={(v) => setDealNative((p) => ({ ...p, phone: v }))} textClassName="text-right font-display text-[13px] font-semibold text-indigo-600" />
                                            ) : onCreateContactForField ? (
                                              <InlineNativeEditor value={dealNative["phone"] ?? deal.phone} entityType="deal" entityId={deal.id} fieldKey="phone" inputType="tel" placeholder="+ Adicionar" formatDisplay={(v) => formatPhoneDisplay(v)} customSave={(v) => onCreateContactForField("phone", v)} onSaved={(v) => setDealNative((p) => ({ ...p, phone: v }))} textClassName="text-right font-display text-[13px] font-semibold text-indigo-600" />
                                            ) : (
                                              <a href={deal.phone ? `tel:${deal.phone}` : undefined} className="min-w-0 truncate text-right font-display text-[13px] font-semibold text-indigo-600" title={deal.phone ? formatPhoneDisplay(deal.phone) : undefined}>{deal.phone ? formatPhoneDisplay(deal.phone) : <span className="italic text-slate-400">+ Adicionar</span>}</a>
                                            )}
                                          </Row>
                                          <Row label="Email" icon={<IconMail size={12} />} compact={viewMode === "compact"}>
                                            {deal.contactId ? (
                                              <InlineNativeEditor value={dealNative["email"] ?? (deal.email ?? undefined)} entityType="contact" entityId={deal.contactId} fieldKey="email" inputType="email" placeholder="+ Adicionar" invalidateKeys={[["contact-sidebar", deal.contactId]]} onSaved={(v) => setDealNative((p) => ({ ...p, email: v }))} textClassName="text-right font-display text-[13px] font-semibold text-[var(--text-primary)]" />
                                            ) : onCreateContactForField ? (
                                              <InlineNativeEditor value={dealNative["email"] ?? (deal.email ?? undefined)} entityType="deal" entityId={deal.id} fieldKey="email" inputType="email" placeholder="+ Adicionar" customSave={(v) => onCreateContactForField("email", v)} onSaved={(v) => setDealNative((p) => ({ ...p, email: v }))} textClassName="text-right font-display text-[13px] font-semibold text-[var(--text-primary)]" />
                                            ) : (
                                              <span className="min-w-0 truncate text-right font-display text-[13px] font-semibold text-[var(--text-primary)]" title={deal.email ?? undefined}>{deal.email || <span className="italic text-slate-400">+ Adicionar</span>}</span>
                                            )}
                                          </Row>
                                          {/* @ WhatsApp — só leitura, vem do webhook Meta */}
                                          {deal.whatsappUsername && (
                                            <Row
                                              label="@ WhatsApp"
                                              value={`@${deal.whatsappUsername.replace(/^@/, "")}`}
                                              icon={<IconBrandWhatsapp size={12} />}
                                              compact={viewMode === "compact"}
                                            />
                                          )}
                                          {connection && (
                                            <Row label="Canal" icon={<IconAffiliate size={12} />} compact={viewMode === "compact"}>
                                              <TooltipGlass label={`Conversando por ${formatConnectionLabel(connection)}`} side="left">
                                                <span className="inline-flex min-w-0 items-center gap-1.5 font-display text-[13px] font-bold text-[var(--text-primary)]">
                                                  <ChannelTypeIcon type={connection.type} size={14} />
                                                  <span className="min-w-0 truncate">{channelTypeLabel(connection.type)} · {formatConnectionShort(connection)}</span>
                                                </span>
                                              </TooltipGlass>
                                            </Row>
                                          )}
                                        </div>
                                        {deal.contactId ? (
                                          <div className="px-3.5 pb-2">
                                            <TrackedInfoSection
                                              values={{
                                                ...(deal.tracked ?? {}),
                                                ...trackedOverrides,
                                              }}
                                              contactId={deal.contactId}
                                              invalidateKeys={[["contact-sidebar", deal.contactId]]}
                                              compact={viewMode === "compact"}
                                              onSaved={(key, v) =>
                                                setTrackedOverrides((p) => ({ ...p, [key]: v }))
                                              }
                                            />
                                          </div>
                                        ) : null}
                                    </FieldCard>
                                  )}

                                  {/* DD4: Produtos — sem FieldCard extra (o
                                      próprio DealProductsSection já provê o
                                      card branco com header "Produtos"). Aqui
                                      só expomos a alça de arrasto acima. */}
                                  {sectionId === "produtos" && productsSlot && (
                                    <section className="group/section">
                                      {provided.dragHandleProps && (
                                        <div className="mb-1.5 flex items-center gap-1">
                                          <span
                                            {...provided.dragHandleProps}
                                            className="flex cursor-grab items-center rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity group-hover/section:opacity-50 hover:opacity-100 active:cursor-grabbing"
                                            aria-label="Arrastar bloco Produtos"
                                          >
                                            <IconGripVertical size={12} />
                                          </span>
                                        </div>
                                      )}
                                      {productsSlot}
                                    </section>
                                  )}

                                  {sectionId === "campos" && (
                                    <FieldCard
                                      title="Negócio"
                                      compactTitle={crmOnly}
                                      plain={viewMode !== "compact"}
                                      titleMeta={
                                        deal.number != null ? (
                                          <span className="rounded-full bg-[var(--brand-primary)]/15 px-1.5 py-px font-mono text-[10px] font-semibold tabular-nums text-[var(--brand-primary)]">
                                            #{deal.number}
                                          </span>
                                        ) : undefined
                                      }
                                      dragHandleProps={provided.dragHandleProps ?? undefined}
                                      titleActions={
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => setDealCustomEditMode((v) => !v)}
                                            title={dealCustomEditMode ? "Sair do modo edição" : "Editar campos"}
                                            className={cn(
                                              "flex h-6 w-6 items-center justify-center rounded transition-colors",
                                              dealCustomEditMode
                                                ? "bg-[var(--brand-primary)] text-white"
                                                : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]",
                                            )}
                                          >
                                            {dealCustomEditMode ? <IconX size={12} /> : <IconPencil size={12} />}
                                          </button>
                                          {/* Engrenagem de configuração de visibilidade dos campos
                                              de NEGÓCIO. A de contato vive junto de "Informações do
                                              Contato" (ver acima) — paridade com contact-aside.tsx
                                              (Inbox), que também separa a engrenagem por entidade. */}
                                          {resolvedDealConfig && (
                                            <TooltipGlass
                                              label={dealConfigOpen ? "Fechar configurações" : "Configurar campos de negócio"}
                                              side="top"
                                            >
                                              <button
                                                type="button"
                                                onClick={() => setDealConfigOpen((v) => !v)}
                                                aria-label={dealConfigOpen ? "Fechar configurações" : "Configurar campos de negócio"}
                                                className={cn(
                                                  "flex h-6 w-6 items-center justify-center rounded transition-colors",
                                                  dealConfigOpen
                                                    ? "bg-[var(--brand-primary)] text-white"
                                                    : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]",
                                                )}
                                              >
                                                {dealConfigOpen ? <IconX size={12} /> : <IconSettings size={12} />}
                                              </button>
                                            </TooltipGlass>
                                          )}
                                        </>
                                      }
                                    >
                                      {dealConfigOpen && resolvedDealConfig && (
                                        <div className="border-b border-[var(--glass-border-subtle)] py-3">
                                          {resolvedDealConfig}
                                        </div>
                                      )}
                                      {/* Motivo da perda — sempre visível; só grava o texto
                                          (não muda status). Banner LOST no hero permanece. */}
                                      <div
                                        className={cn(
                                          viewMode === "compact" ? "border-b border-slate-50 px-4" : "px-0 pb-2",
                                        )}
                                      >
                                        <DealLostReasonField
                                          dealId={deal.id}
                                          value={deal.lostReason}
                                          compact={viewMode === "compact"}
                                        />
                                      </div>
                                      {(() => {
                                        // Renderer de UMA linha compacta (label à esquerda + valor/editor).
                                        const renderCompactRow = (field: SlotItem, fieldIdx: number) => {
                                          const currentValue = fieldValues[field.fieldId] ?? field.value
                                          const hl = field.highlight ?? resolveHighlight(currentValue, field.highlightRules)
                                          const canEdit = !!field.entityType && !!field.entityId
                                          return (
                                            <div
                                              key={field.fieldId}
                                              className={cn(
                                                "flex min-w-0 max-w-full items-center justify-between gap-2 py-2 text-sm",
                                                fieldIdx > 0 && "border-t border-slate-50",
                                              )}
                                            >
                                              <span className="w-[38%] shrink-0 text-[12px] font-medium leading-tight text-slate-500">{field.label}</span>
                                              <div className="min-w-0 max-w-full flex-1">
                                                {dealCustomEditMode && canEdit ? (
                                                  <InlineFieldEditor fieldId={field.fieldId} fieldType={(field as { type?: string }).type ?? "TEXT"} fieldOptions={field.options ?? []} value={currentValue ?? null} entityType={field.entityType!} entityId={field.entityId!} editMode={dealCustomEditMode} invalidateKeys={[["deal-detail-v2", deal.id]]} onSaved={(v) => setFieldValues((prev) => ({ ...prev, [field.fieldId]: v }))} textClassName="font-display text-[12px] font-semibold text-[var(--text-primary)]" placeholder="+ Adicionar" />
                                                ) : hl ? (
                                                  <HighlightBadge severity={hl.severity as "danger" | "success" | "warning" | "info"} label={hl.label} />
                                                ) : canEdit ? (
                                                  <InlineFieldEditor fieldId={field.fieldId} fieldType={(field as { type?: string }).type ?? "TEXT"} fieldOptions={field.options ?? []} value={currentValue ?? null} entityType={field.entityType!} entityId={field.entityId!} invalidateKeys={[["deal-detail-v2", deal.id]]} onSaved={(v) => setFieldValues((prev) => ({ ...prev, [field.fieldId]: v }))} textClassName="font-display text-[12px] font-semibold text-[var(--text-primary)]" placeholder="+ Adicionar" />
                                                ) : (
                                                  <span className="block min-w-0 max-w-full break-words [overflow-wrap:anywhere] font-display text-[12px] font-semibold text-[var(--text-primary)]">{currentValue || "—"}</span>
                                                )}
                                              </div>
                                            </div>
                                          )
                                        }
                                        // Renderer de UM card no grid (focus mode).
                                        const renderGridCard = (field: SlotItem) => {
                                          const currentValue = fieldValues[field.fieldId] ?? field.value
                                          const hl = field.highlight ?? resolveHighlight(currentValue, field.highlightRules)
                                          const canEdit = !!field.entityType && !!field.entityId
                                          const isEmpty = !currentValue || currentValue === "—"
                                          const isLong =
                                            !isEmpty && ((currentValue ?? "").length > 18 || (currentValue ?? "").includes("@"))
                                          return (
                                            <div
                                              key={field.fieldId}
                                              className={cn(
                                                "flex min-w-0 max-w-full flex-col items-start gap-0.5 rounded-xl border border-slate-100 bg-slate-50 p-2.5",
                                                isLong && "col-span-2",
                                              )}
                                            >
                                              <span className="text-[11px] font-medium text-slate-500">
                                                {field.label}
                                              </span>
                                              <div className="min-w-0 w-full max-w-full">
                                                {dealCustomEditMode && canEdit ? (
                                                  <InlineFieldEditor
                                                    fieldId={field.fieldId}
                                                    fieldType={(field as { type?: string }).type ?? "TEXT"}
                                                    fieldOptions={field.options ?? []}
                                                    value={currentValue ?? null}
                                                    entityType={field.entityType!}
                                                    entityId={field.entityId!}
                                                    editMode={dealCustomEditMode}
                                                    invalidateKeys={[["deal-detail-v2", deal.id]]}
                                                    onSaved={(v) =>
                                                      setFieldValues((prev) => ({ ...prev, [field.fieldId]: v }))
                                                    }
                                                    textClassName="font-display text-[13px] font-bold text-[var(--text-primary)]"
                                                    placeholder="+ Adicionar"
                                                  />
                                                ) : hl ? (
                                                  <HighlightBadge severity={hl.severity as "danger" | "success" | "warning" | "info"} label={hl.label} />
                                                ) : canEdit ? (
                                                  <InlineFieldEditor
                                                    fieldId={field.fieldId}
                                                    fieldType={(field as { type?: string }).type ?? "TEXT"}
                                                    fieldOptions={field.options ?? []}
                                                    value={currentValue ?? null}
                                                    entityType={field.entityType!}
                                                    entityId={field.entityId!}
                                                    invalidateKeys={[["deal-detail-v2", deal.id]]}
                                                    onSaved={(v) =>
                                                      setFieldValues((prev) => ({ ...prev, [field.fieldId]: v }))
                                                    }
                                                    textClassName="font-display text-[13px] font-bold text-[var(--text-primary)]"
                                                    placeholder="+ Adicionar"
                                                  />
                                                ) : (
                                                  <span className="block min-w-0 max-w-full break-words [overflow-wrap:anywhere] font-display text-[13px] font-bold text-[var(--text-primary)]">
                                                    {currentValue || "—"}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          )
                                        }
                                        return viewMode === "compact" ? (
                                          <div className="p-4 pt-2">
                                            {customFieldGroups.map((g) => {
                                              const body = g.fields.map((f, i) => renderCompactRow(f, i))
                                              if (!g.title) return <div key={g.id}>{body}</div>
                                              return (
                                                <CustomFieldGroupBlock
                                                  key={g.id}
                                                  storageKey={`aside_grupos:deal_panel_v2:${g.id}`}
                                                  title={g.title}
                                                  collapsedInitial={g.collapsedDefault}
                                                >
                                                  {body}
                                                </CustomFieldGroupBlock>
                                              )
                                            })}
                                          </div>
                                        ) : (
                                          <div className="flex flex-col gap-3">
                                            {customFieldGroups.map((g) => {
                                              const grid = (
                                                <div className="grid min-w-0 grid-cols-2 gap-2">
                                                  {g.fields.map(renderGridCard)}
                                                </div>
                                              )
                                              if (!g.title) return <div key={g.id}>{grid}</div>
                                              return (
                                                <CustomFieldGroupBlock
                                                  key={g.id}
                                                  storageKey={`aside_grupos:deal_panel_v2:${g.id}`}
                                                  title={g.title}
                                                  collapsedInitial={g.collapsedDefault}
                                                >
                                                  {grid}
                                                </CustomFieldGroupBlock>
                                              )
                                            })}
                                          </div>
                                        )
                                      })()}
                                    </FieldCard>
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

                {/* Estado vazio da aba (ex.: Produto sem itens) */}
                {tabbedSections.length === 0 && (
                  <div className="px-3 py-6 text-center">
                    <p className="font-display text-[12px] text-[var(--text-muted)]">
                      {activeSidebarTab === "produto"
                        ? "Nenhum produto adicionado a este negócio."
                        : "Nenhum dado de perfil disponível."}
                    </p>
                  </div>
                )}
                </div>

              {/* productsSlot agora vive dentro do DragDropContext acima
                  (sectionId === "produtos"). DD4: paridade com o
                  ContactAside do inbox, que ja tinha produtos arrastaveis. */}
            </div>
          </aside>
          )}

          {/* Handle de resize — desktop/tablet only (oculto em crmOnly / gaveta) */}
          {!crmOnly && !isMobile && (
          <div
            role="separator"
            aria-label="Redimensionar painel de detalhes"
            aria-orientation="vertical"
            aria-valuenow={sidebarWidth}
            aria-valuemin={SIDEBAR_WIDTH_MIN}
            aria-valuemax={SIDEBAR_WIDTH_MAX}
            tabIndex={0}
            onMouseDown={onResizeStart}
            onDoubleClick={() => {
              // Duplo-clique restaura o tamanho default — atalho útil
              // pra desfazer um arrasto acidental.
              setSidebarWidth(SIDEBAR_WIDTH_DEFAULT)
              try {
                window.localStorage.setItem(
                  SIDEBAR_WIDTH_STORAGE_KEY,
                  String(SIDEBAR_WIDTH_DEFAULT),
                )
              } catch {
                /* fail-silent */
              }
            }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
              e.preventDefault()
              const step = e.shiftKey ? 32 : 16
              setSidebarWidth((w) => {
                const next = Math.min(
                  SIDEBAR_WIDTH_MAX,
                  Math.max(
                    SIDEBAR_WIDTH_MIN,
                    w + (e.key === "ArrowRight" ? step : -step),
                  ),
                )
                try {
                  window.localStorage.setItem(
                    SIDEBAR_WIDTH_STORAGE_KEY,
                    String(next),
                  )
                } catch {
                  /* fail-silent */
                }
                return next
              })
            }}
            className="group/handle relative flex cursor-col-resize items-center justify-center self-stretch rounded-full transition-colors hover:bg-[var(--brand-primary)]/15 focus-visible:bg-[var(--brand-primary)]/25 focus-visible:outline-none"
          >
            <span
              aria-hidden
              className="h-10 w-[3px] rounded-full bg-[var(--glass-border)] transition-colors group-hover/handle:bg-[var(--brand-primary)] group-focus-visible/handle:bg-[var(--brand-primary)]"
            />
          </div>
          )}

          {/* CONTENT — chat. Desktop: sempre visível junto com o aside.
              Mobile: só quando a aba "Chat" do switcher está ativa.
              crmOnly (gaveta SalesHub): só a coluna CRM. */}
          {!crmOnly && (!isMobile || mobilePaneTab === "chat") && (
          tabContentOverride?.[activeTab] ? (
            <main
              aria-label={activeTab}
              className={cn(
                "flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] backdrop-blur-md shadow-[var(--glass-shadow)]",
                isMobile && "flex-1",
              )}
            >
              <TabsBar activeTab={activeTab} onChange={setActiveTab} />
              <div className="min-h-0 flex-1 overflow-hidden">
                {tabContentOverride[activeTab]}
              </div>
            </main>
          ) : messagesSlot || composerSlot || sessionAlertSlot ? (
            // Quando ha slots reais, montamos um <main> custom com o
            // mesmo visual da ChatArea nova (header + messages + alert +
            // composer) mas plugado nos slots externos.
            <main
              aria-label="Conversa"
              className={cn(
                "relative flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] backdrop-blur-md shadow-[var(--glass-shadow)]",
                isMobile && "flex-1",
              )}
            >
              <TabsBar
                activeTab={activeTab}
                onChange={setActiveTab}
                searchOpen={searchOpen}
                searchQuery={searchQuery}
                onSearchOpen={setSearchOpen}
                onSearchChange={setSearchQuery}
                conversationId={conversationId}
                isResolved={isResolved}
                conversationNumber={conversationNumber}
                conversationClosedAt={conversationClosedAt}
                conversationDepartmentId={conversationDepartmentId}
                conversationRequiresTabulation={conversationRequiresTabulation}
                dealId={deal.id}
                contactId={deal.contactId}
                contactName={deal.name}
                callButtonSlot={callButtonSlot}
              />

              {/* Faixa verde sutil de conversa resolvida — substitui o chip
                  "ENCERRADA" do TabsBar. Mesmo padrao do ChatArea (inbox). */}
              {isResolved && (
                <div
                  role="status"
                  className="flex shrink-0 items-center justify-center gap-1.5 border-b border-emerald-500/15 bg-emerald-500/10 px-4 py-1 text-[11px] font-medium text-emerald-700 v2-dark:text-emerald-400"
                >
                  <IconLock size={11} className="shrink-0" />
                  Conversa resolvida
                  {conversationClosedAt && (() => {
                    const d = new Date(conversationClosedAt)
                    if (Number.isNaN(d.getTime())) return null
                    const dd = String(d.getDate()).padStart(2, "0")
                    const mm = String(d.getMonth() + 1).padStart(2, "0")
                    const hh = String(d.getHours()).padStart(2, "0")
                    const mi = String(d.getMinutes()).padStart(2, "0")
                    return <span className="text-emerald-700/70 v2-dark:text-emerald-400/70">· {dd}/{mm} às {hh}:{mi}</span>
                  })()}
                </div>
              )}

              {pinnedMessageSlot}

              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-7 py-6">
                {messagesSlot}
              </div>

              <div
                data-chat-composer-footer
                className="shrink-0 border-t border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)]/95 pb-[max(0.375rem,env(safe-area-inset-bottom,0px))] pt-1 backdrop-blur-md"
              >
                {sessionAlertSlot}
                {composerSlot ? composerSlot : <FallbackComposer />}
                {/* Nº da conversa sobe pro Composer quando há composerSlot.
                    Aqui resta só a presença "quem está vendo" à direita. */}
                <div className="flex items-center justify-end gap-2 px-4 pt-0.5">
                  {viewersSlot}
                </div>
              </div>
            </main>
          ) : (
            // Default: container com header de tabs + ChatArea mock.
            <main
              aria-label="Conversa"
              className={cn(
                "flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] backdrop-blur-md shadow-[var(--glass-shadow)]",
                isMobile && "flex-1",
              )}
            >
              <TabsBar activeTab={activeTab} onChange={setActiveTab} />
              <div className="min-h-0 flex-1 overflow-hidden">
                <ChatArea
                  contact={{ name: deal.name, badge: "enterprise", badgeLabel: "ENTERPRISE" }}
                  messages={fallbackMessages}
                  daySeparator="14/05/2026"
                  showSessionAlert
                />
              </div>
            </main>
          )
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Subcomponentes locais ─── */

/**
 * Barra de abas (Conversa / Atividades / Notas / Timeline) renderizada
 * no header do container de conteúdo. Antes ficava numa linha solta
 * entre a topbar e os containers; agora vive dentro do próprio container.
 */
function TabsBar({
  activeTab,
  onChange,
  searchOpen,
  searchQuery,
  onSearchOpen,
  onSearchChange,
  conversationId,
  isResolved,
  conversationNumber,
  conversationClosedAt,
  callButtonSlot,
  conversationDepartmentId,
  conversationRequiresTabulation,
  dealId,
  contactId,
  contactName,
}: {
  activeTab: TabId
  onChange: (id: TabId) => void
  searchOpen?: boolean
  searchQuery?: string
  onSearchOpen?: (open: boolean) => void
  onSearchChange?: (q: string) => void
  conversationId?: string | null
  isResolved?: boolean
  dealId?: string | null
  contactId?: string | null
  contactName?: string | null
  /** #N sequencial da conversa — chip minimalista no header do container. */
  conversationNumber?: number | null
  /** ISO de encerramento — vira tooltip no chip "Encerrada". */
  conversationClosedAt?: string | null
  /** Botao "Ligar" (softphone) — renderizado no canto direito, ao lado do
   *  kebab de acoes da conversa. Antes vivia no header do card do deal. */
  callButtonSlot?: React.ReactNode
  /** Departamento da conversa — abre modal de tabulacao no encerrar quando exige. */
  conversationDepartmentId?: string | null
  conversationRequiresTabulation?: boolean
}) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [favoritesOpen, setFavoritesOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { handleToggleResolve, toggleResolve, dialogs } =
    useResolveConversationFlow({
      conversationId: conversationId ?? null,
      isResolved,
      departmentId: conversationDepartmentId,
      requireTabulationOnClose: conversationRequiresTabulation,
      dealId,
      contactId,
      contactName,
    })

  /* Fecha kebab ao clicar fora */
  useEffect(() => {
    if (!menuOpen) return
    function onOut(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onOut)
    return () => document.removeEventListener("mousedown", onOut)
  }, [menuOpen])

  /* Foca input ao abrir busca */
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const hasConversaActions = (activeTab === "conversa" && !!onSearchOpen) || !!conversationId
  const { hideEvents, toggleHideEvents } = useHideChatEvents()

  return (
    <div className="shrink-0 border-b border-[var(--glass-border-subtle)]">
      <header className="flex items-center gap-2 px-4 py-3">
        {/* Tabs pill group — oculta enquanto busca está aberta */}
        {!(searchOpen && activeTab === "conversa") && (
          // Borda/radius no scroller — H-scroll não corta a pílula em reta.
          <div className="toolbar-hscroll min-w-0 max-w-full flex-1 overflow-x-auto overscroll-x-contain rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex w-max flex-nowrap items-center gap-1">
              {TABS.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onChange(tab.id)}
                    className={cn(
                      "inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-display text-[12px] font-bold transition-all",
                      isActive
                        ? "bg-[var(--brand-primary)] text-white shadow-[var(--glass-shadow-sm)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                    )}
                  >
                    <Icon size={14} />
                    {tab.label}
                    {tab.count !== undefined && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 font-display text-[10px] font-bold",
                          isActive ? "bg-[var(--glass-bg)] text-white" : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
                        )}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Header enxuto (pedido 17/jul/26): sem chip #N e sem chip
            "Encerrada" no TabsBar. O status resolvido virou faixa verde
            sutil abaixo do TabsBar; o #N segue acessivel no separador de
            ticket da timeline da conversa. */}

        {/* Busca inline — ocupa o flex-1 quando aberta */}
        {searchOpen && activeTab === "conversa" ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-1.5">
            <IconSearch size={13} className="shrink-0 text-[var(--text-muted)]" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar na conversa…"
              value={searchQuery ?? ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="flex-1 bg-transparent font-display text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange?.("")}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)]"
              >
                <IconX size={10} />
              </button>
            )}
            <button
              type="button"
              aria-label="Fechar busca"
              onClick={() => { onSearchOpen?.(false); onSearchChange?.("") }}
              className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <IconX size={12} />
            </button>
          </div>
        ) : null}

        {/* Ações à direita — sem spacer flex-1 no meio (ele roubava largura
            das abas e cortava "Timeline"/"Chamadas"). */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {activeTab === "conversa" && (
          <TooltipGlass
            label={hideEvents ? "Mostrar eventos" : "Ocultar eventos"}
            side="bottom"
          >
            <button
              type="button"
              aria-label={hideEvents ? "Mostrar eventos" : "Ocultar eventos"}
              aria-pressed={hideEvents}
              onClick={toggleHideEvents}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                hideEvents
                  ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]",
              )}
            >
              {hideEvents ? <IconEyeOff size={15} /> : <IconEye size={15} />}
            </button>
          </TooltipGlass>
        )}
        {callButtonSlot}

        {/* Kebab de ações do header — lupa + encerrar conversa */}
        {hasConversaActions && (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="Ações"
              onClick={() => setMenuOpen((v) => !v)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                menuOpen
                  ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]",
              )}
            >
              <IconDotsVertical size={15} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-(--z-above) mt-1.5 w-52 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] p-1 shadow-[var(--glass-shadow)] backdrop-blur-md">
                {/* Buscar na conversa */}
                {activeTab === "conversa" && onSearchOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      onSearchOpen(!searchOpen)
                      if (searchOpen) onSearchChange?.("")
                      setMenuOpen(false)
                    }}
                    className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left font-display text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--glass-bg-subtle)]"
                  >
                    <IconSearch size={14} className="shrink-0 text-[var(--text-muted)]" />
                    {searchOpen ? "Fechar busca" : "Buscar na conversa"}
                  </button>
                )}

                {/* Mensagens favoritas — marcador pessoal, estilo WhatsApp */}
                {conversationId && (
                  <button
                    type="button"
                    onClick={() => {
                      setFavoritesOpen(true)
                      setMenuOpen(false)
                    }}
                    className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left font-display text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--glass-bg-subtle)]"
                  >
                    <IconStarFilled size={14} className="shrink-0 text-amber-500" />
                    Mensagens favoritas
                  </button>
                )}

                {/* Encerrar / Reabrir conversa */}
                {conversationId && (
                  <RequirePermission permission="conversation:resolve">
                    <button
                      type="button"
                      disabled={toggleResolve.isPending}
                      onClick={() => {
                        setMenuOpen(false)
                        handleToggleResolve()
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left font-display text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--glass-bg-subtle)] disabled:opacity-50"
                    >
                      {isResolved
                        ? <IconCircleDashed size={14} className="shrink-0 text-[var(--text-muted)]" />
                        : <IconCircleCheck size={14} className="shrink-0 text-[var(--text-muted)]" />
                      }
                      {isResolved ? "Reabrir conversa" : "Encerrar conversa"}
                    </button>
                  </RequirePermission>
                )}
              </div>
            )}
          </div>
        )}
        </div>
      </header>
      <FavoritesPanel
        open={favoritesOpen}
        onOpenChange={setFavoritesOpen}
        conversationId={conversationId ?? null}
      />
      {dialogs}
    </div>
  )
}

function PanelIconBtn({
  children,
  title,
}: {
  children: React.ReactNode
  title?: string
}) {
  const btn = (
    <button
      type="button"
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]"
    >
      {children}
    </button>
  )
  if (!title) return btn
  return <TooltipGlass label={title} side="bottom">{btn}</TooltipGlass>
}

/** Rótulo de seção (uppercase tracking) acima de cada cartão de campos. */
function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-display text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
      {children}
    </div>
  )
}

/** Badge colorido de destaque para campos com formatação condicional. */
function HighlightBadge({
  severity,
  label,
}: {
  severity: "danger" | "success" | "warning" | "info"
  label: string
}) {
  const colors = SEVERITY_COLORS[severity]
  return (
    <span
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
      }}
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold"
    >
      {label}
    </span>
  )
}

/** Cartão que agrupa uma lista densa de FieldRow (estilo Kommo).
 *  Quando `dragHandleProps` é fornecido, exibe alça de arraste no header. */
function FieldCard({
  title,
  titleMeta,
  dragLabel,
  dragHandleProps,
  titleActions,
  plain,
  compactTitle,
  children,
}: {
  title?: string
  /** Sufixo ao lado do título (ex.: #123 do contato/negócio). */
  titleMeta?: React.ReactNode
  /** Texto acessível para a alça quando não há título. */
  dragLabel?: string
  dragHandleProps?: React.HTMLAttributes<HTMLElement>
  /** Ações extras no cabeçalho (botões, ícones). */
  titleActions?: React.ReactNode
  /** Sem o card branco ao redor (ex.: grid de pills do modo foco). */
  plain?: boolean
  /** Título numa linha (aside estreito / crmOnly Flow). */
  compactTitle?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-xl)] border border-slate-100 bg-white shadow-sm">
      {/* Header com título + alça — agora DENTRO do card branco, para que
          título e conteúdo fiquem no MESMO container (igual ao hero e ao
          aside do inbox). Antes o título flutuava acima do card. */}
      <div className="flex min-w-0 items-center gap-1 px-3 pt-3 pb-2">
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            className="flex shrink-0 cursor-grab items-center rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity group-hover/section:opacity-50 hover:opacity-100 active:cursor-grabbing"
            aria-label={dragLabel ?? `Arrastar bloco ${title ?? ""}`}
          >
            <IconGripVertical size={12} />
          </span>
        )}
        {title && (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-slate-600">
            {title === "Contato" ? (
              <IconUser size={16} className="shrink-0 text-orange-500" />
            ) : (
              <IconBriefcase size={16} className="shrink-0 text-[var(--brand-primary)]" />
            )}
            <span
              className={cn(
                "min-w-0 truncate font-bold whitespace-nowrap",
                compactTitle ? "text-[12.5px]" : "text-sm",
              )}
            >
              {title}
            </span>
            {titleMeta ? (
              <span className="shrink-0">{titleMeta}</span>
            ) : null}
          </span>
        )}
        {titleActions && (
          <div className="ml-auto flex shrink-0 items-center gap-1 [&_button]:text-slate-400 [&_button:hover]:text-blue-500">
            {titleActions}
          </div>
        )}
      </div>
      {/* Conteúdo dentro do mesmo card. `plain` (grid de pills do modo foco)
          não traz padding próprio, então recebe aqui para não colar nas
          bordas; conteúdo não-plain já controla o próprio padding. */}
      {plain ? <div className="px-3 pb-3">{children}</div> : children}
    </section>
  )
}

/** Valor placeholder (italic muted) usado quando não há slot/dado real. */
function PlaceholderValue({ text }: { text: string }) {
  return (
    <span className="font-display text-[13px] italic text-[var(--text-muted)]">
      {text}
    </span>
  )
}

/**
 * Linha densa de campo: rótulo à esquerda, valor à direita. Quando
 * `valueNode` é fornecido (ex.: ownerSlot/tagsSlot/InlineEditText),
 * ele substitui o texto e fica responsável pela interação. Caso
 * contrário renderiza `value` (ou "—") com lápis de edição no hover.
 */
function FieldRow({
  label,
  value,
  valueNode,
  isLast,
  money,
}: {
  label: string
  value?: string | null
  valueNode?: React.ReactNode
  isLast?: boolean
  money?: boolean
}) {
  const empty = !value
  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-3 py-2.5",
        !isLast && "border-b border-[var(--glass-border-subtle)]",
      )}
    >
      <span className="min-w-0 shrink truncate text-[12.5px] font-medium text-[var(--text-muted)]">
        {label}
      </span>
      {valueNode ? (
        <div className="min-w-0 flex flex-wrap items-center gap-1.5">
          {valueNode}
        </div>
      ) : (
        <span
          className={cn(
            "group flex min-w-0 items-center gap-1.5 font-display text-[13px] font-semibold",
            empty ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]",
            money && !empty && "text-[var(--color-success-text)]",
          )}
        >
          <span className="truncate">{value || "—"}</span>
          <IconPencil
            size={13}
            className="shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
          />
        </span>
      )}
    </div>
  )
}

/** Formata o valor do negócio em BRL; retorna undefined quando vazio. */
function formatMoney(v: number | string | null | undefined): string | undefined {
  if (v === null || v === undefined || v === "") return undefined
  const n = typeof v === "string" ? Number(v) : v
  if (Number.isNaN(n)) return undefined
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/** Composer fallback (disabled) usado apenas quando sessao expirou e
 * nao foi fornecido `composerSlot`. */
function FallbackComposer() {
  return (
    <div
      className="mx-5.5 mb-5.5 flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] py-2 pl-4.5 pr-2 opacity-60 shadow-[var(--glass-shadow-sm)]"
    >
      <TooltipGlass label="Anexar" side="top">
        <button
          type="button"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)]"
        >
          <IconPaperclip size={18} />
        </button>
      </TooltipGlass>
      <input
        type="text"
        placeholder="Sessão expirada. Envie um template..."
        disabled
        className="flex-1 border-none bg-transparent text-sm italic text-[var(--text-primary)] outline-none placeholder:italic placeholder:text-[var(--text-muted)]"
      />
      <TooltipGlass label="Emoji" side="top">
        <button
          type="button"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)]"
        >
          <IconMoodSmile size={18} />
        </button>
      </TooltipGlass>
      <TooltipGlass label="Áudio" side="top">
        <button
          type="button"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)]"
        >
          <IconMicrophone size={18} />
        </button>
      </TooltipGlass>
      <TooltipGlass label="Enviar mensagem" side="top">
        <button
          type="button"
          className="flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full bg-[var(--brand-primary)] text-white shadow-[0_4px_12px_rgba(91,111,245,0.35)]"
        >
          <IconSend size={16} />
        </button>
      </TooltipGlass>
    </div>
  )
}
