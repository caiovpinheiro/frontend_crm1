"use client"

import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useJustArrived } from "@/lib/just-arrived"
import { InboundPreview } from "@/components/crm/inbound-preview"
import { IconCircleX, IconClock, IconMessage } from "@tabler/icons-react"
import { ChatAvatar, type ChatAvatarChannel } from "@/components/inbox/chat-avatar"
import { AVATAR_SIZE } from "@/lib/avatar"
import { summarizeSendError } from "@/lib/meta-error-catalog"
import {
  StatusTicks,
  type DeliveryTickStatus,
} from "@/components/crm/status-ticks"
import { TooltipGlass } from "@/components/crm/tooltip-glass"
import { AwaitingReplyFooter } from "@/components/crm/awaiting-reply-footer"
import { useInboxSettings } from "@/features/conversations-settings/hooks/use-inbox-settings"
import { Chip } from "./chip"
import { TagChip } from "./tag-chip"

export type AvatarColor =
  | "green"
  | "blue"
  | "orange"
  | "purple"
  | "pink"
  | "coral"
  | "teal"
  | "mint"
  | "gray"
export type TagType = "hot" | "warm" | "cold" | "vip" | "partner" | "ref"

export interface Deal {
  id: string
  name: string
  subtitle: string
  initials: string
  /** @deprecated Preferir ChatAvatar (sólido determinístico). Mantido p/ adapters. */
  avatarColor: AvatarColor
  online?: boolean
  dealNumber: string
  date: string
  message?: {
    /** Última mensagem do cliente (ou a nossa, com `ours`). */
    text: string
    time: string
    /** Cliente ainda não escreveu: `text` é a nossa última, apagada. */
    ours?: boolean
    /** Direção da última msg (qualquer lado) — ticks e "aguardando". */
    direction?: "in" | "out"
    /** Status de entrega (outbound), mesma semântica do inbox. */
    status?: DeliveryTickStatus
    /** Motivo quando status=failed. */
    sendError?: string | null
    /** Textos das msgs inbound aguardando — tooltip em balões separados. */
    awaitingTexts?: string[]
  }
  timeAgo?: string
  tags?: { label: string; type: TagType }[]
  owner: {
    initials: string
    name: string
    avatarColor: AvatarColor
  }
  /** Motivo da perda — exibido em destaque quando o deal está perdido. */
  lostReason?: string
  /** Canal do contato/conversa — badge no avatar (padrão Inbox). */
  channel?: string | null
  contactId?: string | null
  avatarUrl?: string | null
  phone?: string | null
  /** Mensagens não lidas do deal — badge no canto (mesmo visual do inbox). */
  unreadCount?: number
}

interface DealCardProps {
  deal: Deal
  onClick?: () => void
  /**
   * Chips de tags (e “+N”). Sem chips: omitir — a linha de tags some.
   * O botão +/Gerenciar vai em `tagsAddSlot`.
   */
  tagsSlot?: React.ReactNode
  /**
   * Trigger do TagsPopover (`+`). Sem tags: ao lado do responsável;
   * com tags: canto direito da linha das chips.
   */
  tagsAddSlot?: React.ReactNode
  /**
   * Slot opcional que substitui o Chip do responsavel no rodape
   * do card — permite plugar o `AssigneePopover` no kanban-v2.
   */
  ownerSlot?: React.ReactNode
  /**
   * Slot opcional renderizado no canto direito do rodape — usado para
   * o menu de "mover de fase" (alternativa ao drag-and-drop).
   */
  moveMenuSlot?: React.ReactNode
  /**
   * Seleção em massa. Quando `onToggleSelect` é passado, o card exibe um
   * checkbox no canto superior esquerdo (visível em hover ou quando
   * selecionado) e ganha um anel de destaque ao ser selecionado.
   */
  isSelected?: boolean
  onToggleSelect?: () => void
  /**
   * Modo seleção global. Quando `true`, o checkbox fica permanentemente
   * visível em todos os cards e o conteúdo desloca para a direita para
   * abrir espaço (estilo Kommo).
   */
  selectionMode?: boolean
  /**
   * Layout da linha de tags:
   * - `true` — `flex-wrap` livre
   * - `false`/omitido — `nowrap` + `overflow-hidden` (Flow: 1 linha + chips truncados + `+N`)
   */
  tagsWrap?: boolean
  /**
   * Flow: card recolhido — só a linha do contato (avatar/nome/#).
   * Preview, tags e responsável animam para fora sem desmontar a seleção.
   */
  compact?: boolean
}

