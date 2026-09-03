"use client"

import { cn } from "@/lib/utils"
import { TooltipGlass } from "@/components/crm/tooltip-glass"
import { ChatAvatar, type ChatAvatarChannel } from "@/components/inbox/chat-avatar"
import { AVATAR_SIZE } from "@/lib/avatar"
import {
  IconClock,
  IconPaperclip,
  IconPhoto,
  IconMicrophone,
  IconVideo,
  IconFile,
  IconMapPin,
  IconUser,
  IconTemplate,
  IconCheck,
  IconMessage,
  IconBrandWhatsapp,
  IconBrandInstagram,
  IconBrandFacebook,
  IconBrandMessenger,
  IconBrandTelegram,
  IconMail,
  IconForms,
} from "@tabler/icons-react"
import { summarizeSendError } from "@/lib/meta-error-catalog"
import {
  StatusTicks,
  type DeliveryTickStatus,
} from "@/components/crm/status-ticks"
import { UnreadCountPill } from "@/components/crm/unread-count-pill"
import { AwaitingReplyFooter } from "@/components/crm/awaiting-reply-footer"
import { useInboxSettings } from "@/features/conversations-settings/hooks/use-inbox-settings"
import { Chip } from "./chip"
import { CheckboxGlass } from "./checkbox-glass"
import { TagChip } from "./tag-chip"

export type ConversationAvatarColor = "sunset" | "forest" | "ocean" | "dusk"

export type LastMessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "file"
  | "template"
  | "note"
  | "location"
  | "contact"

export interface Conversation {
  id: string
  /** Número sequencial do "ticket" (ex.: #1234) — organização/controle estilo Kommo. */
  number?: number | null
  name: string
  initials: string
  avatarColor: ConversationAvatarColor | "blue" | "teal" | "orange" | "purple" | "pink" | "coral"
  status: "online" | "offline" | "none"
  time: string
  preview: string
  assignee?: string
  active?: boolean
  inactive?: boolean
  urgent?: boolean
  /** Mensagens não lidas — badge numérico no card. */
  unreadCount?: number

  /**
   * @deprecated use `tags` (lista completa) — mantido para compat com
   * adapters/legados que ainda passam apenas o nome da primeira tag.
   */
  tag?: string | null
  tags?: Array<{ id: string; name: string; color?: string | null }>
  /** Id do responsável atual — usado pelo AssigneePopover. */
  assigneeId?: string | null
  /** User.type do responsável (ex.: AI) — Assumir / Devolver à IA. */
  assigneeType?: string | null
  /** Foto (User.avatarUrl) do responsável — usada no UserAvatar do slot. */
  assigneeAvatarUrl?: string | null
  /**
   * Canal de origem da conversa. Quando presente, substitui o status
   * dot pelo logo do canal no canto inferior direito do avatar.
   * Valores reconhecidos: "whatsapp", "instagram", "facebook" / "meta"
   * / "messenger", "telegram", "email", "webchat" / "form".
   */
  channel?: string | null
  /**
   * Tempo restante da janela de 24h da Meta/WhatsApp.
   * - Texto pre-formatado (ex.: "2h 45min", "8min", "Expirada").
   * - `null` ou `undefined` esconde o badge.
   */
  sessionExpiresIn?: string | null
  /** Define a cor do badge de sessao (vermelho se true, ambar/cinza senao). */
  sessionExpired?: boolean
  /** Tipo da ultima mensagem — define o icone exibido antes do preview. */
  lastMessageType?: LastMessageType
  /** Direcao da ultima mensagem — quando "out", prefixa "Você:". */
  lastMessageDirection?: "in" | "out"
  /** Ack de entrega da ultima msg outbound (ticks no preview). */
  lastMessageStatus?: DeliveryTickStatus
  /** Motivo quando lastMessageStatus=failed. */
  lastMessageSendError?: string | null
  /** Conversa finalizada/resolvida — exibe badge visual no card. */
  resolved?: boolean
  /** Fila da inbox para agrupar a lista (entrada, esperando, …). */
  queueTab?: string
}

interface ConversationCardProps {
  conversation: Conversation
  onClick?: () => void
  /**
   * Slot opcional para o popover de troca de responsável. Quando
   * presente, substitui o chip de assignee na linha inferior do card.
   */
  assigneeSlot?: React.ReactNode
  menuSlot?: React.ReactNode
  /**
   * Modo de seleção múltipla (ações em massa). Quando ativo, mostra um
   * checkbox no lugar do avatar-click e o `onClick` de abrir a conversa
   * fica desativado — só o checkbox alterna a seleção (evita abrir a
   * conversa por engano ao tentar marcar várias).
   */
  selectionMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

export const avatarGradients: Record<string, string> = {
  sunset: "linear-gradient(135deg, #FFD580 0%, #FF8FA3 50%, #FF6B9D 100%)",
  forest: "linear-gradient(135deg, #5CC7A9 0%, #2C8A6B 60%, #1F5D49 100%)",
  ocean: "linear-gradient(135deg, #6FA8DC 0%, #3D5A80 60%, #293f5d 100%)",
  dusk: "linear-gradient(135deg, #9F8FDF 0%, #5b6ff5 60%, #3d52e8 100%)",
  blue: "linear-gradient(135deg, #6FA8DC 0%, #3D5A80 60%, #293f5d 100%)",
  teal: "linear-gradient(135deg, #5CC7A9 0%, #2C8A6B 60%, #1F5D49 100%)",
  orange: "linear-gradient(135deg, #FFD580 0%, #FF8FA3 50%, #FF6B9D 100%)",
  coral: "linear-gradient(135deg, #FFD580 0%, #FF8FA3 50%, #FF6B9D 100%)",
  purple: "linear-gradient(135deg, #9F8FDF 0%, #5b6ff5 60%, #3d52e8 100%)",
  pink: "linear-gradient(135deg, #FFB1D6 0%, #FF6B9D 60%, #C13F73 100%)",
}

const typeIconMap: Record<LastMessageType, React.ComponentType<{ size?: number; stroke?: number; className?: string }>> = {
  text: IconPaperclip, // nao usado — text nao renderiza icone
  image: IconPhoto,
  audio: IconMicrophone,
  video: IconVideo,
  document: IconFile,
  file: IconPaperclip,
  template: IconTemplate,
  note: IconPaperclip,
  location: IconMapPin,
  contact: IconUser,
}

const typeLabelMap: Record<LastMessageType, string | null> = {
  text: null,
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  file: "Arquivo",
  template: "Template",
  note: "Nota interna",
  location: "Localização",
  contact: "Contato",
}

/**
 * Mapeia o `channel` string do backend para ícone + cor de fundo do
 * badge no canto inferior direito do avatar. Cores oficiais de cada
 * marca (mantidas em alta saturação porque o badge é minúsculo).
 * Retorna `null` para canais desconhecidos — caller cai no status dot.
 */
export function channelBadge(channel: string | null | undefined): {
  Icon: React.ComponentType<{ size?: number; stroke?: number; className?: string }>;
  bg: string;
  fg: string;
  title: string;
} | null {
  const c = (channel ?? "").toLowerCase().trim();
  if (!c) return null;
  if (c === "whatsapp" || c === "wa")
    return { Icon: IconBrandWhatsapp, bg: "var(--channel-whatsapp)", fg: "#FFFFFF", title: "WhatsApp" };
  if (c === "instagram" || c === "ig")
    return {
      Icon: IconBrandInstagram,
      bg: "linear-gradient(45deg,#F58529 0%,#DD2A7B 50%,#8134AF 100%)",
      fg: "#FFFFFF",
      title: "Instagram",
    };
  if (c === "facebook" || c === "fb")
    return { Icon: IconBrandFacebook, bg: "var(--channel-facebook)", fg: "#FFFFFF", title: "Facebook" };
  if (c === "meta" || c === "messenger")
    return { Icon: IconBrandMessenger, bg: "var(--channel-messenger)", fg: "#FFFFFF", title: "Messenger" };
  if (c === "telegram" || c === "tg")
    return { Icon: IconBrandTelegram, bg: "var(--channel-telegram)", fg: "#FFFFFF", title: "Telegram" };
  if (c === "email" || c === "mail")
    return { Icon: IconMail, bg: "var(--channel-email)", fg: "#FFFFFF", title: "E-mail" };
  if (c === "webchat" || c === "form" || c === "site" || c === "landing")
    return { Icon: IconForms, bg: "var(--channel-webchat)", fg: "#FFFFFF", title: "Formulário" };
  return null;
}


export function ConversationCard({
  conversation,
  onClick,
  assigneeSlot,
  menuSlot,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: ConversationCardProps) {
  // Guarda contra messageType fora do mapa (evita <undefined /> → crash da lista).
  const rawType = conversation.lastMessageType
  const TypeIcon =
    rawType && rawType !== "text" ? typeIconMap[rawType] ?? null : null
  const typeLabel =
    rawType && rawType !== "text" ? typeLabelMap[rawType] ?? null : null
  const isOutgoing = conversation.lastMessageDirection === "out"
  const unread = Number(conversation.unreadCount) || 0
  const hasChannel = Boolean(String(conversation.channel ?? "").trim())
  const { settings: inboxSettings } = useInboxSettings()
  const showInboundSignal =
    inboxSettings.showInboundSignal &&
    conversation.lastMessageDirection === "in" &&
    !conversation.resolved

  function handleCardClick(e: React.MouseEvent<HTMLElement>) {
    if (selectionMode) return
    // Preview/markdown nunca deve navegar: o card só seleciona a conversa.
    const anchor = (e.target as HTMLElement | null)?.closest?.("a")
    if (anchor) e.preventDefault()
    onClick?.()
  }

  return (
    <article
      onClick={handleCardClick}
      onAuxClick={(e) => {
        if ((e.target as HTMLElement | null)?.closest?.("a")) e.preventDefault()
      }}
      className={cn(
        // Borda trocada para `--glass-border-subtle` (0.30 alpha vs 0.55):
        // alinha com a referência v0 que tem cards "flutuando" sem
        // contorno explícito.
        // shrink-0: a lista é flex-col + overflow-y-auto — sem isso, N cards
        // comprimem (flex-shrink:1) em barras cinza uniformes.
        "relative shrink-0 cursor-pointer overflow-hidden rounded-[var(--radius-lg)] border border-transparent shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200",
        // Nao-selecionado: fundo cinza clarinho (mais opaco / menos "branco puro")
        // pra contrastar com o card selecionado. Hover intensifica levemente.
        "bg-[color-mix(in_srgb,var(--glass-bg-overlay)_60%,rgba(148,163,184,0.10))]",
        "hover:bg-[var(--glass-bg-overlay)]",
        // Selecionado: fundo branco + ring inset (ring externo era clipado
        // pelo overflow-y-auto da lista — 1º card perdia a borda de cima).
        conversation.active &&
          "bg-white border-[var(--brand-primary)]/55 ring-2 ring-inset ring-[var(--brand-primary)]/30 shadow-[0_2px_8px_rgba(91,111,245,0.12)] hover:bg-white",
        conversation.inactive && "opacity-70",
        // Marcada (modo seleção): mesmo anel do brand, sem exigir foco/hover.
        selectionMode && selected &&
          "bg-white border-[var(--brand-primary)]/55 ring-2 ring-inset ring-[var(--brand-primary)]/30 hover:bg-white",
      )}
    >
      <div className="px-3 py-2 @max-[280px]:px-2 @max-[280px]:py-1.5">
      {/* Linha 1: checkbox (modo seleção) + avatar + (nome + tempo + preview ao lado).
          items-start alinha o nome no topo do avatar; o preview de 2
          linhas ocupa o espaço ao lado da metade inferior do avatar —
          card mais preenchido/organizado (estilo kanban). */}
      <div className="flex items-start gap-2">
        {selectionMode && (
          <CheckboxGlass
            checked={selected}
            onChange={() => onToggleSelect?.()}
            aria-label={`Selecionar conversa de ${conversation.name}`}
            className="mt-1"
          />
        )}
        <div className="relative shrink-0">
          <ChatAvatar
            user={{
              id: conversation.id,
              name: conversation.name,
            }}
            channel={(conversation.channel as ChatAvatarChannel) ?? null}
            size={AVATAR_SIZE.lg}
          />
          {/* Sem canal: status online/offline no canto (padrão legado). */}
          {!hasChannel && conversation.status !== "none" && (
            <span
              className={cn(
                "absolute bottom-[1px] right-[1px] z-10 h-2 w-2 rounded-full border-2 border-[var(--avatar-ring)]",
                conversation.status === "online"
                  ? "bg-[var(--color-online)]"
                  : "bg-[var(--color-offline)]",
              )}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-display text-[13px] font-bold text-[var(--text-primary)]">
              {conversation.name}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-[var(--text-muted)]">
              {conversation.time}
              <UnreadCountPill count={unread} />
              {unread <= 0 && conversation.urgent && (
                <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[var(--color-danger)] text-white">
                  <IconClock size={7} stroke={3} />
                </span>
              )}
            </span>
          </div>

          {/* Preview — 1 linha, texto plano (não parece link: sem itálico,
              sem âncora). Ícone só indica tipo; clique seleciona o card. */}
          <div className="mt-0.5 flex items-center gap-1 text-[11px] leading-[1.35] text-[var(--text-secondary)] @max-[220px]:hidden">
            {isOutgoing && conversation.lastMessageStatus === "failed" ? (
              <TooltipGlass
                label={
                  summarizeSendError(conversation.lastMessageSendError) ||
                  "Falha no envio"
                }
                side="top"
              >
                <span className="inline-flex shrink-0 not-italic">
                  <StatusTicks status="failed" onLightBg size="card" />
                </span>
              </TooltipGlass>
            ) : null}
            {TypeIcon ? (
              <TypeIcon size={12} className="shrink-0 text-[var(--brand-primary)]" />
            ) : (
              <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[rgba(91,111,245,0.40)] text-[var(--brand-primary)]">
                <IconMessage size={8} />
              </span>
            )}
            <span
              className={cn(
                "pointer-events-none line-clamp-1 flex-1 overflow-hidden text-[var(--text-secondary)]",
                typeLabel && "font-medium",
              )}
            >
              {typeLabel ?? conversation.preview}
            </span>
          </div>
        </div>
      </div>

      {/* Tags de contato — max 2 visíveis, +N para overflow */}
      {conversation.tags && conversation.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 @max-[280px]:hidden">
          {conversation.tags.slice(0, 2).map((t) => (
            <TooltipGlass key={t.id} label={t.name} side="top">
              <TagChip
                name={t.name}
                color={t.color}
                className="max-w-[7.5rem]"
              />
            </TooltipGlass>
          ))}
          {conversation.tags.length > 2 && (
            <TooltipGlass
              label={conversation.tags.slice(2).map((t) => t.name).join(", ")}
              side="top"
            >
              <span className="inline-flex shrink-0 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-1.5 py-px font-display text-[9px] font-bold text-[var(--text-secondary)]">
                +{conversation.tags.length - 2}
              </span>
            </TooltipGlass>
          )}
        </div>
      )}

      {/* Linha 3: assignee + sessao — flex-nowrap evita quebrar em 2 linhas
          quando o nome do responsavel + chip de sessao somam mais largura
          do que a coluna. O chip do assignee trunca com ellipsis. */}
      <div className="mt-1.5 flex min-w-0 flex-nowrap items-center gap-1.5 @max-[220px]:hidden">
        {/* Quando há responsável: exibe label "RESPONSÁVEL" + chip/slot.
            Sem responsável: apenas chip ghost "+Responsável". */}
        <span className="flex min-w-0 flex-1 items-center gap-1">
          {(conversation.assignee || conversation.assigneeId) && (
            <span className="shrink-0 font-display text-[9px] font-bold text-[var(--text-muted)] @max-[280px]:hidden">
              Responsável
            </span>
          )}
          {assigneeSlot ??
            (conversation.assignee ? (
              <Chip variant="brand" className="max-w-full truncate whitespace-nowrap !px-1.5 !py-0 !text-[10px]">
                {conversation.assignee}
              </Chip>
            ) : (
              <Chip variant="ghost" className="max-w-full truncate whitespace-nowrap !px-1.5 !py-0 !text-[10px]">
                +Responsável
              </Chip>
            ))}
        </span>

        {conversation.resolved ? (
          <TooltipGlass label="Conversa encerrada" side="top">
            <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-px font-display text-[9px] font-bold text-emerald-700 v2-dark:text-emerald-300">
              <IconCheck size={9} stroke={3} />
              Encerrada
            </span>
          </TooltipGlass>
        ) : (
          conversation.sessionExpiresIn && (
            <TooltipGlass
              label={conversation.sessionExpired ? "Sessão de 24h da Meta expirada" : "Tempo até expirar a sessão de 24h"}
              side="top"
            >
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 py-px font-display text-[9px] font-bold",
                  conversation.sessionExpired
                    ? "border-[var(--color-danger)]/25 bg-[var(--color-danger)]/[0.10] text-[var(--color-danger-text)]"
                    : "border-[var(--color-lead)]/25 bg-[var(--color-lead-bg)] text-[var(--color-warning-text)]",
                )}
              >
                <IconClock size={9} />
                {conversation.sessionExpiresIn}
              </span>
            </TooltipGlass>
          )
        )}
      </div>

      {/* Rodapé: nº da conversa (ticket) no canto inferior esquerdo, em verde
          — estilo Kommo. Quando encerrada, fica cinza. */}
      {(conversation.number != null || menuSlot) && (
        <div
          className={cn(
            "mt-1 flex items-center justify-between gap-2 font-display text-[10px] font-semibold tabular-nums @max-[260px]:hidden",
            conversation.resolved
              ? "text-[var(--text-muted)]"
              : "text-emerald-600 v2-dark:text-emerald-400",
          )}
        >
          {conversation.number != null ? <span>Conversa Nº {conversation.number}</span> : <span />}
          {menuSlot}
        </div>
      )}
      </div>
      {showInboundSignal ? (
        <AwaitingReplyFooter
          unreadCount={unread}
          className="rounded-b-[var(--radius-lg)] @max-[260px]:justify-center @max-[260px]:px-2 @max-[260px]:py-1 @max-[260px]:[&>span]:sr-only"
        />
      ) : null}
    </article>
  )
}