function dealOpenHref(deal: Deal): string {
  const raw = deal.dealNumber.replace(/^#/, "")
  // Só número na URL — sem número conhecido, abre o board sem ?deal=.
  if (/^\d+$/.test(raw)) {
    return `/pipeline?deal=${encodeURIComponent(raw)}`
  }
  return "/pipeline"
}

const COMPACT_SECTION_TRANSITION = {
  duration: 0.2,
  ease: [0.32, 0.72, 0, 1] as const,
}

const PREVIEW_MSG_MAX = 160

function truncatePreviewText(text: string, max = PREVIEW_MSG_MAX): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1)).trim()}…`
}

/**
 * Preview estilo chat compacto — painel próprio (TooltipGlass `plain`
 * não traz chrome). Balões inbound contidos, scroll discreto.
 */
function AwaitingMessagesTooltip({ texts }: { texts: string[] }) {
  const unique = texts.map((t) => t.trim()).filter(Boolean)
  if (unique.length === 0) return null
  return (
    <div
      className={cn(
        "w-[240px] overflow-hidden rounded-xl border border-black/8",
        "bg-[#f4f5f8] p-2 shadow-[0_10px_28px_rgba(15,20,40,0.18)]",
      )}
    >
      <div
        className={cn(
          "flex max-h-[132px] flex-col gap-1 overflow-y-auto overscroll-contain",
          "[scrollbar-width:thin] [scrollbar-color:rgba(15,20,40,0.22)_transparent]",
          "[&::-webkit-scrollbar]:w-1",
          "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/20",
          "[&::-webkit-scrollbar-track]:bg-transparent",
        )}
      >
        {unique.map((text, i) => (
          <div
            key={`${i}-${text.slice(0, 20)}`}
            className={cn(
              "max-w-[92%] self-start rounded-lg rounded-bl-sm",
              "border border-black/6 bg-white px-2 py-1",
              "text-left text-[11px] font-normal not-italic leading-snug text-slate-700",
            )}
          >
            {truncatePreviewText(text)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DealCard({ deal, onClick, tagsSlot, tagsAddSlot, ownerSlot, moveMenuSlot, isSelected, onToggleSelect, selectionMode, tagsWrap = false, compact = false }: DealCardProps) {
  // O checkbox SÓ aparece quando o "modo seleção" global está ativo
  // (acionado pelo kebab "Selecionar..."). Removemos o antigo
  // comportamento de "aparecer no hover" para que entrada e saída
  // do modo sejam explícitas e previsíveis.
  const showCheckbox = !!selectionMode && !!onToggleSelect
  const unread = deal.unreadCount ?? 0
  const justArrived = useJustArrived(deal.contactId)
  // Cliente ainda não respondido — última msg inbound (aguarda reply do agente).
  const unreplied = deal.message?.direction === "in"
  const { settings: inboxSettings } = useInboxSettings()
  const showInboundSignal = inboxSettings.showInboundSignal && unreplied
  const hasTagChips = tagsSlot != null || (deal.tags?.length ?? 0) > 0
  return (
    <a
      href={dealOpenHref(deal)}
      draggable={false}
      aria-label={`Abrir negócio ${deal.dealNumber} — ${deal.name}`}
      aria-expanded={!compact}
      onClick={(e) => {
        if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault()
          onClick?.()
        }
      }}
      className={cn(
        // `block` preserva o comportamento de caixa do antigo <article>
        // (a <a> é inline por padrão e quebraria a largura/altura do card).
        "group relative block cursor-pointer overflow-hidden rounded-xl border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-strong)] backdrop-blur-sm shadow-[var(--glass-shadow-sm)] transition-[border-color,box-shadow,background-color] duration-200",
        // Sem translate no selecionado: evita briga com height animation / coluna do chat.
        !isSelected && "hover:-translate-y-0.5 hover:bg-[var(--glass-bg-overlay)] hover:shadow-[var(--glass-shadow)]",
        isSelected && "border-[var(--brand-primary)]/50 ring-2 ring-[var(--brand-primary)]/40",
        "active:cursor-grabbing",
      )}
    >
      <div className={cn("py-1.5", showCheckbox ? "pl-9 pr-3" : "px-3")}>
        {/* Checkbox de seleção em massa — só renderizado quando o
            "modo seleção" está ativo. stopPropagation em vários eventos
            evita abrir o deal ou iniciar o drag. */}
        {showCheckbox ? (
          <label
            className="absolute left-2 top-2 z-20 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] shadow-sm backdrop-blur-md"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect() }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={!!isSelected}
              readOnly
              tabIndex={-1}
              className="pointer-events-none h-3.5 w-3.5 cursor-pointer accent-[var(--brand-primary)]"
            />
          </label>
        ) : null}

        {/* Top row: avatar Inbox (foto | sólido + badge canal) + name + dealNumber/date */}
        <div className="flex items-center gap-2">
        <ChatAvatar
          user={{
            // Cor do avatar = hash do contato (mesmo contato = mesma cor do
            // Inbox, que usa `contact.id`). Sem contato vinculado, cai no
            // nome (deal.name = nome do contato) — nunca no id do negócio,
            // que daria uma cor divergente pra mesma pessoa.
            id: deal.contactId ?? undefined,
            name: deal.name,
            imageUrl: deal.avatarUrl ?? null,
          }}
          phone={deal.phone ?? undefined}
          channel={(deal.channel as ChatAvatarChannel) ?? null}
          size={AVATAR_SIZE.sm}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[13px] font-bold text-[var(--text-primary)]">
            {deal.name}
          </div>
          <div className="mt-px truncate text-[11px] text-[var(--text-muted)]">
            {deal.subtitle}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="rounded-[var(--radius-sm)] bg-[var(--color-enterprise-bg)] px-1.5 py-px font-display text-[10px] font-bold text-[var(--brand-primary)]">
            {deal.dealNumber}
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">{deal.date}</span>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!compact ? (
          <motion.div
            key="deal-card-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={COMPACT_SECTION_TRANSITION}
            className="overflow-hidden"
          >
            {/* Message preview — tooltip no texto com a msg completa. */}
            {deal.message && (
              <div className="mt-1 flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--glass-bg-overlay)] px-2.5 py-1 text-[11.5px] leading-[1.35] text-[var(--text-secondary)]">
                {/* Ícone de conversa com borda azul — mesmo do card de
                    conversa do inbox, para padronizar a leitura visual. */}
                <span className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[rgba(91,111,245,0.40)] text-[var(--brand-primary)]">
                  <IconMessage size={9} />
                </span>
                {/* Tick de falha (outbound) — enviada/entregue/lida não
                    aparecem mais no preview do card. */}
                {deal.message.direction === "out" &&
                  deal.message.status === "failed" && (
                    <TooltipGlass
                      label={
                        summarizeSendError(deal.message.sendError) ||
                        "Falha no envio"
                      }
                      side="top"
                    >
                      <span className="mt-px inline-flex shrink-0 not-italic">
                        <StatusTicks status="failed" onLightBg size="card" />
                      </span>
                    </TooltipGlass>
                  )}
                <TooltipGlass
                  plain
                  label={
                    <AwaitingMessagesTooltip
                      texts={
                        deal.message.awaitingTexts &&
                        deal.message.awaitingTexts.length > 0
                          ? deal.message.awaitingTexts
                          : [deal.message.text]
                      }
                    />
                  }
                  side="top"
                  align="center"
                  sideOffset={8}
                >
                  <span className="flex min-w-0 flex-1 cursor-default overflow-hidden">
                    <InboundPreview
                      text={deal.message.text}
                      unread={unread}
                      glow={justArrived}
                      ours={deal.message.ours}
                    />
                  </span>
                </TooltipGlass>
                <span className="shrink-0 text-[10px] not-italic text-[var(--text-muted)]">
                  {deal.message.time}
                </span>
              </div>
            )}

            {!deal.message && deal.timeAgo && (
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <IconClock size={11} />
                {deal.timeAgo}
              </div>
            )}

            {/* Motivo da perda — destaque vermelho suave em deals perdidos,
                permite bater o olho e saber por que o negócio foi perdido. */}
            {deal.lostReason && (
              <div className="mt-1 flex items-start gap-1.5 rounded-[var(--radius-md)] border border-[rgba(239,68,68,0.20)] bg-[rgba(239,68,68,0.08)] px-2.5 py-1 text-[11px] leading-[1.35]">
                <span className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--color-danger-dark)]">
                  <IconCircleX size={12} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-display text-[9.5px] font-bold uppercase tracking-wide text-[var(--color-danger-dark)]">
                    Motivo da perda
                  </span>
                  <span className="line-clamp-2 block text-[var(--color-danger-text)]">{deal.lostReason}</span>
                </span>
              </div>
            )}

            {/* Tags — só quando há chips. Sem tags, o + vai na linha do
                responsável (`tagsAddSlot`) para economizar altura. */}
            {hasTagChips && (
            <div
              className={cn(
                // py + -my: overflow clipa na padding-edge — sem isso, bordas
                // das pills (1px) + leading-tight ficam "raspadas" no Flow.
                "mb-1 mt-1 flex min-w-0 items-center gap-1 py-0.5 -my-0.5",
                tagsWrap
                  ? "flex-wrap"
                  : "flex-nowrap overflow-x-clip overflow-y-visible",
              )}
              onClick={
                tagsSlot || tagsAddSlot
                  ? (e) => { e.preventDefault(); e.stopPropagation(); }
                  : undefined
              }
              onMouseDown={
                tagsSlot || tagsAddSlot ? (e) => e.stopPropagation() : undefined
              }
              onPointerDown={
                tagsSlot || tagsAddSlot ? (e) => e.stopPropagation() : undefined
              }
              onTouchStart={
                tagsSlot || tagsAddSlot ? (e) => e.stopPropagation() : undefined
              }
            >
              <div
                className={cn(
                  "flex min-w-0 items-center gap-1",
                  tagsWrap ? "flex-wrap" : "min-w-0 flex-1 flex-nowrap overflow-hidden",
                )}
              >
                {tagsSlot ?? (
                  <>
                    {deal.tags?.map((tag, i) => (
                      <TagChip
                        key={i}
                        name={tag.label}
                        color={
                          tag.type === "hot"
                            ? "#ef4444"
                            : tag.type === "warm"
                              ? "#f59e0b"
                              : tag.type === "cold"
                                ? "#5b6ff5"
                                : tag.type === "vip"
                                  ? "#a855f7"
                                  : tag.type === "partner"
                                    ? "#0d9488"
                                    : "#64748b"
                        }
                      />
                    ))}
                  </>
                )}
              </div>
              {tagsAddSlot ? (
                <div className="ml-auto shrink-0">{tagsAddSlot}</div>
              ) : null}
            </div>
            )}

            {/* Owner — slot tem prioridade. Sem tags: + ao lado. */}
            <div
              className="flex items-center gap-1.5 border-t border-[var(--glass-border-subtle)] pt-1"
              onClick={
                ownerSlot || (!hasTagChips && tagsAddSlot)
                  ? (e) => { e.preventDefault(); e.stopPropagation(); }
                  : undefined
              }
              onMouseDown={
                ownerSlot || (!hasTagChips && tagsAddSlot)
                  ? (e) => e.stopPropagation()
                  : undefined
              }
              onPointerDown={
                ownerSlot || (!hasTagChips && tagsAddSlot)
                  ? (e) => e.stopPropagation()
                  : undefined
              }
              onTouchStart={
                ownerSlot || (!hasTagChips && tagsAddSlot)
                  ? (e) => e.stopPropagation()
                  : undefined
              }
            >
              {ownerSlot ?? (
                <Chip variant="brand" className="cursor-pointer transition-colors hover:bg-[rgba(91,111,245,0.22)]">
                  {deal.owner.name}
                </Chip>
              )}
              {!hasTagChips && tagsAddSlot ? tagsAddSlot : null}
              {moveMenuSlot && (
                <div
                  className="ml-auto"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  {moveMenuSlot}
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      </div>

      {showInboundSignal ? <AwaitingReplyFooter unreadCount={unread} /> : null}
    </a>
  )
}
